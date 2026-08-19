"""
OCR Service — receipt upload, image preprocessing, Tesseract extraction, and result persistence.

Pipeline:
  validate_file → save_physical_file → preprocess_image → tesseract_service.extract_receipt_data
  → OCRResultsRepository.store → AILogsRepository.log_event → return structured result
"""
import io
import os
import uuid
import datetime
import time
from typing import Dict, Any, Tuple, Optional
from utils.logger import logger
import services.tesseract_service as tesseract_service


class OCRService:
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf"}
    MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB

    # ── Validation ────────────────────────────────────────────────────────────

    def validate_file(self, filename: str, file_size: int) -> Tuple[bool, str]:
        ext = os.path.splitext(filename.lower())[1]
        if ext not in self.ALLOWED_EXTENSIONS:
            return False, f"Unsupported format '{ext}'. Allowed: PNG, JPG, JPEG, PDF"
        if file_size > self.MAX_FILE_SIZE_BYTES:
            return False, f"File size ({file_size / (1024*1024):.1f} MB) exceeds maximum limit of 20 MB"
        return True, "Valid file"

    # ── Physical File Storage ─────────────────────────────────────────────────

    def save_physical_file(self, file_bytes: bytes, filename: str) -> str:
        now = datetime.datetime.now()
        year_str = now.strftime("%Y")
        month_str = now.strftime("%m")
        base_dir = os.path.join("uploads", "receipts", year_str, month_str)
        os.makedirs(base_dir, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
        full_path = os.path.join(base_dir, unique_name)
        with open(full_path, "wb") as f:
            f.write(file_bytes)
        relative_url = f"/uploads/receipts/{year_str}/{month_str}/{unique_name}".replace("\\", "/")
        logger.info("Receipt File Saved", path=full_path, url=relative_url)
        return relative_url

    # ── Image Preprocessing (Task 1.1) ────────────────────────────────────────

    def preprocess_image(self, file_bytes: bytes, filename: str) -> bytes:
        """
        Preprocessing pipeline to maximise Tesseract OCR accuracy:
          EXIF auto-rotate → resize (cap 2000px) → grayscale →
          autocontrast → unsharp-mask sharpen → contrast boost →
          median denoise → Otsu binarisation

        Returns processed PNG bytes; falls back to original bytes on any error.
        """
        try:
            from PIL import Image, ImageOps, ImageFilter, ImageEnhance
            import statistics

            img = Image.open(io.BytesIO(file_bytes))

            # 1. Auto-rotate via EXIF orientation
            img = ImageOps.exif_transpose(img)

            # 2. Resize — cap longest side at 2000 px to normalise DPI
            max_dim = 2000
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

            # 3. Grayscale
            img = img.convert("L")

            # 4. Autocontrast — stretch histogram
            img = ImageOps.autocontrast(img, cutoff=2)

            # 5. Sharpen text edges
            img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))

            # 6. Boost contrast
            img = ImageEnhance.Contrast(img).enhance(1.5)

            # 7. Denoise — median filter removes salt-and-pepper noise from scanned receipts
            img = img.filter(ImageFilter.MedianFilter(size=3))

            # 8. Otsu binarisation — compute optimal threshold from pixel histogram
            #    rather than a fixed 128 cutoff, which misreads low-contrast receipts
            histogram = img.histogram()  # 256-bucket histogram for grayscale
            total_pixels = sum(histogram)
            sum_all = sum(i * histogram[i] for i in range(256))

            best_threshold = 128  # safe fallback
            best_variance  = 0.0
            w_bg = p_bg = 0.0

            for t in range(256):
                w_bg += histogram[t]
                if w_bg == 0:
                    continue
                w_fg = total_pixels - w_bg
                if w_fg == 0:
                    break
                p_bg += t * histogram[t]
                mean_bg = p_bg / w_bg
                mean_fg = (sum_all - p_bg) / w_fg
                variance = (w_bg / total_pixels) * (w_fg / total_pixels) * (mean_bg - mean_fg) ** 2
                if variance > best_variance:
                    best_variance = variance
                    best_threshold = t

            img = img.point(lambda p: 255 if p > best_threshold else 0, "L")

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            processed = buf.getvalue()
            logger.info(
                "Image preprocessing complete",
                original_size=len(file_bytes),
                processed_size=len(processed),
                otsu_threshold=best_threshold,
            )
            return processed

        except Exception as exc:
            logger.warning("Image preprocessing failed, using raw bytes", error=str(exc))
            return file_bytes

    def preprocess_pdf(self, file_bytes: bytes) -> bytes:
        """
        Renders first page of a PDF to an image, then applies the image pipeline.
        Falls back to raw bytes if pdf2image / poppler not available.
        """
        try:
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(file_bytes, dpi=200, first_page=1, last_page=1)
            if not images:
                return file_bytes
            buf = io.BytesIO()
            images[0].save(buf, format="PNG")
            return self.preprocess_image(buf.getvalue(), "page.png")
        except Exception as exc:
            logger.warning("PDF preprocessing failed, using raw bytes", error=str(exc))
            return file_bytes

    def _preprocess(self, file_bytes: bytes, filename: str) -> bytes:
        """Dispatches to image or PDF preprocessing based on extension."""
        ext = os.path.splitext(filename.lower())[1]
        if ext == ".pdf":
            return self.preprocess_pdf(file_bytes)
        return self.preprocess_image(file_bytes, filename)

    # ── Full OCR Pipeline (Tasks 1.3, 1.5) ───────────────────────────────────

    async def process_receipt(
        self,
        file_bytes: bytes,
        filename: str,
        provider_name: Optional[str] = None,   # kept for backward compat, ignored
        expense_id: Optional[str] = None,
        user_id: Optional[str] = None,
        invoice_id: Optional[str] = None,
        doc_type: str = "receipt",
    ) -> Dict[str, Any]:
        """
        Full pipeline: preprocess → Tesseract OCR → store result → log event.

        Pass ``invoice_id`` (and ``doc_type="invoice"``) when processing invoice
        documents — the OCR result is linked to the invoice record in addition
        to (or instead of) an expense record.

        Returns the complete OCR result dict.
        """
        from repositories.ocr_results_repository import ocr_results_repository
        from repositories.ai_logs_repository import ai_logs_repository

        request_id = str(uuid.uuid4())
        start_ms = time.time() * 1000
        relative_url = (
            self.save_physical_file(file_bytes, filename)
            if file_bytes and len(file_bytes) > 0
            else f"/uploads/{filename}"
        )

        try:
            # Preprocess
            processed_bytes = self._preprocess(file_bytes, filename)

            # Extract via Tesseract — pass doc_type so invoice fields are included
            extracted = await tesseract_service.extract_receipt_data(
                processed_bytes, filename, doc_type=doc_type
            )

        except Exception as exc:
            processing_time_ms = round(time.time() * 1000 - start_ms, 1)
            logger.error("OCR extraction failed", filename=filename, error=str(exc))
            await ai_logs_repository.log_event(
                expense_id=expense_id,
                user_id=user_id or "system",
                event_type="OCR_ERROR",
                ocr_data={"filename": filename, "receipt_url": relative_url},
                error=str(exc),
                request_id=request_id,
                latency_ms=processing_time_ms,
            )
            return {
                "status": "error",
                "filename": filename,
                "receipt_url": relative_url,
                "error": f"OCR extraction failed: {str(exc)}",
                "ocr_provider": "unknown",
                "overall_confidence": 0.0,
                "ocr_data": {},
                "request_id": request_id,
                "invoice_id": invoice_id,
            }

        processing_time_ms = round(time.time() * 1000 - start_ms, 1)
        provider_name_used = extracted.get("provider", "FinanceOS OCR Engine")
        overall_conf = extracted.get("overall_confidence", 0.95)
        ocr_data = extracted.get("ocr_data", {})

        # Store in ocr_results collection — include invoice_id when provided
        ocr_doc = {
            "request_id":        request_id,
            "expense_id":        expense_id,
            "invoice_id":        invoice_id,
            "provider":          provider_name_used,
            "raw_text":          extracted.get("raw_text", ""),
            "parsed_fields":     ocr_data,
            "overall_confidence": overall_conf,
            "processing_time_ms": processing_time_ms,
            "receipt_url":       relative_url,
        }
        try:
            await ocr_results_repository.store(ocr_doc)
        except Exception as store_exc:
            logger.warning("Failed to store OCR result", error=str(store_exc))

        # Log the event
        await ai_logs_repository.log_event(
            expense_id=expense_id,
            user_id=user_id or "system",
            event_type="OCR_PROCESSED",
            ocr_data={
                "filename": filename,
                "receipt_url": relative_url,
                "overall_confidence": overall_conf,
                "provider": provider_name_used,
            },
            request_id=request_id,
            latency_ms=processing_time_ms,
        )

        return {
            "status":            "completed",
            "filename":          filename,
            "receipt_url":       relative_url,
            "ocr_provider":      provider_name_used,
            "overall_confidence": overall_conf,
            "ocr_data":          ocr_data,
            "request_id":        request_id,
            "invoice_id":        invoice_id,
        }

    # ── Legacy upload_and_parse (used by server.py /api/expenses/upload) ─────

    async def upload_and_parse(
        self,
        user_id: str,
        filename: str,
        file_bytes: bytes,
        expense_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Entry point for POST /api/expenses/upload.
        Returns {receipt_url, ai_extraction} for backward compatibility.
        """
        from fastapi import HTTPException
        valid, msg = self.validate_file(filename, len(file_bytes))
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

        result = await self.process_receipt(
            file_bytes=file_bytes,
            filename=filename,
            expense_id=expense_id,
            user_id=user_id,
        )

        # Map parsed_fields to the legacy ai_extraction shape expected by SubmitExpense.jsx
        ocr_data = result.get("ocr_data", {})
        ai_extraction = self._map_to_legacy_extraction(ocr_data, result)

        return {
            "receipt_url":  result["receipt_url"],
            "ai_extraction": ai_extraction,
            "ocr_result":   result,   # full structured result for new frontend panels
        }

    def _map_to_legacy_extraction(self, ocr_data: Dict, result: Dict) -> Dict[str, Any]:
        """Maps parsed_fields dict to the flat shape SubmitExpense.jsx expects."""
        def v(field: str, default=None):
            f = ocr_data.get(field, {})
            return f.get("value", default) if isinstance(f, dict) else default

        def c(field: str, default=0.9):
            f = ocr_data.get(field, {})
            return f.get("confidence", default) if isinstance(f, dict) else default

        vendor = v("vendor", "")
        total = v("total_amount", 0.0)
        date = v("transaction_date", datetime.date.today().isoformat())
        category = v("category", "Other")
        invoice = v("invoice_number", "N/A")

        return {
            "vendor":         vendor,
            "invoice_number": invoice,
            "amount":         float(total) if total else 0.0,
            "expense_date":   str(date),
            "category":       str(category),
            "gst_details":    v("tax_amount"),
            "confidence_scores": {
                "vendor":  c("vendor"),
                "amount":  c("total_amount"),
                "date":    c("transaction_date"),
            },
            # Also include the full structured format for the new UI
            "parsed_fields":     ocr_data,
            "overall_confidence": result.get("overall_confidence", 0.95),
            "ocr_provider":      result.get("ocr_provider", ""),
            "request_id":        result.get("request_id", ""),
        }

    # ── Legacy mock kept for tests that assert specific vendor names ──────────

    def mock_ocr_parsing(self, filename: str) -> Dict[str, Any]:
        """Retained for backward compatibility with existing tests only."""
        fn = filename.lower()
        today = datetime.date.today().isoformat()
        if any(k in fn for k in ("uber", "taxi", "cab", "travel")):
            return {"vendor": "Uber Inc.", "invoice_number": "UB-88127", "amount": 24.50,
                    "expense_date": today, "category": "Travel", "gst_details": "GST-123456",
                    "confidence_scores": {"vendor": 0.98, "amount": 0.99, "date": 0.95}}
        if any(k in fn for k in ("starbucks", "meal", "food", "lunch", "dinner", "coffee")):
            return {"vendor": "Starbucks Cafe", "invoice_number": "STB-99128", "amount": 12.80,
                    "expense_date": today, "category": "Meals", "gst_details": None,
                    "confidence_scores": {"vendor": 0.95, "amount": 0.97, "date": 0.92}}
        if any(k in fn for k in ("hotel", "stay", "accommodation", "hilton", "marriott")):
            return {"vendor": "Hilton Hotels", "invoice_number": "HLT-77291", "amount": 320.00,
                    "expense_date": today, "category": "Accommodation", "gst_details": "VAT-992128",
                    "confidence_scores": {"vendor": 0.97, "amount": 0.98, "date": 0.94}}
        if any(k in fn for k in ("supplies", "office", "paper", "notebook")):
            return {"vendor": "Office Depot", "invoice_number": "OD-4421", "amount": 85.00,
                    "expense_date": today, "category": "Supplies", "gst_details": "GST-8812",
                    "confidence_scores": {"vendor": 0.92, "amount": 0.96, "date": 0.89}}
        return {"vendor": "General Merchant Inc.", "invoice_number": "TX-1002", "amount": 45.00,
                "expense_date": today, "category": "Other", "gst_details": None,
                "confidence_scores": {"vendor": 0.85, "amount": 0.90, "date": 0.80}}


ocr_service = OCRService()
