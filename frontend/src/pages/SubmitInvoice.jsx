import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Upload, FileText, CheckCircle2, RefreshCw, AlertCircle,
  Building2, XCircle,
} from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_MB = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

const confColor = (v) => {
  if (!v && v !== 0) return {};
  if (v >= 0.9) return { color: 'var(--emerald-400)', background: 'var(--emerald-50)', border: '1px solid rgba(16,185,129,0.2)' };
  if (v >= 0.75) return { color: 'var(--amber-400)', background: 'var(--amber-50)', border: '1px solid rgba(245,158,11,0.2)' };
  return { color: 'var(--crimson-400)', background: 'var(--crimson-50)', border: '1px solid rgba(239,68,68,0.2)' };
};

// ── Main Component ────────────────────────────────────────────────────────────

const SubmitInvoice = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [ocr, setOcr] = useState(null);          // full OCR result from /upload endpoint
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    invoice_number:   '',
    vendor_name:      '',
    vendor_tax_id:    '',
    vendor_email:     '',
    invoice_date:     '',
    due_date:         '',
    currency:         'USD',
    subtotal:         '',
    tax_amount:       '0',
    total_amount:     '',
    description:      '',
  });

  // ── OCR upload ─────────────────────────────────────────────────────────────

  const validateAndUpload = async (f) => {
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Invalid file type. Only JPG, PNG, and PDF files are allowed.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
    setUploading(true);
    setError('');

    try {
      // First create a temporary invoice shell so we have an invoice_id for the OCR record.
      // We create it as Draft with placeholder values, then immediately populate from OCR.
      const ts = Date.now();
      const tempPayload = {
        invoice_number: `DRAFT-${ts}`,
        vendor: { name: 'Pending OCR' },
        invoice_date: new Date().toISOString().split('T')[0],
        subtotal:     0,
        tax_amount:   0,
        total_amount: 0.01,   // satisfies total > 0 validation
        currency:     form.currency || 'USD',
      };
      const createRes = await api.post('/api/invoices', tempPayload);
      const draftId = createRes.data.id;

      // Upload document to the draft invoice
      const fd = new FormData();
      fd.append('file', f);
      const uploadRes = await api.post(
        `/api/invoices/${draftId}/upload`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      const ocrResult = uploadRes.data?.ocr_result || {};
      const ocrData = ocrResult.ocr_data || {};

      const val = (key) => {
        const f = ocrData[key];
        return f?.value ?? null;
      };

      // Auto-populate form from OCR extraction
      setForm(prev => ({
        ...prev,
        invoice_number: val('invoice_number') || prev.invoice_number || `INV-${ts}`,
        vendor_name:    val('vendor')          || prev.vendor_name,
        vendor_tax_id:  val('vendor_tax_id')   || prev.vendor_tax_id,
        invoice_date:   val('transaction_date') || prev.invoice_date,
        due_date:       val('due_date')         || prev.due_date,
        subtotal:       val('subtotal')         != null ? String(val('subtotal')) : prev.subtotal,
        tax_amount:     val('tax_amount')       != null ? String(val('tax_amount')) : prev.tax_amount,
        total_amount:   val('total_amount')     != null ? String(val('total_amount')) : prev.total_amount,
        currency:       val('currency')         || prev.currency,
        _draft_id:      draftId,               // track draft to update instead of create
      }));

      setOcr(uploadRes.data);
    } catch (err) {
      console.error('OCR upload failed:', err);
      setError('OCR scanning failed. Please fill in the details manually.');
    } finally {
      setUploading(false);
    }
  };

  // ── Form handling ──────────────────────────────────────────────────────────

  const handleInput = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
  };

  const buildPayload = () => ({
    invoice_number: form.invoice_number,
    vendor: {
      name:    form.vendor_name,
      tax_id:  form.vendor_tax_id  || undefined,
      email:   form.vendor_email   || undefined,
    },
    invoice_date:  form.invoice_date,
    due_date:      form.due_date   || undefined,
    currency:      form.currency,
    subtotal:      parseFloat(form.subtotal)     || 0,
    tax_amount:    parseFloat(form.tax_amount)   || 0,
    total_amount:  parseFloat(form.total_amount) || 0,
    description:   form.description              || undefined,
  });

  const validate = () => {
    if (!form.invoice_number.trim()) return 'Invoice number is required.';
    if (!form.vendor_name.trim())    return 'Vendor name is required.';
    if (!form.invoice_date)          return 'Invoice date is required.';
    if (!form.total_amount)          return 'Total amount is required.';
    const sub = parseFloat(form.subtotal)   || 0;
    const tax = parseFloat(form.tax_amount) || 0;
    const tot = parseFloat(form.total_amount) || 0;
    if (tot <= 0) return 'Total amount must be greater than zero.';
    if (Math.abs(tot - (sub + tax)) > 0.02) return `Financial mismatch: subtotal (${sub}) + tax (${tax}) ≠ total (${tot}).`;
    return null;
  };

  const handleSubmit = async (isDraft = false) => {
    setError('');
    if (!isDraft) {
      const validationError = validate();
      if (validationError) { setError(validationError); return; }
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();

      if (form._draft_id) {
        // Update the draft we created during OCR then submit
        await api.put(`/api/invoices/${form._draft_id}`, payload);
        if (!isDraft) {
          await api.post(`/api/invoices/${form._draft_id}/submit`);
        }
        navigate('/invoices');
      } else {
        // No OCR draft — create fresh
        const res = await api.post('/api/invoices', payload);
        if (!isDraft) {
          await api.post(`/api/invoices/${res.data.id}/submit`);
        }
        navigate('/invoices');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          New Invoice
        </h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          Upload an invoice document for AI-assisted OCR extraction, then review and submit.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)', alignItems: 'start' }}>

        {/* ── LEFT: Upload zone + OCR confidence ─────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

          {/* Upload zone */}
          <div
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            style={{ minHeight: 220, cursor: 'pointer' }}
            onClick={() => document.getElementById('invoice-file-input').click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
            onDrop={async e => {
              e.preventDefault();
              setIsDragging(false);
              await validateAndUpload(e.dataTransfer.files[0]);
            }}
          >
            <input
              id="invoice-file-input"
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={e => validateAndUpload(e.target.files[0])}
            />

            {uploading ? (
              <>
                <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--indigo-400)' }} />
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>AI OCR Processing…</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                  Extracting vendor, amount, due date, line items…
                </div>
              </>
            ) : file ? (
              <>
                <FileText size={36} style={{ color: 'var(--indigo-400)' }} />
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type.split('/').pop().toUpperCase()} · Click to replace
                </div>
              </>
            ) : (
              <>
                <Upload size={36} style={{ color: isDragging ? 'var(--indigo-400)' : 'var(--text-tertiary)' }} />
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                  {isDragging ? 'Drop invoice here' : 'Upload Invoice Document'}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                  Drag & drop or click to browse
                </div>
                <span className="badge badge-slate" style={{ marginTop: 4 }}>
                  JPG · PNG · PDF · Max 20 MB
                </span>
              </>
            )}
          </div>

          {/* OCR Confidence report */}
          {ocr && (
            <div className="ai-panel">
              <div className="ai-panel-header">
                <CheckCircle2 size={15} style={{ color: ocr.fields_populated ? 'var(--emerald-400)' : 'var(--amber-400)' }} />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {ocr.fields_populated ? 'AI Extraction Complete' : 'Low Confidence — Review Required'}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  ...confColor(ocr.ocr_result?.overall_confidence),
                  padding: '1px 7px',
                  borderRadius: 4,
                }}>
                  {ocr.ocr_result?.overall_confidence
                    ? `${Math.round(ocr.ocr_result.overall_confidence * 100)}%`
                    : '—'}
                </span>
              </div>
              <div className="ai-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Vendor',         ocr.ocr_result?.ocr_data?.vendor],
                  ['Invoice Number', ocr.ocr_result?.ocr_data?.invoice_number],
                  ['Invoice Date',   ocr.ocr_result?.ocr_data?.transaction_date],
                  ['Due Date',       ocr.ocr_result?.ocr_data?.due_date],
                  ['Total Amount',   ocr.ocr_result?.ocr_data?.total_amount],
                  ['Tax Amount',     ocr.ocr_result?.ocr_data?.tax_amount],
                ].filter(([, f]) => f?.value != null).map(([label, field]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 500 }}>{String(field.value)}</span>
                      <span style={{
                        padding: '1px 6px', borderRadius: 4,
                        fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                        ...confColor(field.confidence),
                      }}>
                        {Math.round((field.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
                {ocr.confidence_warning && (
                  <div style={{ padding: '6px 8px', background: 'var(--amber-50)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 'var(--text-xs)', color: 'var(--amber-400)', display: 'flex', gap: 6 }}>
                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    OCR confidence is low. Please verify all extracted fields before submitting.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Invoice form ─────────────────────────────── */}
        <div className="card" style={{ padding: 'var(--sp-6)' }}>
          <div className="section-title" style={{ marginBottom: 'var(--sp-5)' }}>Invoice Details</div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--sp-4)' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

            {/* Invoice Number */}
            <div className="form-group">
              <label className="field-label" htmlFor="invoice_number">Invoice Number *</label>
              <input id="invoice_number" name="invoice_number" type="text" required className="field-input"
                placeholder="e.g. INV-2026-0042" value={form.invoice_number} onChange={handleInput} />
            </div>

            {/* Vendor */}
            <div style={{ padding: '12px', background: 'var(--surface-inset)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Building2 size={12} /> Vendor
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="field-label" htmlFor="vendor_name">Vendor Name *</label>
                <input id="vendor_name" name="vendor_name" type="text" required className="field-input"
                  placeholder="e.g. Acme Technologies Ltd" value={form.vendor_name} onChange={handleInput} />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="field-label" htmlFor="vendor_tax_id">Tax / GST ID</label>
                  <input id="vendor_tax_id" name="vendor_tax_id" type="text" className="field-input"
                    placeholder="GST-XXXXXX" value={form.vendor_tax_id} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label className="field-label" htmlFor="vendor_email">Vendor Email</label>
                  <input id="vendor_email" name="vendor_email" type="email" className="field-input"
                    placeholder="billing@vendor.com" value={form.vendor_email} onChange={handleInput} />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="field-label" htmlFor="invoice_date">Invoice Date *</label>
                <input id="invoice_date" name="invoice_date" type="date" required className="field-input"
                  value={form.invoice_date} onChange={handleInput} />
              </div>
              <div className="form-group">
                <label className="field-label" htmlFor="due_date">Due Date</label>
                <input id="due_date" name="due_date" type="date" className="field-input"
                  value={form.due_date} onChange={handleInput} />
              </div>
            </div>

            {/* Amounts */}
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="field-label" htmlFor="currency">Currency</label>
                <select id="currency" name="currency" className="field-input" value={form.currency} onChange={handleInput}>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="INR">INR — Indian Rupee</option>
                </select>
              </div>
              <div className="form-group">
                <label className="field-label" htmlFor="total_amount">Total Amount *</label>
                <input id="total_amount" name="total_amount" type="number" step="0.01" required className="field-input"
                  placeholder="0.00" value={form.total_amount} onChange={handleInput} />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="field-label" htmlFor="subtotal">Subtotal</label>
                <input id="subtotal" name="subtotal" type="number" step="0.01" className="field-input"
                  placeholder="0.00" value={form.subtotal} onChange={handleInput} />
              </div>
              <div className="form-group">
                <label className="field-label" htmlFor="tax_amount">Tax Amount</label>
                <input id="tax_amount" name="tax_amount" type="number" step="0.01" className="field-input"
                  placeholder="0.00" value={form.tax_amount} onChange={handleInput} />
              </div>
            </div>

            {/* Financial check indicator */}
            {form.subtotal && form.tax_amount && form.total_amount && (() => {
              const sub = parseFloat(form.subtotal) || 0;
              const tax = parseFloat(form.tax_amount) || 0;
              const tot = parseFloat(form.total_amount) || 0;
              const ok = Math.abs(tot - (sub + tax)) <= 0.02;
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 'var(--radius-md)',
                  background: ok ? 'var(--emerald-50)' : 'var(--crimson-50)',
                  border: `1px solid ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  fontSize: 'var(--text-xs)', fontWeight: 500,
                  color: ok ? 'var(--emerald-400)' : 'var(--crimson-400)',
                }}>
                  {ok
                    ? <><CheckCircle2 size={13} /> Subtotal + Tax = Total ✓</>
                    : <><XCircle size={13} /> Mismatch: {sub} + {tax} = {(sub + tax).toFixed(2)}, expected {tot}</>
                  }
                </div>
              );
            })()}

            {/* Description */}
            <div className="form-group">
              <label className="field-label" htmlFor="description">Description</label>
              <textarea id="description" name="description" rows={2} className="field-input"
                placeholder="Purpose, project, or purchase details…"
                value={form.description} onChange={handleInput}
                style={{ resize: 'vertical', fontFamily: 'var(--font-body)' }} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
                className="btn btn-primary btn-md"
                style={{ flex: 1 }}
              >
                {submitting ? 'Submitting…' : 'Submit Invoice'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="btn btn-secondary btn-md"
                style={{ flex: 1 }}
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => navigate('/invoices')}
                className="btn btn-ghost btn-md"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default SubmitInvoice;
