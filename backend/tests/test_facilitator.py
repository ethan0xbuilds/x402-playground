import time
import pytest
from tests.helpers import make_signed_payload
from config import DEMO_PAY_TO_ADDRESS


def test_valid_payment_returns_valid_true(client):
    payload = make_signed_payload()
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert len(data["checks"]) == 6
    assert all(c["passed"] for c in data["checks"])


def test_missing_field_returns_invalid(client):
    payload = make_signed_payload()
    del payload["signature"]
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["reason"] == "missing fields"


def test_expired_payment_returns_invalid(client):
    payload = make_signed_payload(validBefore_offset=-10)  # already expired
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["reason"] == "payment expired"


def test_insufficient_amount_returns_invalid(client):
    payload = make_signed_payload(value=100)  # below 10000
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["reason"] == "insufficient amount"


def test_wrong_recipient_returns_invalid(client):
    payload = make_signed_payload(to_addr="0x0000000000000000000000000000000000000001")
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["reason"] == "wrong recipient"


def test_invalid_signature_returns_invalid(client):
    payload = make_signed_payload()
    payload["signature"] = "0x" + "ab" * 65  # garbage
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["reason"] == "invalid signature"


def test_replay_attack_blocked(client):
    nonce = "0x" + "aa" * 32
    payload = make_signed_payload(nonce=nonce)
    # First request passes
    resp1 = client.post("/api/facilitator/verify", json=payload)
    assert resp1.json()["valid"] is True
    # Second request with same nonce is rejected
    resp2 = client.post("/api/facilitator/verify", json=payload)
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["valid"] is False
    assert data["reason"] == "nonce already used"


def test_reset_clears_nonces(client):
    nonce = "0x" + "bb" * 32
    payload = make_signed_payload(nonce=nonce)
    client.post("/api/facilitator/verify", json=payload)
    # Reset
    client.get("/api/demo/reset")
    # Same nonce passes again
    resp = client.post("/api/facilitator/verify", json=payload)
    assert resp.json()["valid"] is True
