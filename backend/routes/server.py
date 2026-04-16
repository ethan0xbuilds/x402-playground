from fastapi import APIRouter

router = APIRouter()


@router.get("/weather")
async def weather():
    return {"status": "stub"}
