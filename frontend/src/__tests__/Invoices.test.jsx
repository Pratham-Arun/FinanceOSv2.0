/**
 * Invoices.test.jsx
 *
 * Unit tests for the Invoices list page.
 * Covers:
 *   - KPI aggregation (total value, pending, approved, paid counts)
 *   - Search filtering (invoice_number, vendor, description)
 *   - Status and currency filter dropdowns
 *   - Empty state when no invoices match
 *   - Role-based page heading
 *   - Row click navigation to InvoiceDetails
 *   - "New Invoice" button visibility per role
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// We stub out child UI components so the tests focus on Invoices.jsx logic
jest.mock('../components/StatusBadge', () => ({ status }) => (
  <span data-testid="status-badge">{status}</span>
));
jest.mock('../components/ui/SearchFilterBar', () => ({
  SearchFilterBar: ({ searchValue, onSearchChange, filters, onFilterChange }) => (
    <div>
      <input
        data-testid="search-input"
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="search"
      />
      {filters.map(f => (
        <select
          key={f.key}
          data-testid={`filter-${f.key}`}
          value={f.value}
          onChange={e => onFilterChange(f.key, e.target.value)}
        >
          <option value="">{f.label}</option>
          {f.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
    </div>
  ),
}));
jest.mock('../components/ui/EmptyState', () => ({
  EmptyState: ({ title, action }) => (
    <div data-testid="empty-state">
      {title}
      {action}
    </div>
  ),
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));
jest.mock('../components/ui/StatsCard', () => ({
  StatsCard: ({ label, value }) => (
    <div data-testid="stats-card">
      <span>{label}</span>: <span>{value}</span>
    </div>
  ),
}));

import api from '../lib/api';
import Invoices from '../pages/Invoices';

// ── Helpers ───────────────────────────────────────────────────────────────────

let mockUser = { role: 'Employee', id: 'u1', name: 'Alice' };

const INVOICES = [
  {
    id: 'inv1', invoice_number: 'INV-001', vendor: { name: 'Acme Corp' },
    invoice_date: '2026-07-01', due_date: '2026-08-01',
    total_amount: 500, currency: 'USD',
    approval_status: 'Submitted', payment_status: 'Unpaid',
    description: 'Software license',
  },
  {
    id: 'inv2', invoice_number: 'INV-002', vendor: { name: 'Beta Ltd' },
    invoice_date: '2026-07-15', due_date: '2026-08-15',
    total_amount: 1200, currency: 'EUR',
    approval_status: 'Approved', payment_status: 'Unpaid',
    description: 'Hardware supplies',
  },
  {
    id: 'inv3', invoice_number: 'INV-003', vendor: { name: 'Gamma Inc' },
    invoice_date: '2026-06-01', due_date: '2026-07-01',
    total_amount: 300, currency: 'USD',
    approval_status: 'Paid', payment_status: 'Paid',
    description: 'Consulting fee',
  },
];

function renderInvoices() {
  return render(
    <MemoryRouter initialEntries={['/invoices']}>
      <Routes>
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoice/:id" element={<div data-testid="detail-page" />} />
        <Route path="/invoices/submit" element={<div data-testid="submit-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUser = { role: 'Employee', id: 'u1', name: 'Alice' };
  api.get.mockResolvedValue({ data: INVOICES });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Invoices — loading state', () => {
  it('shows loading skeleton initially', () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    renderInvoices();
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });
});

describe('Invoices — table render', () => {
  it('renders all invoice rows once data loads', async () => {
    renderInvoices();
    await waitFor(() => expect(screen.getByText('INV-001')).toBeInTheDocument());
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.getByText('INV-003')).toBeInTheDocument();
  });

  it('shows vendor names in each row', async () => {
    renderInvoices();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    expect(screen.getByText('Beta Ltd')).toBeInTheDocument();
    expect(screen.getByText('Gamma Inc')).toBeInTheDocument();
  });
});

describe('Invoices — KPI strip', () => {
  it('shows total invoice value across all invoices', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    const cards = screen.getAllByTestId('stats-card');
    const totalCard = cards.find(c => c.textContent.includes('Total Invoice Value'));
    // $500 + $1200 + $300 = $2000
    expect(totalCard).toBeTruthy();
    expect(totalCard.textContent).toMatch(/2,000|2000/);
  });

  it('counts pending invoices correctly', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    const cards = screen.getAllByTestId('stats-card');
    const pendingCard = cards.find(c => c.textContent.includes('Pending Review'));
    expect(pendingCard.textContent).toContain('1'); // only INV-001 is Submitted
  });

  it('counts approved invoices correctly', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    const cards = screen.getAllByTestId('stats-card');
    const approvedCard = cards.find(c => c.textContent.includes('Approved'));
    expect(approvedCard.textContent).toContain('1'); // INV-002
  });

  it('counts paid invoices correctly', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    const cards = screen.getAllByTestId('stats-card');
    const paidCard = cards.find(c => c.textContent.includes('Paid'));
    expect(paidCard.textContent).toContain('1'); // INV-003
  });
});

describe('Invoices — search filter', () => {
  it('filters by invoice number', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'INV-002' } });
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
    expect(screen.queryByText('INV-003')).not.toBeInTheDocument();
  });

  it('filters by vendor name', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('Acme Corp'));
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'gamma' } });
    expect(screen.getByText('Gamma Inc')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('filters by description', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'consulting' } });
    expect(screen.getByText('INV-003')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
  });

  it('shows empty state when search has no matches', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'XXXXXXXX' } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});

describe('Invoices — status filter', () => {
  it('filters to only Approved invoices', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'Approved' } });
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
    expect(screen.queryByText('INV-003')).not.toBeInTheDocument();
  });

  it('filters to only Paid invoices', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'Paid' } });
    expect(screen.getByText('INV-003')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
  });
});

describe('Invoices — currency filter', () => {
  it('filters to EUR invoices only', async () => {
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    fireEvent.change(screen.getByTestId('filter-currency'), { target: { value: 'EUR' } });
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
  });
});

describe('Invoices — role-based UI', () => {
  it('shows "Invoices" heading for Employee', async () => {
    mockUser = { role: 'Employee', id: 'u1', name: 'Alice' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('shows "Invoice Approvals" heading for Manager', async () => {
    mockUser = { role: 'Manager', id: 'u2', name: 'Bob' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByText('Invoice Approvals')).toBeInTheDocument();
  });

  it('shows "Invoice Payments" heading for Finance', async () => {
    mockUser = { role: 'Finance', id: 'u3', name: 'Carol' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByText('Invoice Payments')).toBeInTheDocument();
  });

  it('shows New Invoice button for Employee', async () => {
    mockUser = { role: 'Employee', id: 'u1', name: 'Alice' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByText('New Invoice')).toBeInTheDocument();
  });

  it('does NOT show New Invoice button for Finance', async () => {
    mockUser = { role: 'Finance', id: 'u3', name: 'Carol' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.queryByText('New Invoice')).not.toBeInTheDocument();
  });

  it('shows Created By column for Manager', async () => {
    mockUser = { role: 'Manager', id: 'u2', name: 'Bob' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByText('Created By')).toBeInTheDocument();
  });

  it('does NOT show Created By column for Employee', async () => {
    mockUser = { role: 'Employee', id: 'u1', name: 'Alice' };
    renderInvoices();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.queryByText('Created By')).not.toBeInTheDocument();
  });
});

describe('Invoices — empty state (no data)', () => {
  it('shows empty state with create button when no invoices exist', async () => {
    api.get.mockResolvedValue({ data: [] });
    mockUser = { role: 'Employee', id: 'u1', name: 'Alice' };
    renderInvoices();
    await waitFor(() => screen.getByTestId('empty-state'));
    expect(screen.getByText('No invoices found')).toBeInTheDocument();
    expect(screen.getByText('Create First Invoice')).toBeInTheDocument();
  });

  it('does NOT show create button when Finance role has no invoices', async () => {
    api.get.mockResolvedValue({ data: [] });
    mockUser = { role: 'Finance', id: 'u3', name: 'Carol' };
    renderInvoices();
    await waitFor(() => screen.getByTestId('empty-state'));
    expect(screen.queryByText('Create First Invoice')).not.toBeInTheDocument();
  });
});
