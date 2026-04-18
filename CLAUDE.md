# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An educational demo of the [x402 payment protocol](https://x402.xyz) — a standard for HTTP 402-based micropayments using EIP-3009 off-chain authorization. Users click through 7 steps to see the full handshake: client → server 402 → EIP-712 signing → payment header → facilitator verification → 200 response. A replay attack demo shows nonce deduplication in action.

No real blockchain transactions occur. All signing and verification use hardcoded Hardhat test keys.

## Commands

```bash
# Backend — run from backend/
uv sync                                        # install deps (creates .venv)
uv run uvicorn main:app --reload --port 8000   # dev server
uv run pytest                                  # all tests
uv run pytest tests/test_crypto.py -v          # single file
uv run pytest -k test_replay_attack_blocked    # single test

# Frontend — run from frontend/
python -m http.server 8080                     # static server at localhost:8080
```

For local dev, switch `API_BASE` at the top of `frontend/app.js` from the production URL to `http://localhost:8000`.

## Architecture

```
frontend/           Static site → GitHub Pages (x402.oasaka.xyz)
  app.js            All interaction logic + ethers.js EIP-712 signing
  index.html / style.css

backend/            FastAPI → VPS at api.oasaka.xyz (behind xray + nginx)
  main.py           App entry: CORS config, router mounting
  config.py         Demo wallet constants (Hardhat test key #0, chain 8453)
  crypto.py         EIP-712 verification via eth_account 0.13+
  routes/
    server.py       GET /api/server/weather — returns 402 or 200
    facilitator.py  POST /api/facilitator/verify — 6-check validation
                    GET /api/demo/reset — clears nonce set

nginx/
  x402.conf              Nginx config for api.oasaka.xyz (reference, not active)
  x402-backend.service   systemd unit (reference)
```

**Key data flow:** `server.py` calls `run_checks()` (imported directly from `facilitator.py`) — not via HTTP. The same `run_checks()` is also exposed as the public `POST /api/facilitator/verify` endpoint so the frontend can call it directly to display the 6 check results.

**Nonce state** lives in `_used_nonces: set[str]` in `facilitator.py` — in-memory only, resets on process restart.

## EIP-712 / EIP-3009 Implementation Notes

- **Python (`crypto.py`):** Uses `eth_account` 0.13+. The old `eth_account.structured_data.encode_structured_data` was removed; the current API uses `encode_typed_data(domain_data=..., message_types=..., message_data=...)` from `eth_account.messages`.
- **JavaScript (`app.js`):** Uses ethers.js v6 UMD from cdnjs. Signing: `wallet.signTypedData(domain, types, message)`.
- **Domain must match exactly** on both sides: `name="USD Coin"`, `version="2"`, `chainId=8453`, `verifyingContract=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- **Nonce:** 32-byte hex string. Backend uses `.removeprefix("0x")` (not `.lstrip("0x")`) to avoid stripping leading zeros.

## VPS Deployment

The VPS runs **xray** (VLESS+TLS) on port 443, which owns TLS termination. Nginx does not touch 443. Traffic flow:

```
Port 443 → xray (TLS termination)
             ├── VLESS clients → VPN outbound
             └── SNI api.oasaka.xyz → port 8080 → Nginx → FastAPI :8000
```

Relevant files on the VPS:
- `/usr/local/etc/xray/config.json` — xray config (SNI routing + dual-cert)
- `/usr/local/etc/xray/cert/api.oasaka.xyz.{crt,key}` — Let's Encrypt cert copied here (xray runs as `nobody`)
- `/etc/nginx/sites-enabled/x402-internal.conf` — listens on 8080, proxies `/api/` to :8000
- `/etc/systemd/system/x402-backend.service` — runs uvicorn

**Cert renewal:** A weekly cron (`/etc/cron.d/xray-cert-renew`) copies the renewed Let's Encrypt cert to the xray cert dir and restarts xray.

## CI/CD

`.github/workflows/deploy.yml` triggers on push to `main`:
- `deploy-frontend`: uploads `frontend/` as a GitHub Pages artifact
- `deploy-backend`: SSHs into VPS, exports `~/.local/bin` to PATH, then runs `git pull && uv sync && systemctl restart x402-backend`

Required GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (ed25519 private key).

## Testing Notes

Tests use FastAPI's `TestClient` — no running server needed. `conftest.py` provides two fixtures: `client` (the test client) and `reset_nonces` (autouse, clears `facilitator._used_nonces` before and after each test). `tests/helpers.py` contains shared EIP-712 payload builders used across test files.
