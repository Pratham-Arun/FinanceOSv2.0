import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/ui/EmptyState';
import {
  ArrowLeft, FileText, Building2, Tag, Clock, CheckCircle2, XCircle,
  AlertCircle, Download, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Upload, RefreshCw, CreditCard, ScanLine, HelpCircle, Fingerprint,
  AlertTriangle,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

const fmtTs = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); }
  catch { return iso; }
};

const confColor = (v) => {
  if (!v && v !== 0) return 'var(--text-tertiary)';
  if (v >= 0.9) return 'var(--emerald-400)';
  if (v >= 0.75) return 'var(--amber-400)';
  return 'var(--crimson-400)';
};

// ── SectionCard (matches ExpenseDetails pattern exactly) ──────────────────────

const SectionCard = ({ title, icon, children, style = {}, accent, action }) => (
  <div className="card" style={{ overflow: 'hidden', ...style, ...(accent ? { borderLeft: `3px solid ${accent}` } : {}) }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'var(--sp-3) var(--sp-5)', borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--surface-inset)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{icon}</span>}
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {action && <div>{action}</div>}
    </div>
    <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>{children}</div>
  </div>
);

const InfoRow = ({ label, value, mono = false }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 130 }}>{label}</span>
    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right', fontFamily: mono ? 'var(--font-mono)' : undefined }}>
      {value ?? '—'}
    </span>
  </div>
);


// ── Document Viewer (same as ReceiptViewer in ExpenseDetails) ─────────────────

const DocumentViewer = ({ fileUrl }) => {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const isPdf = fileUrl?.toLowerCase().endsWith('.pdf');
  const fullUrl = fileUrl
    ? (fileUrl.startsWith('http') ? fileUrl : `http://localhost:8000${fileUrl}`)
    : null;

  if (!fileUrl) return (
    <div style={{
      height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, background: 'var(--surface-inset)',
      borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--border-strong)',
      color: 'var(--text-tertiary)',
    }}>
      <FileText size={36} style={{ opacity: 0.4 }} />
      <span style={{ fontSize: 'var(--text-sm)' }}>No invoice document attached</span>
    </div>
  );

  const content = isPdf ? (
    <iframe src={fullUrl} title="Invoice Document" style={{ width: '100%', height: fullscreen ? '80vh' : '100%', border: 'none', borderRadius: 'var(--radius-lg)' }} />
  ) : (
    <img src={fullUrl} alt="Invoice preview"
      style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s ease', maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: 4 }} />
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', background: 'var(--surface-inset)', borderRadius: 'var(--radius-lg)', marginBottom: 8 }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setZoom(z => Math.min(z + 0.25, 3))} title="Zoom in"><ZoomIn size={13} /></button>
        <button className="btn btn-ghost btn-xs" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} title="Zoom out"><ZoomOut size={13} /></button>
        <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', padding: '0 4px' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-ghost btn-xs" onClick={() => setFullscreen(true)} title="Fullscreen"><Maximize2 size={13} /></button>
        <div style={{ flex: 1 }} />
        <a href={fullUrl} download className="btn btn-ghost btn-xs" title="Download"><Download size={13} /></a>
      </div>
      <div style={{ height: 300, overflow: 'auto', background: 'var(--surface-inset)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </div>
      {fullscreen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.90)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ color: '#fff', fontSize: 'var(--text-md)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} /> Invoice Document – Full View
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setFullscreen(false)} style={{ color: '#fff' }}><Minimize2 size={18} /> Close</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{content}</div>
        </div>
      )}
    </div>
  );
};


// ── OCR Fields Panel ──────────────────────────────────────────────────────────

const InvoiceOCRPanel = ({ invoice, ocrResult }) => {
  const ocr = invoice?.ocr_result || ocrResult || {};
  const ocrData = ocr.extracted_fields || ocr.ocr_data || {};
  const overallConf = ocr.overall_confidence ?? null;

  if (!overallConf && Object.keys(ocrData).length === 0) {
    return (
      <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--sp-4)', textAlign: 'center' }}>
        No OCR data — upload a document to extract fields.
      </div>
    );
  }

  const val = (key) => ocrData[key]?.value ?? null;
  const conf = (key) => ocrData[key]?.confidence ?? null;

  const fields = [
    { label: 'Vendor',         value: val('vendor'),           c: conf('vendor') },
    { label: 'Invoice Number', value: val('invoice_number'),   c: conf('invoice_number') },
    { label: 'Invoice Date',   value: val('transaction_date'), c: conf('transaction_date') },
    { label: 'Due Date',       value: val('due_date'),         c: conf('due_date') },
    { label: 'Subtotal',       value: val('subtotal') != null ? `${invoice?.currency || ''} ${val('subtotal')}` : null, c: conf('subtotal') },
    { label: 'Tax Amount',     value: val('tax_amount') != null ? `${invoice?.currency || ''} ${val('tax_amount')}` : null, c: conf('tax_amount') },
    { label: 'Total Amount',   value: val('total_amount') != null ? `${invoice?.currency || ''} ${val('total_amount')}` : null, c: conf('total_amount') },
    { label: 'Vendor Tax ID',  value: val('vendor_tax_id'),    c: conf('vendor_tax_id') },
  ].filter(f => f.value != null);

  const statusLabel = !overallConf ? 'No OCR'
    : overallConf >= 0.85 ? 'High Accuracy OCR'
    : overallConf >= 0.70 ? 'Needs Verification'
    : 'Low Confidence Alert';
  const statusColor = !overallConf ? 'var(--text-tertiary)'
    : overallConf >= 0.85 ? 'var(--emerald-400)'
    : overallConf >= 0.70 ? 'var(--amber-400)'
    : 'var(--crimson-400)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {overallConf !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 'var(--radius-lg)',
          background: overallConf >= 0.80 ? 'var(--emerald-50)' : 'var(--amber-50)',
          border: `1px solid ${overallConf >= 0.80 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Fingerprint size={13} style={{ color: statusColor }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: statusColor }}>{statusLabel}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, color: statusColor }}>
            {Math.round(overallConf * 100)}% Confidence
          </span>
        </div>
      )}
      {fields.map(f => {
        const isLow = f.c !== null && f.c < 0.80;
        return (
          <div key={f.label} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{f.label}</span>
                {isLow && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '1px 5px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: 'var(--amber-400)', fontWeight: 600 }}>
                    <AlertTriangle size={8} /> Review
                  </span>
                )}
              </div>
              {f.c !== null && (
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: confColor(f.c) }}>
                  {Math.round(f.c * 100)}%
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>{String(f.value)}</span>
              {f.c !== null && (
                <div style={{ width: 70, height: 3, background: 'var(--border-default)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${Math.round(f.c * 100)}%`, background: confColor(f.c), borderRadius: 99 }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* Line items */}
      {ocrData.line_items?.value?.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
            Extracted Line Items
          </div>
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {ocrData.line_items.value.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: i < ocrData.line_items.value.length - 1 ? '1px solid var(--border-subtle)' : undefined, fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{item.description} × {item.quantity}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(item.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// ── Invoice Lifecycle Timeline ────────────────────────────────────────────────

const InvoiceTimeline = ({ timeline }) => {
  if (!timeline || timeline.length === 0) return (
    <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--sp-4)' }}>
      No timeline events yet.
    </div>
  );

  return (
    <div className="timeline" style={{ paddingTop: 4 }}>
      {timeline.map((entry, idx) => {
        const isLast = idx === timeline.length - 1;
        const isTerminal = ['Rejected', 'Cancelled', 'Paid'].includes(entry.step);
        const dotClass = entry.step === 'Rejected' || entry.step === 'Cancelled'
          ? 'timeline-dot-error'
          : entry.step === 'Paid'
          ? 'timeline-dot-done'
          : 'timeline-dot-done';

        return (
          <div key={idx} className="timeline-item" style={{ marginBottom: isLast ? 0 : 16 }}>
            <div className="timeline-connector">
              <div className={`timeline-dot ${dotClass}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isTerminal
                  ? entry.step === 'Paid' ? <CheckCircle2 size={16} style={{ color: 'var(--emerald-400)' }} /> : <XCircle size={16} style={{ color: 'var(--crimson-400)' }} />
                  : <CheckCircle2 size={16} style={{ color: 'var(--emerald-400)' }} />
                }
              </div>
              {!isLast && <div className="timeline-line" />}
            </div>
            <div className="timeline-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{entry.step}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>by {entry.actor}</span>
              </div>
              {entry.details && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{entry.details}</div>
              )}
              {entry.timestamp && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {fmtTs(entry.timestamp)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};


// ── Upload Panel (attach document after creation) ─────────────────────────────

const UploadPanel = ({ invoiceId, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFile = async (f) => {
    if (!f) return;
    setUploadError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      await api.post(`/api/invoices/${invoiceId}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploaded();
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {uploadError && (
        <div className="alert alert-error" style={{ fontSize: 'var(--text-xs)' }}>
          <AlertCircle size={13} /> {uploadError}
        </div>
      )}
      <label htmlFor="doc-upload" style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        padding: '8px 12px', borderRadius: 'var(--radius-md)',
        border: '1.5px dashed var(--border-strong)',
        background: 'var(--surface-inset)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-sm)', fontWeight: 500,
        transition: 'border-color var(--transition-fast)',
      }}>
        <input id="doc-upload" type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />
        {uploading
          ? <><RefreshCw size={14} className="animate-spin" style={{ color: 'var(--indigo-400)' }} /> Processing…</>
          : <><Upload size={14} style={{ color: 'var(--indigo-400)' }} /> Attach Invoice Document</>
        }
      </label>
    </div>
  );
};


// ── Main Page Component ────────────────────────────────────────────────────────

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invoice, setInvoice]       = useState(null);
  const [linkedExpense, setLinked]  = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [action, setAction]         = useState('Approved');
  const [comments, setComments]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchInvoice = async () => {
    try {
      const res = await api.get(`/api/invoices/${id}`);
      setInvoice(res.data.invoice);
      setLinked(res.data.linked_expense);
    } catch (e) {
      setError('Failed to load invoice details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoice(); }, [id]);

  // ── Action permissions ─────────────────────────────────────────────────────

  const canApprove = () => {
    if (!invoice) return false;
    if (!['Manager', 'Finance', 'Admin'].includes(user.role)) return false;
    return ['Submitted', 'Under Review'].includes(invoice.approval_status);
  };

  const canPay = () => {
    if (!invoice) return false;
    if (!['Finance', 'Admin'].includes(user.role)) return false;
    return invoice.approval_status === 'Approved';
  };

  const canCancel = () => {
    if (!invoice) return false;
    return !['Paid', 'Rejected', 'Cancelled'].includes(invoice.approval_status);
  };

  const canSubmit = () => {
    if (!invoice) return false;
    return invoice.approval_status === 'Draft' && (
      invoice.created_by === user.id || ['Admin', 'Manager', 'Finance'].includes(user.role)
    );
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApproveReject = async (e) => {
    e.preventDefault();
    setActionError('');
    if (action === 'Rejected' && !comments.trim()) {
      setActionError('A comment is required when rejecting an invoice.');
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = action === 'Approved' ? 'approve' : 'reject';
      await api.post(`/api/invoices/${id}/${endpoint}`, { action, comments });
      await fetchInvoice();
      setComments('');
    } catch (e) {
      setActionError(e.response?.data?.detail || 'Failed to submit decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePay = async () => {
    setActionError('');
    setSubmitting(true);
    try {
      await api.post(`/api/invoices/${id}/pay`, { action: 'Paid', comments: comments || 'Payment confirmed.' });
      await fetchInvoice();
      setComments('');
    } catch (e) {
      setActionError(e.response?.data?.detail || 'Failed to confirm payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitInvoice = async () => {
    setActionError('');
    setSubmitting(true);
    try {
      await api.post(`/api/invoices/${id}/submit`);
      await fetchInvoice();
    } catch (e) {
      setActionError(e.response?.data?.detail || 'Failed to submit invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this invoice? This cannot be undone.')) return;
    setActionError('');
    try {
      await api.post(`/api/invoices/${id}/cancel`);
      await fetchInvoice();
    } catch (e) {
      setActionError(e.response?.data?.detail || 'Failed to cancel invoice.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <div className="skeleton" style={{ height: 40, width: 280 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-5)' }}>
        <LoadingSkeleton rows={5} /><LoadingSkeleton rows={5} />
      </div>
    </div>
  );

  if (error || !invoice) return (
    <div className="card" style={{ padding: 'var(--sp-10)', textAlign: 'center' }}>
      <div style={{ color: 'var(--crimson-400)', fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 12 }}>
        {error || 'Invoice not found'}
      </div>
      <button onClick={() => navigate('/invoices')} className="btn btn-primary btn-md">Back to Invoices</button>
    </div>
  );

  const docUrl = invoice.document?.file_path || null;
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.approval_status !== 'Paid';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <button onClick={() => navigate('/invoices')} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              {invoice.invoice_number}
            </h2>
            <StatusBadge status={invoice.approval_status} />
            {invoice.payment_status && invoice.payment_status !== invoice.approval_status && (
              <StatusBadge status={invoice.payment_status} size="sm" />
            )}
            {isOverdue && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: '99px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--crimson-400)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>
                <AlertCircle size={11} /> Overdue
              </span>
            )}
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
            Invoice Ref: {invoice.id} · {invoice.vendor?.name} · Created by {invoice.created_by_name}
          </p>
        </div>
      </div>

      {/* TOP ROW: Document Viewer + OCR Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
        <SectionCard
          title="Invoice Document"
          icon={<FileText size={13} />}
          action={docUrl && (
            <a href={docUrl.startsWith('http') ? docUrl : `http://localhost:8000${docUrl}`}
              download className="btn btn-ghost btn-xs">
              <Download size={12} /> Download
            </a>
          )}
        >
          <DocumentViewer fileUrl={docUrl} />
          {!docUrl && (
            <div style={{ marginTop: 12 }}>
              <UploadPanel invoiceId={invoice.id} onUploaded={fetchInvoice} />
            </div>
          )}
        </SectionCard>

        <SectionCard title="OCR Field Extraction" icon={<ScanLine size={13} />}
          action={docUrl && (
            <UploadPanel invoiceId={invoice.id} onUploaded={fetchInvoice} />
          )}
        >
          <InvoiceOCRPanel invoice={invoice} />
        </SectionCard>
      </div>

      {/* MAIN WORKSPACE: 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 360px', gap: 'var(--sp-4)', alignItems: 'start' }}>

        {/* LEFT: Invoice Parameters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

          <SectionCard title="Invoice Parameters" icon={<Tag size={13} />}>
            <InfoRow label="Invoice ID"     value={invoice.id} mono />
            <InfoRow label="Invoice Number" value={invoice.invoice_number} mono />
            <InfoRow label="Submitted By"   value={invoice.created_by_name} />
            <InfoRow label="Invoice Date"   value={fmtDate(invoice.invoice_date)} />
            <InfoRow label="Due Date"       value={
              <span style={{ color: isOverdue ? 'var(--crimson-400)' : 'inherit' }}>
                {fmtDate(invoice.due_date)}{isOverdue ? ' (Overdue)' : ''}
              </span>
            } />
            <InfoRow label="Currency"       value={invoice.currency} />
            <InfoRow label="Subtotal"       value={`${invoice.currency} ${(invoice.subtotal || 0).toFixed(2)}`} mono />
            <InfoRow label="Tax Amount"     value={`${invoice.currency} ${(invoice.tax_amount || 0).toFixed(2)}`} mono />
            <InfoRow label="Total Amount"   value={<strong>{invoice.currency} {(invoice.total_amount || 0).toFixed(2)}</strong>} mono />
            <InfoRow label="Approval Status" value={<StatusBadge status={invoice.approval_status} />} />
            <InfoRow label="Payment Status"  value={<StatusBadge status={invoice.payment_status} />} />
            {invoice.payment_reference && (
              <InfoRow label="Payment Ref" value={invoice.payment_reference} mono />
            )}
          </SectionCard>

          <SectionCard title="Vendor Details" icon={<Building2 size={13} />}>
            <InfoRow label="Vendor Name"   value={invoice.vendor?.name} />
            <InfoRow label="Tax / GST ID"  value={invoice.vendor?.tax_id} />
            <InfoRow label="Email"         value={invoice.vendor?.email} />
            <InfoRow label="Address"       value={invoice.vendor?.address} />
          </SectionCard>

          {invoice.description && (
            <SectionCard title="Description" icon={<FileText size={13} />}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{invoice.description}</p>
            </SectionCard>
          )}

          {linkedExpense && (
            <SectionCard title="Linked Expense" icon={<CreditCard size={13} />} accent="var(--indigo-400)">
              <InfoRow label="Expense ID"  value={linkedExpense.id} mono />
              <InfoRow label="Title"       value={linkedExpense.title} />
              <InfoRow label="Amount"      value={fmt(linkedExpense.amount)} mono />
              <InfoRow label="Status"      value={<StatusBadge status={linkedExpense.status} />} />
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--indigo-400)', width: '100%' }}
                  onClick={() => navigate(`/expense/${linkedExpense.id}`)}
                >
                  View Expense Details →
                </button>
              </div>
            </SectionCard>
          )}
        </div>

        {/* CENTER: Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <SectionCard title="Invoice Lifecycle" icon={<Clock size={13} />}>
            <InvoiceTimeline timeline={invoice.timeline} />
          </SectionCard>
        </div>

        {/* RIGHT: Action Panel (sticky) */}
        <div style={{ position: 'sticky', top: 'var(--sp-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

            {/* Approval / Reject actions */}
            {(canApprove()) && (
              <div className="card" style={{ padding: 'var(--sp-5)', border: '1px solid var(--indigo-500)', boxShadow: 'var(--shadow-indigo)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
                  Review Decision ({user.role})
                </div>
                <form onSubmit={handleApproveReject} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                  {actionError && (
                    <div className="alert alert-error">
                      <AlertCircle size={13} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 'var(--text-sm)' }}>{actionError}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    {[
                      { key: 'Approved', label: 'Approve', cls: 'btn-success' },
                      { key: 'Rejected', label: 'Reject',  cls: 'btn-danger'  },
                    ].map(({ key, label, cls }) => (
                      <button key={key} type="button"
                        className={`btn btn-sm ${action === key ? cls : 'btn-ghost'}`}
                        style={{ flex: 1, border: action === key ? undefined : '1px solid var(--border-default)' }}
                        onClick={() => setAction(key)}
                      >
                        {key === 'Approved' ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {label}
                      </button>
                    ))}
                  </div>
                  <div className="form-group">
                    <label className="field-label" htmlFor="inv-comments">
                      Comments {action === 'Rejected' && <span style={{ color: 'var(--crimson-400)' }}>*</span>}
                    </label>
                    <textarea id="inv-comments" className="field-input" rows={3}
                      placeholder="Enter review remarks…"
                      value={comments} onChange={e => setComments(e.target.value)}
                      style={{ resize: 'vertical', fontFamily: 'var(--font-body)' }} />
                  </div>
                  <button type="submit" disabled={submitting} className="btn btn-primary btn-md" style={{ width: '100%' }}>
                    {submitting ? 'Submitting…' : 'Confirm Decision'}
                  </button>
                </form>
              </div>
            )}

            {/* Payment confirmation (Finance/Admin) */}
            {canPay() && (
              <div className="card" style={{ padding: 'var(--sp-5)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                  Confirm Payment ({user.role})
                </div>
                {actionError && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>
                    <AlertCircle size={13} /> <span style={{ fontSize: 'var(--text-sm)' }}>{actionError}</span>
                  </div>
                )}
                <div style={{ padding: '10px', background: 'var(--surface-inset)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
                  <InfoRow label="Vendor"  value={invoice.vendor?.name} />
                  <InfoRow label="Amount"  value={`${invoice.currency} ${(invoice.total_amount || 0).toFixed(2)}`} mono />
                  <InfoRow label="Due"     value={fmtDate(invoice.due_date)} />
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="field-label" htmlFor="pay-notes">Payment Notes</label>
                  <input id="pay-notes" className="field-input" type="text"
                    placeholder="e.g. Bank transfer, ACH reference…"
                    value={comments} onChange={e => setComments(e.target.value)} />
                </div>
                <button
                  disabled={submitting}
                  onClick={handlePay}
                  className="btn btn-success btn-md"
                  style={{ width: '100%' }}
                >
                  <CreditCard size={15} /> {submitting ? 'Processing…' : 'Confirm Payment'}
                </button>
              </div>
            )}

            {/* Submit (Employee / Draft) */}
            {canSubmit() && (
              <div className="card" style={{ padding: 'var(--sp-5)' }}>
                {actionError && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>
                    <AlertCircle size={13} /> <span style={{ fontSize: 'var(--text-sm)' }}>{actionError}</span>
                  </div>
                )}
                <button disabled={submitting} onClick={handleSubmitInvoice} className="btn btn-primary btn-md" style={{ width: '100%' }}>
                  {submitting ? 'Submitting…' : 'Submit for Approval'}
                </button>
              </div>
            )}

            {/* Cancel */}
            {canCancel() && !['Paid', 'Rejected', 'Cancelled'].includes(invoice.approval_status) && (
              <div className="card" style={{ padding: 'var(--sp-4)' }}>
                <button onClick={handleCancel} className="btn btn-ghost btn-sm" style={{ width: '100%', color: 'var(--crimson-400)' }}>
                  <XCircle size={13} /> Cancel Invoice
                </button>
              </div>
            )}

            {/* Invoice is terminal */}
            {['Paid', 'Rejected', 'Cancelled'].includes(invoice.approval_status) && !canApprove() && !canPay() && (
              <div className="card" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                  This invoice is <strong style={{ color: 'var(--text-secondary)' }}>{invoice.approval_status.toLowerCase()}</strong> and no further actions are available.
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetails;
