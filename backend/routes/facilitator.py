import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from config import DEMO_PAY_TO_ADDRESS, CHAIN_ID, ASSET_ADDRESS, MAX_AMOUNT_REQUIRED
from crypto import verify_eip3009_signature

router = APIRouter()

_used_nonces: set[str] = set()


def run_checks(payload: dict) -> dict:
    """Run all 6 payment checks. Returns {"valid": bool, "checks": [...], "reason": str|None}.
    Records the nonce on success. Can be called directly from other routes.
    """
    checks: list[dict] = []

    def add_check(name: str, passed: bool) -> bool:
        checks.append({"name": name, "passed": passed})
        return passed

    # Check 1: field completeness
    required = {"from", "to", "value", "validAfter", "validBefore", "nonce", "signature"}
    if not add_check("Field completeness", required.issubset(payload.keys())):
        return {"valid": False, "reason": "missing fields", "checks": checks}

    # Check 2: time validity
    now = int(time.time())
    valid_after = int(payload["validAfter"])
    valid_before = int(payload["validBefore"])
    time_ok = valid_after <= now < valid_before
    if not add_check("Time validity", time_ok):
        reason = "payment expired" if now >= valid_before else "not yet valid"
        return {"valid": False, "reason": reason, "checks": checks}

    # Check 3: amount
    if not add_check("Amount check", int(payload["value"]) >= MAX_AMOUNT_REQUIRED):
        return {"valid": False, "reason": "insufficient amount", "checks": checks}

    # Check 4: recipient
    if not add_check("Recipient check", payload["to"].lower() == DEMO_PAY_TO_ADDRESS.lower()):
        return {"valid": False, "reason": "wrong recipient", "checks": checks}

    # Check 5: EIP-712 signature
    try:
        recovered = verify_eip3009_signature(payload, CHAIN_ID, ASSET_ADDRESS)
        sig_ok = recovered.lower() == payload["from"].lower()
    except Exception:
        sig_ok = False
    if not add_check("Signature verification", sig_ok):
        return {"valid": False, "reason": "invalid signature", "checks": checks}

    # Check 6: nonce deduplication
    nonce = payload["nonce"].lower()
    if not add_check("Nonce deduplication", nonce not in _used_nonces):
        return {"valid": False, "reason": "nonce already used", "checks": checks}

    _used_nonces.add(nonce)
    return {"valid": True, "checks": checks}


@router.post("/facilitator/verify")
async def verify(request: Request):
    payload = await request.json()
    return JSONResponse(run_checks(payload))


@router.get("/demo/reset")
async def reset():
    _used_nonces.clear()
    return {"status": "ok", "message": "Nonce set cleared. You can replay the demo."}
