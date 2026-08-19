/**
 * SubmitInvoice.test.jsx
 *
 * Unit tests for the SubmitInvoice form page.
 * Covers:
 *   - Initial render (upload zone visible, form fields empty)
 *   - Client-side validation: required fields, total > 0, subtotal+tax≈total
 *   - Financial mismatch indicator (live inline check)
 *   - Successful submission flow (no OCR draft)
 *   - Save as Draft flow
 *   - Cancel navigation
 *   - Error display when API rejects
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
    post: jest.fn(),
    put: jest.fn(),
  },
}));

import api from '../lib/api';
import SubmitInvoice from '../pages/SubmitInvoice';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSubmitInvoice() {
  return render(
    <MemoryRouter initialEntries={['/invoices/submit']}>
      <Routes>
        <Route path="/invoices/submit" element={<SubmitInvoice />} />
        <Route path="/invoices" element={<div data-testid="invoices-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Fill in the minimum required fields for a valid submission. */
async function fillValidForm(user) {
  await user.type(screen.getByLabelText(/Invoice Number/i), 'INV-TEST-001');
  await user.type(screen.getByLabelText(/Vendor Name/i), 'Test Vendor');
  await user.type(screen.getByLabelText(/Invoice Date/i), '2026-08-01');
  await user.clear(screen.getByLabelText(/Total Amount/i));
  await user.type(screen.getByLabelText(/Total Amount/i), '100');
  await user.clear(screen.getByLabelText(/Subtotal/i));
  await user.type(screen.getByLabelText(/Subtotal/i), '90');
  await user.clear(screen.getByLabelText(/Tax Amount/i));
  await user.type(screen.getByLabelText(/Tax Amount/i), '10');
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  api.post.mockResolvedValue({ data: { id: 'inv_new_123' } });
  api.put.mockResolvedValue({ data: {} });
  mockNavigate.mockClear();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubmitInvoice — initial render', () => {
  it('renders the upload zone', () => {
    renderSubmitInvoice();
    expect(screen.getByText(/Upload Invoice Document/i)).toBeInTheDocument();
  });

  it('renders all required form fields', () => {
    renderSubmitInvoice();
    expect(screen.getByLabelText(/Invoice Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vendor Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Invoice Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Total Amount/i)).toBeInTheDocument();
  });

  it('Submit and Save as Draft buttons are present', () => {
    renderSubmitInvoice();
    expect(screen.getByText('Submit Invoice')).toBeInTheDocument();
    expect(screen.getByText('Save as Draft')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});

describe('SubmitInvoice — validation', () => {
  it('shows error when Invoice Number is missing', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText(/Invoice number is required/i)).toBeInTheDocument()
    );
  });

  it('shows error when Vendor Name is missing', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.type(screen.getByLabelText(/Invoice Number/i), 'INV-001');
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText(/Vendor name is required/i)).toBeInTheDocument()
    );
  });

  it('shows error when Invoice Date is missing', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.type(screen.getByLabelText(/Invoice Number/i), 'INV-001');
    await user.type(screen.getByLabelText(/Vendor Name/i), 'Vendor');
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText(/Invoice date is required/i)).toBeInTheDocument()
    );
  });

  it('shows error when total amount is zero', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.type(screen.getByLabelText(/Invoice Number/i), 'INV-001');
    await user.type(screen.getByLabelText(/Vendor Name/i), 'Vendor');
    await user.type(screen.getByLabelText(/Invoice Date/i), '2026-08-01');
    await user.clear(screen.getByLabelText(/Total Amount/i));
    await user.type(screen.getByLabelText(/Total Amount/i), '0');
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText(/Total amount must be greater than zero/i)).toBeInTheDocument()
    );
  });

  it('shows financial mismatch error when subtotal + tax ≠ total', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.type(screen.getByLabelText(/Invoice Number/i), 'INV-001');
    await user.type(screen.getByLabelText(/Vendor Name/i), 'Vendor');
    await user.type(screen.getByLabelText(/Invoice Date/i), '2026-08-01');
    await user.clear(screen.getByLabelText(/Total Amount/i));
    await user.type(screen.getByLabelText(/Total Amount/i), '100');
    await user.clear(screen.getByLabelText(/Subtotal/i));
    await user.type(screen.getByLabelText(/Subtotal/i), '50');
    await user.clear(screen.getByLabelText(/Tax Amount/i));
    await user.type(screen.getByLabelText(/Tax Amount/i), '10');
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText(/Financial mismatch/i)).toBeInTheDocument()
    );
  });
});

describe('SubmitInvoice — live financial mismatch indicator', () => {
  it('shows green check when subtotal + tax = total', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.clear(screen.getByLabelText(/Total Amount/i));
    await user.type(screen.getByLabelText(/Total Amount/i), '110');
    await user.clear(screen.getByLabelText(/Subtotal/i));
    await user.type(screen.getByLabelText(/Subtotal/i), '100');
    await user.clear(screen.getByLabelText(/Tax Amount/i));
    await user.type(screen.getByLabelText(/Tax Amount/i), '10');
    await waitFor(() =>
      expect(screen.getByText(/Subtotal \+ Tax = Total ✓/i)).toBeInTheDocument()
    );
  });

  it('shows red mismatch when subtotal + tax ≠ total', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.clear(screen.getByLabelText(/Total Amount/i));
    await user.type(screen.getByLabelText(/Total Amount/i), '999');
    await user.clear(screen.getByLabelText(/Subtotal/i));
    await user.type(screen.getByLabelText(/Subtotal/i), '100');
    await user.clear(screen.getByLabelText(/Tax Amount/i));
    await user.type(screen.getByLabelText(/Tax Amount/i), '10');
    await waitFor(() =>
      expect(screen.getByText(/Mismatch/i)).toBeInTheDocument()
    );
  });
});

describe('SubmitInvoice — successful submission (no OCR)', () => {
  it('calls POST /api/invoices and POST /submit, then navigates to /invoices', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await fillValidForm(user);
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/invoices', expect.objectContaining({
        invoice_number: 'INV-TEST-001',
        vendor: expect.objectContaining({ name: 'Test Vendor' }),
        total_amount: 100,
      }));
    });
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/invoices/inv_new_123/submit')
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/invoices'));
  });
});

describe('SubmitInvoice — Save as Draft', () => {
  it('calls POST /api/invoices but NOT /submit, then navigates to /invoices', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    // Only need Invoice Number for a draft (skips full validation)
    await user.type(screen.getByLabelText(/Invoice Number/i), 'DRAFT-001');
    await user.click(screen.getByText('Save as Draft'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/invoices', expect.any(Object));
    });
    // submit endpoint should NOT have been called
    const submitCall = api.post.mock.calls.find(c => c[0].includes('/submit'));
    expect(submitCall).toBeUndefined();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/invoices'));
  });
});

describe('SubmitInvoice — API error handling', () => {
  it('shows API error message when submit fails', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { detail: 'Duplicate invoice detected.' } },
    });
    const user = userEvent.setup();
    renderSubmitInvoice();
    await fillValidForm(user);
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText('Duplicate invoice detected.')).toBeInTheDocument()
    );
  });

  it('shows fallback error when no detail provided', async () => {
    api.post.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    renderSubmitInvoice();
    await fillValidForm(user);
    await user.click(screen.getByText('Submit Invoice'));
    await waitFor(() =>
      expect(screen.getByText('Failed to save invoice.')).toBeInTheDocument()
    );
  });
});

describe('SubmitInvoice — Cancel button', () => {
  it('navigates back to /invoices on Cancel', async () => {
    const user = userEvent.setup();
    renderSubmitInvoice();
    await user.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/invoices');
  });
});
