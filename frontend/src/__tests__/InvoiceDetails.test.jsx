/**
 * InvoiceDetails.test.jsx
 *
 * Unit tests for the InvoiceDetails page.
 * Covers:
 *   - Loading skeleton while fetching
 *   - Error state when invoice not found
 *   - Invoice parameters render (number, dates, amounts, currency)
 *   - Vendor details render
 *   - Overdue badge when due_date is in the past
 *   - OCR panel rendering when data present
 *   - Timeline rendering (steps, actors, timestamps)
 *   - Role-based action panels:
 *       Manager/Finance → Approve/Reject form visible
 *       Finance/Admin   → Pay panel visible
 *       Employee/Draft  → Submit for Approval button visible
 *       Anyone on terminal states → no action panel
 *   - Approve action calls correct endpoint
 *   - Reject requires a comment
 *   - Pay calls /pay endpoint
 *   - Submit calls /submit endpoint
 *   - Cancel calls /cancel endpoint with confirmation
 *   - Linked expense section renders when present
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

let mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
jest.mock('../lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('../components/StatusBadge', () => ({ status }) => (
  <span data-testid="status-badge">{status}</span>
));
jest.mock('../components/ui/EmptyState', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

import api from '../lib/api';
import InvoiceDetails from '../pages/InvoiceDetails';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INVOICE = {
  id: 'inv_abc',
  invoice_number: 'INV-E2E-001',
  vendor: { name: 'Acme Corp', tax_id: 'GST-123', email: 'billing@acme.com', address: '123 Main St' },
  invoice_date: '2026-08-01',
  due_date: '2026-09-01',
  currency: 'USD',
  subtotal: 900,
  tax_amount: 100,
  total_amount: 1000,
  description: 'Annual software licence',
  approval_status: 'Submitted',
  payment_status: 'Unpaid',
  created_by: 'u_emp',
  created_by_name: 'Alice Employee',
  payment_reference: null,
  document: null,
  ocr_result: null,
  timeline: [
    { step: 'Created',   actor: 'Alice Employee', timestamp: '2026-08-01T09:00:00Z', details: 'Invoice created' },
    { step: 'Submitted', actor: 'Alice Employee', timestamp: '2026-08-01T09:05:00Z', details: 'Submitted for review' },
  ],
};

function makeInvoice(overrides = {}) {
  return { ...BASE_INVOICE, ...overrides };
}

function makeApiResponse(invoiceOverrides = {}, linkedExpense = null) {
  return { data: { invoice: makeInvoice(invoiceOverrides), linked_expense: linkedExpense } };
}

function renderDetails(invoiceId = 'inv_abc') {
  return render(
    <MemoryRouter initialEntries={[`/invoice/${invoiceId}`]}>
      <Routes>
        <Route path="/invoice/:id" element={<InvoiceDetails />} />
        <Route path="/invoices" element={<div data-testid="invoices-page" />} />
        <Route path="/expense/:id" element={<div data-testid="expense-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

const waitForInvoiceLoaded = async () => {
  await waitFor(() => expect(screen.getAllByText('INV-E2E-001').length).toBeGreaterThan(0));
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
  api.get.mockResolvedValue(makeApiResponse());
  api.post.mockResolvedValue({ data: {} });
  mockNavigate.mockClear();
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvoiceDetails — loading state', () => {
  it('shows loading skeleton while fetching', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderDetails();
    expect(screen.getAllByTestId('loading-skeleton')[0]).toBeInTheDocument();
  });
});

describe('InvoiceDetails — error state', () => {
  it('shows error message when API fails', async () => {
    api.get.mockRejectedValueOnce(new Error('Not found'));
    renderDetails();
    await waitFor(() =>
      expect(screen.getByText('Failed to load invoice details.')).toBeInTheDocument()
    );
  });

  it('shows Back to Invoices button on error', async () => {
    api.get.mockRejectedValueOnce(new Error('Not found'));
    renderDetails();
    await waitFor(() => screen.getByText('Failed to load invoice details.'));
    expect(screen.getByText('Back to Invoices')).toBeInTheDocument();
  });
});

describe('InvoiceDetails — invoice parameters', () => {
  it('renders invoice number in the header', async () => {
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getAllByText('INV-E2E-001')[0]).toBeInTheDocument();
  });

  it('renders vendor name', async () => {
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders currency and total amount', async () => {
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/1000\.00/)).toBeInTheDocument();
    expect(screen.getAllByText(/USD/).length).toBeGreaterThan(0);
  });

  it('renders subtotal and tax amount', async () => {
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/900\.00/)).toBeInTheDocument();
    expect(screen.getByText(/100\.00/)).toBeInTheDocument();
  });

  it('renders description when present', async () => {
    renderDetails();
    await waitFor(() => screen.getByText('Annual software licence'));
  });
});

describe('InvoiceDetails — vendor details section', () => {
  it('renders vendor tax ID', async () => {
    renderDetails();
    await waitFor(() => screen.getByText('GST-123'));
  });

  it('renders vendor email', async () => {
    renderDetails();
    await waitFor(() => screen.getByText('billing@acme.com'));
  });
});

describe('InvoiceDetails — overdue badge', () => {
  it('shows Overdue badge when due_date is in the past and invoice is not Paid', async () => {
    api.get.mockResolvedValue(makeApiResponse({ due_date: '2020-01-01', approval_status: 'Submitted' }));
    renderDetails();
    await waitFor(() => expect(screen.getByText('Overdue')).toBeInTheDocument());
  });

  it('does NOT show Overdue badge when invoice is Paid', async () => {
    api.get.mockResolvedValue(makeApiResponse({ due_date: '2020-01-01', approval_status: 'Paid' }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });
});

describe('InvoiceDetails — audit timeline', () => {
  it('renders timeline steps', async () => {
    renderDetails();
    await waitFor(() => screen.getByText('Created'));
    expect(screen.getAllByText('Submitted')[0]).toBeInTheDocument();
  });

  it('renders actor names in the timeline', async () => {
    renderDetails();
    await waitFor(() => screen.getByText('Alice Employee'));
  });
});

describe('InvoiceDetails — OCR panel', () => {
  it('shows "No OCR data" when no ocr_result', async () => {
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/No OCR data/i)).toBeInTheDocument();
  });

  it('shows extracted fields when OCR data present', async () => {
    const ocrResult = {
      overall_confidence: 0.92,
      extracted_fields: {
        vendor: { value: 'Acme Corp', confidence: 0.95 },
        total_amount: { value: 1000, confidence: 0.90 },
      },
    };
    api.get.mockResolvedValue(makeApiResponse({ ocr_result: ocrResult }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/92%/)).toBeInTheDocument();
  });
});

describe('InvoiceDetails — role-based action panels', () => {
  it('shows Approve/Reject panel for Manager on Submitted invoice', async () => {
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/Review Decision/i)).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('shows Approve/Reject panel for Finance on Submitted invoice', async () => {
    mockUser = { role: 'Finance', id: 'u_fin', name: 'Carol Finance' };
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/Review Decision/i)).toBeInTheDocument();
  });

  it('does NOT show Approve/Reject panel for Employee', async () => {
    mockUser = { role: 'Employee', id: 'u_emp', name: 'Alice Employee' };
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.queryByText(/Review Decision/i)).not.toBeInTheDocument();
  });

  it('shows Pay panel for Finance on Approved invoice', async () => {
    mockUser = { role: 'Finance', id: 'u_fin', name: 'Carol Finance' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Approved' }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/Confirm Payment \(Finance\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Payment' })).toBeInTheDocument();
  });

  it('does NOT show Pay panel for Manager', async () => {
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Approved' }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.queryByText('Confirm Payment')).not.toBeInTheDocument();
  });

  it('shows Submit for Approval button for Employee on Draft invoice', async () => {
    mockUser = { role: 'Employee', id: 'u_emp', name: 'Alice Employee' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Draft', created_by: 'u_emp' }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText('Submit for Approval')).toBeInTheDocument();
  });

  it('shows terminal state message when invoice is Paid and user has no actions', async () => {
    mockUser = { role: 'Employee', id: 'u_emp', name: 'Alice Employee' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Paid', created_by: 'u_emp' }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText(/no further actions/i)).toBeInTheDocument();
  });

  it('shows Cancel Invoice badge/button for non-terminal statuses', async () => {
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.getByText('Cancel Invoice')).toBeInTheDocument();
  });

  it('hides Cancel Invoice button for Paid invoices', async () => {
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Paid' }));
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.queryByText('Cancel Invoice')).not.toBeInTheDocument();
  });
});

describe('InvoiceDetails — approve action', () => {
  it('calls POST /approve and refreshes invoice on Confirm Decision', async () => {
    const user = userEvent.setup();
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    renderDetails();
    await waitForInvoiceLoaded();
    // Approve is already selected by default; write a comment
    await user.type(screen.getByPlaceholderText(/Enter review remarks/i), 'Looks good');
    await user.click(screen.getByText('Confirm Decision'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/invoices/inv_abc/approve',
        expect.objectContaining({ action: 'Approved', comments: 'Looks good' })
      )
    );
    // After approve the invoice is re-fetched
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe('InvoiceDetails — reject action', () => {
  it('requires a comment when rejecting', async () => {
    const user = userEvent.setup();
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    renderDetails();
    await waitForInvoiceLoaded();
    // Switch to Reject
    await user.click(screen.getByText('Reject'));
    await user.click(screen.getByText('Confirm Decision'));
    await waitFor(() =>
      expect(screen.getByText(/comment is required when rejecting/i)).toBeInTheDocument()
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('calls POST /reject with comment when rejection is valid', async () => {
    const user = userEvent.setup();
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    renderDetails();
    await waitForInvoiceLoaded();
    await user.click(screen.getByText('Reject'));
    await user.type(screen.getByPlaceholderText(/Enter review remarks/i), 'Missing docs');
    await user.click(screen.getByText('Confirm Decision'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/invoices/inv_abc/reject',
        expect.objectContaining({ action: 'Rejected', comments: 'Missing docs' })
      )
    );
  });
});

describe('InvoiceDetails — pay action', () => {
  beforeEach(() => {
    mockUser = { role: 'Finance', id: 'u_fin', name: 'Carol Finance' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Approved' }));
  });

  it('calls POST /pay on Confirm Payment', async () => {
    const user = userEvent.setup();
    renderDetails();
    await waitForInvoiceLoaded();
    const notesInput = screen.getByPlaceholderText(/Bank transfer|ACH/i);
    await user.type(notesInput, 'ACH-TXN-999');
    await user.click(screen.getByRole('button', { name: 'Confirm Payment' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/invoices/inv_abc/pay',
        expect.objectContaining({ action: 'Paid' })
      )
    );
  });
});

describe('InvoiceDetails — submit action', () => {
  it('calls POST /submit when employee submits a Draft invoice', async () => {
    const user = userEvent.setup();
    mockUser = { role: 'Employee', id: 'u_emp', name: 'Alice Employee' };
    api.get.mockResolvedValue(makeApiResponse({ approval_status: 'Draft', created_by: 'u_emp' }));
    renderDetails();
    await waitFor(() => screen.getByText('Submit for Approval'));
    await user.click(screen.getByText('Submit for Approval'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/invoices/inv_abc/submit')
    );
  });
});

describe('InvoiceDetails — cancel action', () => {
  it('calls POST /cancel after user confirms the dialog', async () => {
    const user = userEvent.setup();
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    window.confirm = jest.fn(() => true);
    renderDetails();
    await waitFor(() => screen.getByText('Cancel Invoice'));
    await user.click(screen.getByText('Cancel Invoice'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/invoices/inv_abc/cancel')
    );
  });

  it('does NOT call /cancel when user cancels the confirmation dialog', async () => {
    const user = userEvent.setup();
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    window.confirm = jest.fn(() => false);
    renderDetails();
    await waitFor(() => screen.getByText('Cancel Invoice'));
    await user.click(screen.getByText('Cancel Invoice'));
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('InvoiceDetails — linked expense', () => {
  it('shows linked expense section when present', async () => {
    const linkedExpense = { id: 'exp_xyz', title: 'Hotel Stay', amount: 500, status: 'Approved' };
    api.get.mockResolvedValue(makeApiResponse({}, linkedExpense));
    mockUser = { role: 'Manager', id: 'u_mgr', name: 'Bob Manager' };
    renderDetails();
    await waitFor(() => screen.getByText('Hotel Stay'));
    expect(screen.getByText('View Expense Details →')).toBeInTheDocument();
  });

  it('does NOT show linked expense section when not present', async () => {
    renderDetails();
    await waitForInvoiceLoaded();
    expect(screen.queryByText('View Expense Details →')).not.toBeInTheDocument();
  });
});
