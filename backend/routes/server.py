import base64
import json
import uuid
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from config import DEMO_PAY_TO_ADDRESS, ASSET_ADDRESS, MAX_AMOUNT_REQUIRED
from routes.facilitator import run_checks

router = APIRouter()

PAYMENT_REQUIREMENT = {
    "x402Version": 1,
    "accepts": [
        {
            "scheme": "exact",
            "network": "eip155:8453",
            "maxAmountRequired": str(MAX_AMOUNT_REQUIRED),
            "asset": ASSET_ADDRESS,
            "payTo": DEMO_PAY_TO_ADDRESS,
            "resource": "/api/server/weather",
            "description": "Weather data — $0.01 USDC per request",
            "mimeType": "application/json",
            "maxTimeoutSeconds": 300,
        }
    ],
}


def _payment_required():
    return JSONResponse(
        status_code=402,
        content=PAYMENT_REQUIREMENT,
        headers={"X-402-Version": "1"},
    )


@router.get("/weather")
async def weather(request: Request):
    x_payment = request.headers.get("X-PAYMENT")
    if not x_payment:
        return _payment_required()

    try:
        payload = json.loads(base64.b64decode(x_payment).decode())
    except Exception:
        return JSONResponse(
            status_code=402,
            content={"error": "Malformed X-PAYMENT header"},
        )

    result = run_checks(payload)
    if not result["valid"]:
        return JSONResponse(
            status_code=402,
            content={
                "error": "Payment verification failed",
                "reason": result.get("reason", "unknown"),
            },
        )

    receipt = str(uuid.uuid4())
    return JSONResponse(
        content={
            "city": "Hangzhou",
            "temperature": 22,
            "condition": "Partly cloudy",
            "paid_with": "0.01 USDC",
            "message": "Payment verified. Thank you!",
        },
        headers={"X-Payment-Receipt": receipt},
    )
