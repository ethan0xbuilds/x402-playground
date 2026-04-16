from fastapi import APIRouter

router = APIRouter()

_used_nonces: set[str] = set()


@router.post("/facilitator/verify")
async def verify():
    return {"status": "stub"}


@router.get("/demo/reset")
async def reset():
    _used_nonces.clear()
    return {"status": "ok"}
