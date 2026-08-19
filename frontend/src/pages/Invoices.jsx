import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { SearchFilterBar } from '../components/ui/SearchFilterBar';
import { EmptyState, LoadingSkeleton } from '../components/ui/EmptyState';
import { StatsCard } from '../components/ui/StatsCard';
import {
  FileText, DollarSign, Clock, CheckCircle, PlusCircle,
  Building2, AlertCircle,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

// ── Main Component ────────────────────────────────────────────────────────────

const Invoices = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  useEffect(() => {
    api.get('/api/invoices')
      .then(r => setInvoices(r.data))
      .catch(e => console.error('Invoices fetch error:', e))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = user.role !== 'Admin' && user.role !== 'Finance' ? true
    : user.role === 'Admin' ? true : false;

  // KPI strip aggregates
  const totalValue    = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const pendingCount  = invoices.filter(i => ['Submitted', 'Under Review'].includes(i.approval_status)).length;
  const approvedCount = invoices.filter(i => i.approval_status === 'Approved').length;
  const paidCount     = invoices.filter(i => i.approval_status === 'Paid').length;

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.vendor?.name?.toLowerCase().includes(q) ||
      inv.description?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || inv.approval_status === statusFilter;
    const matchCurrency = !currencyFilter || inv.currency === currencyFilter;
    return matchSearch && matchStatus && matchCurrency;
  });

  const isReviewer = ['Manager', 'Finance', 'Admin'].includes(user.role);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <div className="skeleton" style={{ height: 40, width: 200 }} />
      <LoadingSkeleton rows={6} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

      {/* ── Page Header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
            {user.role === 'Finance' ? 'Invoice Payments' :
             user.role === 'Manager' ? 'Invoice Approvals' :
             'Invoices'}
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          </p>
        </div>
        {(user.role === 'Employee' || user.role === 'Admin') && (
          <button onClick={() => navigate('/invoices/submit')} className="btn btn-primary btn-md">
            <PlusCircle size={15} /> New Invoice
          </button>
        )}
      </div>

      {/* ── KPI Strip ─────────────────────────────────────────── */}
      <div className="stats-strip-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatsCard
          label="Total Invoice Value"
          value={fmt(totalValue)}
          icon={<DollarSign size={17} />}
          iconClass="stat-icon-indigo"
          subtext={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
        />
        <StatsCard
          label="Pending Review"
          value={String(pendingCount)}
          icon={<Clock size={17} />}
          iconClass="stat-icon-amber"
          subtext="Awaiting approval"
        />
        <StatsCard
          label="Approved"
          value={String(approvedCount)}
          icon={<CheckCircle size={17} />}
          iconClass="stat-icon-emerald"
          subtext="Ready for payment"
        />
        <StatsCard
          label="Paid"
          value={String(paidCount)}
          icon={<DollarSign size={17} />}
          iconClass="stat-icon-violet"
          subtext="Fully processed"
        />
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <SearchFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by invoice number, vendor, or description…"
          filters={[
            {
              key: 'status', label: 'All Statuses', value: statusFilter,
              options: [
                { value: 'Draft',           label: 'Draft' },
                { value: 'Submitted',       label: 'Submitted' },
                { value: 'Under Review',    label: 'Under Review' },
                { value: 'Approved',        label: 'Approved' },
                { value: 'Payment Pending', label: 'Payment Pending' },
                { value: 'Paid',            label: 'Paid' },
                { value: 'Rejected',        label: 'Rejected' },
                { value: 'Cancelled',       label: 'Cancelled' },
              ],
            },
            {
              key: 'currency', label: 'All Currencies', value: currencyFilter,
              options: [
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
                { value: 'GBP', label: 'GBP' },
                { value: 'INR', label: 'INR' },
              ],
            },
          ]}
          onFilterChange={(key, val) => {
            if (key === 'status')   setStatusFilter(val);
            if (key === 'currency') setCurrencyFilter(val);
          }}
          resultCount={filtered.length}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} />}
            title="No invoices found"
            subtitle={
              search || statusFilter || currencyFilter
                ? 'Try adjusting your filters.'
                : 'No invoices have been created yet.'
            }
            action={
              (user.role === 'Employee' || user.role === 'Admin') ? (
                <button onClick={() => navigate('/invoices/submit')} className="btn btn-primary btn-sm">
                  Create First Invoice
                </button>
              ) : null
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Vendor</th>
                  {isReviewer && <th>Created By</th>}
                  <th>Invoice Date</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="col-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} onClick={() => navigate(`/invoice/${inv.id}`)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {inv.invoice_number}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>{inv.vendor?.name || '—'}</span>
                      </div>
                    </td>
                    {isReviewer && (
                      <td style={{ color: 'var(--text-secondary)' }}>{inv.created_by_name || '—'}</td>
                    )}
                    <td style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                      {fmtDate(inv.invoice_date)}
                    </td>
                    <td style={{
                      fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
                      color: inv.due_date && new Date(inv.due_date) < new Date() && inv.approval_status !== 'Paid'
                        ? 'var(--crimson-400)' : 'var(--text-tertiary)',
                    }}>
                      {fmtDate(inv.due_date)}
                      {inv.due_date && new Date(inv.due_date) < new Date() && inv.approval_status !== 'Paid' && (
                        <AlertCircle size={11} style={{ marginLeft: 4, display: 'inline' }} />
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {inv.currency} {fmt(inv.total_amount).replace('$', '')}
                    </td>
                    <td><StatusBadge status={inv.approval_status} /></td>
                    <td><StatusBadge status={inv.payment_status} size="sm" /></td>
                    <td className="col-right">
                      <button className="btn btn-ghost btn-xs row-actions" style={{ color: 'var(--indigo-400)' }}>
                        Review →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Invoices;
