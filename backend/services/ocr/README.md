# services/ocr/ — Dead Code (Phase 1 Artefact)

This directory contains an earlier OCR provider-switching factory pattern that
was superseded before Phase 1 shipped.

**Nothing in this directory is imported or called at runtime.**

The active OCR integration is:
- `services/ocr_service.py` — upload, preprocess (Otsu binarisation), extract, store
- `services/tesseract_service.py` — Tesseract OCR with regex field parser and filename heuristic fallback

## Phase 2 decision

These files should either be deleted before Phase 2 begins (preferred) or kept
only if a multi-provider OCR interface is revived for the Finance AI Core in Stage 7.
Do not reference these files in new code.
