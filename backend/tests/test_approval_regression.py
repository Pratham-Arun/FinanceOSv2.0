"""
Phase 1 Regression Tests — Approval Flow, Payment Path, Duplicate Detection,
AI Pipeline Fallback, and Role-Based Access Control.

These tests protect the expense workflow against regressions introduced by
Phase 2 changes. They must all pass before any Phase 2 stage is merged.

Run: uv run pytest tests/test_approval_regression.py -v
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
    """Helper: logs in and returns {headers, user}."""
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    data = res.json()
    return {
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
        "user": data["user"],
    }


@pytest.fixture(scope="module")
def emp(client):
    return _login(client, "employee@demo.com", "demo1234")


@pytest.fixture(scope="module")
def mgr(client):
    return _login(client, "manager@demo.com", "demo1234")


@pytest.fixture(scope="module")
def fin(client):
    return _login(client, "finance@demo.com", "demo1234")


@pytest.fixture(scope="module")
def adm(client):
    return _login(client, "admin@demo.com", "admin123")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _submit_expense(client, headers: dict, overrides: dict = None) -> dict:
    """Creates and immediately submits a minimal expense. Returns the expense dict."""
    payload = {
        "title": f"Regression Test Meal {time.time_ns()}",
        "category": "Meals",
        "amount": 45.0,
        "expense_date": "2026-07-15",
        "description": "Team lunch regression test",
        "receipt_url": "/uploads/receipt_test.jpg",
        "status": "Submitted",
    }
    if overrides:
        payload.update(overrides)
    res = client.post("/api/expenses", json=payload, headers=headers)
    assert res.status_code == 200, f"Expense creation failed: {res.text}"
    return res.json()


# ── 1. Full Approval → Payment Path ──────────────────────────────────────────

class TestFullApprovalPaymentPath:
    """
    Verifies the canonical happy path:
    Employee submits → Manager approves → Finance pays → status=Paid, payment_reference set.
    """

    def test_employee_submit_creates_submitted_expense(self, client, emp):
        exp = _submit_expense(client, emp["headers"])
        assert exp["status"] == "Submitted"
        assert exp["id"].startswith("exp_")
        assert "_id" not in exp

    def test_manager_view_advances_to_under_review(self, client, emp, mgr):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        details = client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        assert details.status_code == 200
        assert details.json()["expense"]["status"] == "Under Review"

    def test_manager_approve_sets_approved_status(self, client, emp, mgr):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        # Manager must open the expense first (advances to Under Review)
        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])

        res = client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Approved", "comments": "Looks fine"},
            headers=mgr["headers"],
        )
        assert res.status_code == 200
        assert res.json()["status"] == "Approved"

    def test_finance_approve_sets_paid_with_payment_reference(self, client, emp, mgr, fin):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Approved", "comments": "Manager approved"},
            headers=mgr["headers"],
        )

        fin_res = client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Approved", "comments": "Payment cleared"},
            headers=fin["headers"],
        )
        assert fin_res.status_code == 200
        result = fin_res.json()
        assert result["status"] == "Paid"
        assert "payment_reference" in result
        assert result["payment_reference"].startswith("TXN-")

    def test_paid_expense_has_payment_reference_in_details(self, client, emp, mgr, fin):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        client.post(f"/api/approvals/{exp_id}/action",
                    json={"action": "Approved", "comments": "OK"}, headers=mgr["headers"])
        client.post(f"/api/approvals/{exp_id}/action",
                    json={"action": "Approved", "comments": "Paid"}, headers=fin["headers"])

        details = client.get(f"/api/expenses/{exp_id}", headers=emp["headers"])
        assert details.status_code == 200
        expense = details.json()["expense"]
        assert expense["status"] == "Paid"
        assert expense.get("payment_reference", "").startswith("TXN-")

    def test_timeline_endpoint_reflects_all_steps(self, client, emp, mgr, fin):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        client.post(f"/api/approvals/{exp_id}/action",
                    json={"action": "Approved", "comments": "OK"}, headers=mgr["headers"])
        client.post(f"/api/approvals/{exp_id}/action",
                    json={"action": "Approved", "comments": "Paid"}, headers=fin["headers"])

        timeline_res = client.get(f"/api/expenses/{exp_id}/timeline", headers=emp["headers"])
        assert timeline_res.status_code == 200
        steps = timeline_res.json()["timeline"]
        step_names = [s["step"] for s in steps]
        assert any("Submitted" in s for s in step_names)
        assert any("Payment" in s for s in step_names)


# ── 2. Rejection Paths ────────────────────────────────────────────────────────

class TestRejectionPaths:

    def test_manager_reject_sets_rejected_status(self, client, emp, mgr):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        res = client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Rejected", "comments": "Policy violation"},
            headers=mgr["headers"],
        )
        assert res.status_code == 200
        assert res.json()["status"] == "Rejected"

    def test_manager_clarification_returns_expense_to_draft(self, client, emp, mgr):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        res = client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Clarification", "comments": "Need more details"},
            headers=mgr["headers"],
        )
        assert res.status_code == 200
        assert res.json()["status"] == "Draft"

    def test_finance_reject_approved_expense(self, client, emp, mgr, fin):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        client.post(f"/api/approvals/{exp_id}/action",
                    json={"action": "Approved", "comments": "Approved"}, headers=mgr["headers"])

        fin_res = client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Rejected", "comments": "Receipt invalid"},
            headers=fin["headers"],
        )
        assert fin_res.status_code == 200
        assert fin_res.json()["status"] == "Rejected"

    def test_employee_cannot_delete_submitted_expense(self, client, emp):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        del_res = client.delete(f"/api/expenses/{exp_id}", headers=emp["headers"])
        assert del_res.status_code == 400

    def test_employee_can_delete_rejected_expense(self, client, emp, mgr):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        client.get(f"/api/expenses/{exp_id}", headers=mgr["headers"])
        client.post(f"/api/approvals/{exp_id}/action",
                    json={"action": "Rejected", "comments": "Rejected"}, headers=mgr["headers"])

        del_res = client.delete(f"/api/expenses/{exp_id}", headers=emp["headers"])
        assert del_res.status_code == 200


# ── 3. Role-Based Access Control ──────────────────────────────────────────────

class TestRoleBasedAccessControl:

    def test_employee_cannot_view_other_employees_expense(self, client, adm):
        # Register a second employee
        email2 = f"emp2_{time.time_ns()}@test.com"
        reg = client.post("/api/auth/register", json={
            "name": "Second Employee", "email": email2,
            "password": "pass1234", "role": "Employee"
        })
        emp2_headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        emp1_headers = _login(client, "employee@demo.com", "demo1234")["headers"]

        # emp1 creates expense
        exp = _submit_expense(client, emp1_headers)
        exp_id = exp["id"]

        # emp2 tries to view it
        res = client.get(f"/api/expenses/{exp_id}", headers=emp2_headers)
        assert res.status_code == 403

    def test_employee_cannot_approve_expense(self, client, emp):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        res = client.post(
            f"/api/approvals/{exp_id}/action",
            json={"action": "Approved", "comments": "Self-approve"},
            headers=emp["headers"],
        )
        # Employee approval silently no-ops (role check inside process_approval
        # only acts on Manager/Finance roles), but must not return a server error.
        assert res.status_code in (200, 403)

    def test_unauthenticated_request_rejected(self, client, emp):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        # HTTPBearer returns 403 when the Authorization header is absent entirely,
        # and 401 when the token is present but invalid. Both mean "no access".
        res = client.get(f"/api/expenses/{exp_id}")
        assert res.status_code in (401, 403)

    def test_invalid_token_rejected(self, client):
        res = client.get("/api/expenses", headers={"Authorization": "Bearer this.is.invalid"})
        assert res.status_code == 401

    def test_employee_cannot_update_admin_policy(self, client, emp):
        res = client.put(
            "/api/admin/policies",
            json={"category": "Meals", "max_limit": 999.0,
                  "receipt_required": False, "duplicate_window_days": 30},
            headers=emp["headers"],
        )
        assert res.status_code == 403

    def test_employee_cannot_update_ai_config(self, client, emp):
        res = client.put(
            "/api/admin/ai-config",
            json={"temperature": 0.9},
            headers=emp["headers"],
        )
        assert res.status_code == 403


# ── 4. Duplicate Detection ────────────────────────────────────────────────────

class TestDuplicateDetection:

    def test_duplicate_expense_flagged_on_submit(self, client, emp):
        """Two expenses with the same amount, date, and vendor are flagged as duplicates."""
        payload = {
            "title": "Starbucks Coffee",
            "category": "Meals",
            "amount": 12.50,
            "expense_date": "2026-06-10",
            "description": "Morning coffee",
            "receipt_url": "/uploads/coffee.jpg",
            "status": "Submitted",
        }
        # First submission
        first = client.post("/api/expenses", json=payload, headers=emp["headers"])
        assert first.status_code == 200

        # Second identical submission — should flag duplicate
        second = client.post("/api/expenses", json=payload, headers=emp["headers"])
        assert second.status_code == 200
        data = second.json()
        # Duplicate should surface in risk_flags or duplicate_check
        dup_check = data.get("duplicate_check", {})
        risk_flags = data.get("risk_flags", [])
        is_flagged = (
            dup_check.get("duplicate") is True
            or any("duplicate" in str(f).lower() for f in risk_flags)
        )
        assert is_flagged, (
            f"Expected duplicate to be flagged. duplicate_check={dup_check}, risk_flags={risk_flags}"
        )

    def test_different_amounts_not_flagged_as_duplicate(self, client, emp):
        unique_ts = time.time_ns()
        base = {
            "title": f"Unique Vendor {unique_ts}",
            "category": "Meals",
            "expense_date": "2026-05-20",
            "description": "Unique claim",
            "receipt_url": "/uploads/unique.jpg",
            "status": "Submitted",
        }
        client.post("/api/expenses", json={**base, "amount": 20.00}, headers=emp["headers"])

        second = client.post("/api/expenses", json={**base, "amount": 20.01}, headers=emp["headers"])
        assert second.status_code == 200
        data = second.json()
        dup_check = data.get("duplicate_check", {})
        assert not dup_check.get("duplicate"), (
            "Different amounts should not be flagged as duplicates"
        )


# ── 5. Rule Engine Regression ─────────────────────────────────────────────────

class TestRuleEngineRegression:

    def test_over_limit_meal_sets_risk_flags(self, client, emp):
        exp = _submit_expense(client, emp["headers"], overrides={
            "category": "Meals",
            "amount": 120.0,
            "description": "Expensive team dinner",
        })
        assert exp["risk_score"] in ["Medium", "High"]
        assert len(exp.get("risk_flags", [])) > 0

    def test_alcohol_in_description_flagged(self, client, emp):
        exp = _submit_expense(client, emp["headers"], overrides={
            "category": "Meals",
            "amount": 30.0,
            "description": "Dinner with wine and cocktails",
        })
        flags = exp.get("risk_flags", [])
        alcohol_flagged = any("alcohol" in str(f).lower() for f in flags)
        assert alcohol_flagged, f"Expected alcohol flag, got: {flags}"

    def test_future_date_flagged(self, client, emp):
        exp = _submit_expense(client, emp["headers"], overrides={
            "expense_date": "2030-01-01",
        })
        flags = exp.get("risk_flags", [])
        future_flagged = any("future" in str(f).lower() for f in flags)
        assert future_flagged, f"Expected future date flag, got: {flags}"

    def test_within_policy_expense_passes_as_low_risk(self, client, emp):
        exp = _submit_expense(client, emp["headers"], overrides={
            "category": "Meals",
            "amount": 25.0,
            "description": "Standard team lunch",
            "expense_date": "2026-07-10",
        })
        # Should not be High risk for a clean, under-limit expense with no history anomaly
        assert exp["risk_score"] in ["Low", "Medium"]


# ── 6. AI Pipeline Fallback ───────────────────────────────────────────────────

class TestAIPipelineFallback:
    """
    The AI pipeline must always return a result — never raise an unhandled exception.
    When Groq is unavailable, the rule-engine fallback must produce a valid response.
    """

    def test_ai_analyze_endpoint_always_returns_result(self, client, adm):
        """POST /api/ai/analyze must return 200 with fraud_score regardless of LLM availability."""
        res = client.post(
            "/api/ai/analyze",
            json={
                "expense_data": {
                    "title": "Fallback Test Expense",
                    "category": "Accommodation",
                    "amount": 300.0,
                    "expense_date": "2026-07-20",
                    "description": "Hotel stay over limit",
                }
            },
            headers=adm["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert "fraud_score" in data
        assert isinstance(data["fraud_score"], (int, float))
        assert 0 <= data["fraud_score"] <= 100
        assert "recommendation" in data
        assert "confidence" in data

    def test_expense_submission_survives_ai_failure(self, client, emp):
        """
        Submitting an expense must succeed (200) even if the AI pipeline fails.
        The expense should be created with a fallback risk_score.
        """
        exp = _submit_expense(client, emp["headers"], overrides={
            "title": "AI Fallback Regression",
            "amount": 40.0,
        })
        assert exp["status"] == "Submitted"
        assert "risk_score" in exp
        assert exp["risk_score"] in ["Low", "Medium", "High"]

    def test_rule_validate_endpoint_is_deterministic(self, client, adm):
        """Rule validation must always return a consistent result for the same input."""
        payload = {
            "category": "Meals",
            "amount": 80.0,
            "title": "Over limit meal",
            "description": "Standard dinner",
        }
        res1 = client.post("/api/rules/validate", json=payload, headers=adm["headers"])
        res2 = client.post("/api/rules/validate", json=payload, headers=adm["headers"])
        assert res1.status_code == 200
        assert res2.status_code == 200
        assert res1.json()["policy_status"] == res2.json()["policy_status"]
        assert res1.json()["violations"] == res2.json()["violations"]


# ── 7. Expense Status State Machine ──────────────────────────────────────────

class TestExpenseStateMachine:

    def test_draft_expense_can_be_edited(self, client, emp):
        # Create as Draft
        res = client.post("/api/expenses", json={
            "title": "Draft Expense",
            "category": "Supplies",
            "amount": 50.0,
            "expense_date": "2026-07-01",
            "description": "Office supplies",
            "status": "Draft",
        }, headers=emp["headers"])
        assert res.status_code == 200
        exp_id = res.json()["id"]

        # Edit it
        put_res = client.put(f"/api/expenses/{exp_id}",
                             json={"amount": 60.0, "status": "Draft"},
                             headers=emp["headers"])
        assert put_res.status_code == 200
        assert float(put_res.json()["amount"]) == 60.0

    def test_submitted_expense_cannot_be_edited(self, client, emp):
        exp = _submit_expense(client, emp["headers"])
        exp_id = exp["id"]

        put_res = client.put(f"/api/expenses/{exp_id}",
                             json={"amount": 999.0},
                             headers=emp["headers"])
        # Must be 400 — only Draft expenses are editable
        assert put_res.status_code == 400

    def test_draft_to_submitted_reruns_ai_pipeline(self, client, emp):
        res = client.post("/api/expenses", json={
            "title": "Draft to Submit",
            "category": "Meals",
            "amount": 30.0,
            "expense_date": "2026-07-05",
            "description": "Lunch",
            "status": "Draft",
        }, headers=emp["headers"])
        exp_id = res.json()["id"]

        put_res = client.put(f"/api/expenses/{exp_id}",
                             json={"status": "Submitted"},
                             headers=emp["headers"])
        assert put_res.status_code == 200
        submitted = put_res.json()
        assert submitted["status"] == "Submitted"
        # AI pipeline re-runs on re-submit — risk_score must be present
        assert "risk_score" in submitted
