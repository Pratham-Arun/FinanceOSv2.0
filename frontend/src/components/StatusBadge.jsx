import React from 'react';
import { Circle } from 'lucide-react';

const STATUS_CONFIG = {
  // Expense statuses
  Draft:             { label: 'Draft',            color: 'var(--text-tertiary)',   bg: 'rgba(255,255,255,0.05)', border: 'var(--border-default)' },
  Submitted:         { label: 'Submitted',        color: 'var(--indigo-400)',      bg: 'var(--indigo-50)',       border: 'rgba(99,102,241,0.2)' },
  'Under Review':    { label: 'Under Review',     color: 'var(--amber-400)',       bg: 'var(--amber-50)',        border: 'rgba(245,158,11,0.2)' },
  Approved:          { label: 'Approved',         color: 'var(--emerald-400)',     bg: 'var(--emerald-50)',      border: 'rgba(16,185,129,0.2)' },
  Paid:              { label: 'Paid',             color: 'var(--emerald-400)',     bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  Rejected:          { label: 'Rejected',         color: 'var(--crimson-400)',     bg: 'var(--crimson-50)',      border: 'rgba(225,29,72,0.2)' },
  // Invoice-specific statuses
  'Payment Pending': { label: 'Payment Pending',  color: 'var(--violet-400)',      bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.25)' },
  Cancelled:         { label: 'Cancelled',        color: 'var(--text-tertiary)',   bg: 'rgba(255,255,255,0.05)', border: 'var(--border-default)' },
  Unpaid:            { label: 'Unpaid',           color: 'var(--amber-400)',       bg: 'var(--amber-50)',        border: 'rgba(245,158,11,0.2)' },
};

const StatusBadge = ({ status, size = 'md' }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Draft;
  const dotSize = size === 'sm' ? 5 : 6;
  const fontSize = size === 'sm' ? 'var(--text-xs)' : 'var(--text-xs)';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: size === 'sm' ? '2px 7px' : '3px 8px',
      borderRadius: '20px',
      fontSize,
      fontWeight: 500,
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      color: cfg.color,
      backgroundColor: cfg.bg,
      border: `1px solid ${cfg.border}`,
    }}>
      <span style={{
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        backgroundColor: cfg.color,
        flexShrink: 0,
      }} />
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
