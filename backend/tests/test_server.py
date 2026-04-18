import base64
import json
from tests.helpers import make_signed_payload


def test_no_payment_returns_402(client):
    resp = client.get("/api/server/weather")
    assert resp.status_code == 402
    assert resp.headers.get("X-402-Version") == "1"
    data = resp.json()
    assert data["x402Version"] == 1
    accepts = data["accepts"][0]
    assert accepts["scheme"] == "exact"
    assert accepts["network"] == "eip155:8453"
    assert accepts["maxAmountRequired"] == "10000"


def test_valid_payment_returns_200(client):
    payload = make_signed_payload()
    x_payment = base64.b64encode(json.dumps(payload).encode()).decode()
    resp = client.get("/api/server/weather", headers={"X-PAYMENT": x_payment})
    assert resp.status_code == 200
    data = resp.json()
    assert "temperature" in data
    assert "city" in data
    assert "paid_with" in data
    assert resp.headers.get("X-Payment-Receipt") is not None


def test_invalid_payment_returns_402(client):
    bad_payload = {
        "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "value": "10000",
        "validAfter": "0",
        "validBefore": "1",  # already expired
        "nonce": "0x" + "cc" * 32,
        "signature": "0x" + "ab" * 65,
    }
    x_payment = base64.b64encode(json.dumps(bad_payload).encode()).decode()
    resp = client.get("/api/server/weather", headers={"X-PAYMENT": x_payment})
    assert resp.status_code == 402
    data = resp.json()
    assert "error" in data


def test_malformed_payment_header_returns_402(client):
    resp = client.get("/api/server/weather", headers={"X-PAYMENT": "not-base64!!!"})
    assert resp.status_code == 402
