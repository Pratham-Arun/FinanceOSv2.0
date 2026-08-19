"""
Stage 2 Invoice Domain Tests

Covers:
  - CRUD operations
  - Lifecycle / state machine
  - Financial validation
  - Duplicate detection
  - Role-based authorization
  - Expense link
  - Timeline endpoint
  - Phase 1 regression (existing 57 tests must still pass)

Run: uv run pytest tests/test_invoice_domain.py -v
"""
import time
import pytest
from fastapi.testclient import TestClient
from server import app


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, email: str, password: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture(scope="module")
def emp_h(client):
    return _login(client, "employee@demo.com", "demo1234")


@pytest.fixture(scope="module")
def mgr_h(client):
    return _login(client, "manager@demo.com", "demo1234")


@pytest.fixture(scope="module")
def fin_h(client):
    return _login(client, "finance@demo.com", "demo1234")


@pytest.fixture(scope="module")
def adm_h(client):
    return _login(client, "admin@demo.com", "admin123")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _invoice_payload(overrides: dict = None) -> dict:
    """Returns a minimal valid invoice payload."""
    ts = time.time_ns()
    base = {
        "invoice_number": f"INV-TEST-{ts}",
        "vendor": {
            "name":   "ABC Technologies Ltd",
            "tax_id": "GST-12345",
            "email":  "billing@abc.example.com",
        },
        "invoice_date": "2026-07-15",
        "due_date":     "2026-08-15",
        "currency":     "USD",
        "subtotal":     1000.00,
        "tax_amount":   100.00,
        "total_amount": 1100.00,
        "description":  "Software licensing invoice",
    }
    if overrides:
        base.update(overrides)
    return base


def _create(client, headers: dict, overrides: dict = None) -> dict:
    """Creates an invoice and returns the response body."""
    res = client.post("/api/invoices", json=_invoice_payload(overrides), headers=headers)
    assert res.status_code == 200, f"Invoice creation failed: {res.text}"
    return res.json()


# ── 1. CRUD ───────────────────────────────────────────────────────────────────

class TestInvoiceCRUD:

    def test_create_invoice_returns_draft(self, client, emp_h):
        inv = _create(client, emp_h)
        assert inv["id"].startswith("inv_")
        assert inv["approval_status"] == "Draft"
        assert inv["payment_status"] == "Unpaid"
        assert "_id" not in inv

    def test_create_stores_vendor_correctly(self, client, emp_h):
        inv = _create(client, emp_h)
        assert inv["vendor"]["name"] == "ABC Technologies Ltd"
        assert inv["vendor"]["tax_id"] == "GST-12345"

    def test_get_invoice_by_id(self, client, emp_h):
        inv = _create(client, emp_h)
        res = client.get(f"/api/invoices/{inv['id']}", headers=emp_h)
        assert res.status_code == 200
        data = res.json()
        assert data["invoice"]["id"] == inv["id"]

    def test_get_nonexistent_invoice_returns_404(self, client, emp_h):
        res = client.get("/api/invoices/inv_does_not_exist", headers=emp_h)
        assert res.status_code == 404

    def test_list_invoices_returns_list(self, client, emp_h):
        _create(client, emp_h)
        res = client.get("/api/invoices", headers=emp_h)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_list_invoices_pagination(self, client, emp_h):
        for _ in range(3):
            _create(client, emp_h)
        res = client.get("/api/invoices?page=1&limit=2", headers=emp_h)
        assert res.status_code == 200
        assert len(res.json()) <= 2

    def test_update_draft_invoice(self, client, emp_h):
        inv = _create(client, emp_h)
        res = client.put(
            f"/api/invoices/{inv['id']}",
            json={"description": "Updated description"},
            headers=emp_h,
        )
        assert res.status_code == 200
        assert res.json()["description"] == "Updated description"

    def test_delete_draft_invoice(self, client, emp_h):
        inv = _create(client, emp_h)
        del_res = client.delete(f"/api/invoices/{inv['id']}", headers=emp_h)
        assert del_res.status_code == 200
        # Confirm deleted
        get_res = client.get(f"/api/invoices/{inv['id']}", headers=emp_h)
        assert get_res.status_code == 404

    def test_cannot_delete_submitted_invoice(self, client, emp_h):
        inv = _create(client, emp_h)
        client.post(f"/api/invoices/{inv['id']}/submit", headers=emp_h)
        res = client.delete(f"/api/invoices/{inv['id']}", headers=emp_h)
        assert res.status_code == 400

    def test_cannot_update_submitted_invoice(self, client, emp_h):
        inv = _create(client, emp_h)
        client.post(f"/api/invoices/{inv['id']}/submit", headers=emp_h)
        res = client.put(
            f"/api/invoices/{inv['id']}",
            json={"description": "Trying to edit submitted"},
            headers=emp_h,
        )
        assert res.status_code == 400


# ── 2. Financial Validation ───────────────────────────────────────────────────

class TestFinancialValidation:

    def test_subtotal_plus_tax_must_equal_total(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "subtotal":     1000.00,
            "tax_amount":   100.00,
            "total_amount": 999.00,   # wrong: should be 1100
        }), headers=emp_h)
        assert res.status_code == 422

    def test_total_must_be_positive(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "subtotal":     0.00,
            "tax_amount":   0.00,
            "total_amount": 0.00,
        }), headers=emp_h)
        assert res.status_code == 422

    def test_negative_amounts_rejected(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "subtotal":     -500.00,
            "tax_amount":   0.00,
            "total_amount": -500.00,
        }), headers=emp_h)
        assert res.status_code == 422

    def test_two_cent_tolerance_accepted(self, client, emp_h):
        """subtotal + tax within 2-cent rounding tolerance should pass."""
        res = client.post("/api/invoices", json=_invoice_payload({
            "subtotal":     100.00,
            "tax_amount":   18.00,
            "total_amount": 118.01,   # 1-cent rounding
        }), headers=emp_h)
        assert res.status_code == 200

    def test_future_invoice_date_rejected(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "invoice_date": "2030-01-01",
        }), headers=emp_h)
        assert res.status_code == 422

    def test_due_date_before_invoice_date_rejected(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "invoice_date": "2026-07-15",
            "due_date":     "2026-07-01",   # before invoice_date
        }), headers=emp_h)
        assert res.status_code == 422

    def test_invoice_older_than_180_days_rejected(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "invoice_date": "2020-01-01",
        }), headers=emp_h)
        assert res.status_code == 422


# ── 3. Duplicate Detection ────────────────────────────────────────────────────

class TestDuplicateInvoiceDetection:

    def test_duplicate_invoice_number_same_vendor_rejected(self, client, emp_h):
        payload = _invoice_payload()
        first = client.post("/api/invoices", json=payload, headers=emp_h)
        assert first.status_code == 200

        # Same invoice_number + same vendor → 409
        second = client.post("/api/invoices", json=payload, headers=emp_h)
        assert second.status_code == 409

    def test_same_invoice_number_different_vendor_allowed(self, client, emp_h):
        ts = time.time_ns()
        inv_num = f"INV-SHARED-{ts}"

        p1 = _invoice_payload({"invoice_number": inv_num,
                                "vendor": {"name": "Vendor Alpha"}})
        p2 = _invoice_payload({"invoice_number": inv_num,
                                "vendor": {"name": "Vendor Beta"}})

        r1 = client.post("/api/invoices", json=p1, headers=emp_h)
        r2 = client.post("/api/invoices", json=p2, headers=emp_h)
        assert r1.status_code == 200
        assert r2.status_code == 200

    def test_different_invoice_numbers_same_vendor_allowed(self, client, emp_h):
        ts = time.time_ns()
        r1 = client.post("/api/invoices", json=_invoice_payload({
            "invoice_number": f"INV-A-{ts}",
            "vendor": {"name": "Shared Vendor Ltd"},
        }), headers=emp_h)
        r2 = client.post("/api/invoices", json=_invoice_payload({
            "invoice_number": f"INV-B-{ts}",
            "vendor": {"name": "Shared Vendor Ltd"},
        }), headers=emp_h)
        assert r1.status_code == 200
        assert r2.status_code == 200


# ── 4. Lifecycle / State Machine ──────────────────────────────────────────────

class TestInvoiceLifecycle:

    def test_full_happy_path_draft_to_paid(self, client, emp_h, mgr_h, fin_h):
        # Create
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        assert inv["approval_status"] == "Draft"

        # Submit
        sub = client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        assert sub.status_code == 200
        assert sub.json()["approval_status"] == "Submitted"

        # Approve
        appr = client.post(f"/api/invoices/{inv_id}/approve",
                           json={"action": "Approved", "comments": "Looks good"},
                           headers=mgr_h)
        assert appr.status_code == 200
        assert appr.json()["approval_status"] == "Approved"

        # Pay
        pay = client.post(f"/api/invoices/{inv_id}/pay",
                          json={"action": "Paid", "comments": "Payment sent"},
                          headers=fin_h)
        assert pay.status_code == 200
        result = pay.json()
        assert result["approval_status"] == "Paid"
        assert result["payment_status"] == "Paid"
        assert result["payment_reference"].startswith("TXN-INV-")

    def test_reject_from_submitted(self, client, emp_h, mgr_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        res = client.post(f"/api/invoices/{inv_id}/reject",
                          json={"action": "Rejected", "comments": "Wrong amount"},
                          headers=mgr_h)
        assert res.status_code == 200
        assert res.json()["approval_status"] == "Rejected"

    def test_cancel_from_draft(self, client, emp_h):
        inv = _create(client, emp_h)
        res = client.post(f"/api/invoices/{inv['id']}/cancel", headers=emp_h)
        assert res.status_code == 200
        assert res.json()["approval_status"] == "Cancelled"

    def test_invalid_transition_paid_to_draft(self, client, emp_h, mgr_h, fin_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        client.post(f"/api/invoices/{inv_id}/approve",
                    json={"action": "Approved", "comments": "OK"}, headers=mgr_h)
        client.post(f"/api/invoices/{inv_id}/pay",
                    json={"action": "Paid", "comments": "Paid"}, headers=fin_h)
        # Cannot submit a Paid invoice
        res = client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        assert res.status_code == 400

    def test_invalid_transition_rejected_to_paid(self, client, emp_h, mgr_h, fin_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        client.post(f"/api/invoices/{inv_id}/reject",
                    json={"action": "Rejected", "comments": "Rejected"}, headers=mgr_h)
        res = client.post(f"/api/invoices/{inv_id}/pay",
                          json={"action": "Paid", "comments": "Trying to pay rejected"},
                          headers=fin_h)
        assert res.status_code == 400

    def test_cannot_approve_draft_invoice(self, client, emp_h, mgr_h):
        """Approve requires current status = Submitted or Under Review."""
        inv = _create(client, emp_h)
        res = client.post(f"/api/invoices/{inv['id']}/approve",
                          json={"action": "Approved", "comments": "Skipping submit"},
                          headers=mgr_h)
        assert res.status_code == 400


# ── 5. Timeline ───────────────────────────────────────────────────────────────

class TestInvoiceTimeline:

    def test_timeline_contains_created_entry(self, client, emp_h):
        inv = _create(client, emp_h)
        res = client.get(f"/api/invoices/{inv['id']}/timeline", headers=emp_h)
        assert res.status_code == 200
        steps = res.json()["timeline"]
        assert any(s["step"] == "Created" for s in steps)

    def test_timeline_grows_with_lifecycle(self, client, emp_h, mgr_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        client.post(f"/api/invoices/{inv_id}/approve",
                    json={"action": "Approved", "comments": "OK"}, headers=mgr_h)

        res = client.get(f"/api/invoices/{inv_id}/timeline", headers=emp_h)
        steps = [s["step"] for s in res.json()["timeline"]]
        assert "Created"  in steps
        assert "Submitted" in steps
        assert "Approved"  in steps


# ── 6. Role-Based Authorization ───────────────────────────────────────────────

class TestInvoiceAuthorization:

    def test_unauthenticated_request_rejected(self, client, emp_h):
        inv = _create(client, emp_h)
        res = client.get(f"/api/invoices/{inv['id']}")
        assert res.status_code in (401, 403)

    def test_invalid_token_rejected(self, client):
        res = client.get("/api/invoices",
                         headers={"Authorization": "Bearer not.a.real.token"})
        assert res.status_code == 401

    def test_employee_cannot_view_other_employees_invoice(self, client):
        # Register a second employee
        email2 = f"inv_emp2_{time.time_ns()}@test.com"
        reg = client.post("/api/auth/register", json={
            "name": "Invoice Emp 2", "email": email2,
            "password": "pass1234", "role": "Employee",
        })
        emp2_h = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        emp1_h = _login(client, "employee@demo.com", "demo1234")
        inv = _create(client, emp1_h)

        res = client.get(f"/api/invoices/{inv['id']}", headers=emp2_h)
        assert res.status_code == 403

    def test_employee_cannot_approve_invoice(self, client, emp_h):
        inv = _create(client, emp_h)
        client.post(f"/api/invoices/{inv['id']}/submit", headers=emp_h)
        res = client.post(f"/api/invoices/{inv['id']}/approve",
                          json={"action": "Approved", "comments": "Self-approve"},
                          headers=emp_h)
        assert res.status_code == 403

    def test_employee_cannot_pay_invoice(self, client, emp_h, mgr_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        client.post(f"/api/invoices/{inv_id}/approve",
                    json={"action": "Approved", "comments": "OK"}, headers=mgr_h)
        res = client.post(f"/api/invoices/{inv_id}/pay",
                          json={"action": "Paid", "comments": "Self-pay"},
                          headers=emp_h)
        assert res.status_code == 403

    def test_manager_can_approve_invoice(self, client, emp_h, mgr_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        res = client.post(f"/api/invoices/{inv_id}/approve",
                          json={"action": "Approved", "comments": "Looks correct"},
                          headers=mgr_h)
        assert res.status_code == 200

    def test_finance_can_pay_approved_invoice(self, client, emp_h, mgr_h, fin_h):
        inv = _create(client, emp_h)
        inv_id = inv["id"]
        client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        client.post(f"/api/invoices/{inv_id}/approve",
                    json={"action": "Approved", "comments": "OK"}, headers=mgr_h)
        res = client.post(f"/api/invoices/{inv_id}/pay",
                          json={"action": "Paid", "comments": "Cleared"},
                          headers=fin_h)
        assert res.status_code == 200
        assert res.json()["payment_reference"].startswith("TXN-INV-")

    def test_admin_can_delete_any_invoice(self, client, emp_h, adm_h):
        inv = _create(client, emp_h)
        res = client.delete(f"/api/invoices/{inv['id']}", headers=adm_h)
        assert res.status_code == 200

    def test_manager_sees_all_invoices(self, client, emp_h, mgr_h):
        _create(client, emp_h)
        res = client.get("/api/invoices", headers=mgr_h)
        assert res.status_code == 200
        assert isinstance(res.json(), list)
        assert len(res.json()) >= 1

    def test_finance_sees_all_invoices(self, client, emp_h, fin_h):
        _create(client, emp_h)
        res = client.get("/api/invoices", headers=fin_h)
        assert res.status_code == 200


# ── 7. Expense Link ───────────────────────────────────────────────────────────

class TestInvoiceExpenseLink:

    def test_invoice_can_link_to_existing_expense(self, client, emp_h):
        # Create an expense first
        exp_res = client.post("/api/expenses", json={
            "title":        "Software Purchase",
            "category":     "Supplies",
            "amount":       1100.00,
            "expense_date": "2026-07-15",
            "description":  "Software licence",
            "status":       "Draft",
        }, headers=emp_h)
        exp_id = exp_res.json()["id"]

        inv = _create(client, emp_h, {"linked_expense_id": exp_id})
        assert inv["linked_expense_id"] == exp_id

        # GET should return linked expense
        res = client.get(f"/api/invoices/{inv['id']}", headers=emp_h)
        assert res.status_code == 200
        linked = res.json().get("linked_expense")
        assert linked is not None
        assert linked["id"] == exp_id

    def test_invoice_with_nonexistent_expense_link_rejected(self, client, emp_h):
        res = client.post("/api/invoices", json=_invoice_payload({
            "linked_expense_id": "exp_this_does_not_exist",
        }), headers=emp_h)
        assert res.status_code == 404

    def test_invoice_without_link_is_valid(self, client, emp_h):
        inv = _create(client, emp_h)
        assert inv.get("linked_expense_id") is None


# ── 8. Phase 1 Regression Guard ───────────────────────────────────────────────

class TestPhase1RegressionGuard:
    """
    Smoke tests confirming Phase 1 endpoints are unaffected by Stage 2 changes.
    The full Phase 1 regression suite (test_server.py, test_approval_regression.py, etc.)
    should be run separately; these verify the router registration hasn't broken anything.
    """

    def test_expenses_endpoint_still_works(self, client, emp_h):
        res = client.get("/api/expenses", headers=emp_h)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_auth_me_still_works(self, client, emp_h):
        res = client.get("/api/auth/me", headers=emp_h)
        assert res.status_code == 200
        assert "email" in res.json()

    def test_analytics_still_works(self, client, adm_h):
        res = client.get("/api/analytics/summary", headers=adm_h)
        assert res.status_code == 200
        assert "summary" in res.json()

    def test_admin_policies_still_works(self, client, adm_h):
        res = client.get("/api/admin/policies", headers=adm_h)
        assert res.status_code == 200
        assert len(res.json()) >= 5

    def test_invoice_and_expense_routes_coexist(self, client, emp_h):
        """Creating both an invoice and an expense in the same session must work."""
        exp_res = client.post("/api/expenses", json={
            "title": "Coexistence Test",
            "category": "Supplies",
            "amount": 50.0,
            "expense_date": "2026-07-20",
            "description": "Testing coexistence",
            "status": "Draft",
        }, headers=emp_h)
        assert exp_res.status_code == 200

        inv = _create(client, emp_h)
        assert inv["id"].startswith("inv_")
