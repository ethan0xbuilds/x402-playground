from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.server import router as server_router
from routes.facilitator import router as facilitator_router

app = FastAPI(title="x402 Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://x402.oasaka.xyz",
        "http://localhost:8080",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-PAYMENT"],
    expose_headers=["X-402-Version", "X-Payment-Receipt"],
)

app.include_router(server_router, prefix="/api/server")
app.include_router(facilitator_router, prefix="/api")
