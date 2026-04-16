import os
import time
from eth_account import Account

from config import (
    DEMO_PRIVATE_KEY,
    DEMO_CLIENT_ADDRESS,
    DEMO_PAY_TO_ADDRESS,
    CHAIN_ID,
    ASSET_ADDRESS,
)
from crypto import _MESSAGE_TYPES

_DOMAIN_DATA = {
    "name": "USD Coin",
    "version": "2",
    "chainId": CHAIN_ID,
    "verifyingContract": ASSET_ADDRESS,
}


def _payload_to_message_data(payload: dict) -> dict:
    """Convert a payment payload dict into the message_data dict for EIP-712 signing."""
    nonce_hex = payload["nonce"].removeprefix("0x").removeprefix("0X")
    nonce_bytes = bytes.fromhex(nonce_hex)
    return {
        "from": payload["from"],
        "to": payload["to"],
        "value": int(payload["value"]),
        "validAfter": int(payload["validAfter"]),
        "validBefore": int(payload["validBefore"]),
        "nonce": nonce_bytes,
    }


def make_signed_payload(
    value: int = 10000,
    nonce: str | None = None,
    validAfter_offset: int = -10,
    validBefore_offset: int = 300,
    from_addr: str = DEMO_CLIENT_ADDRESS,
    to_addr: str = DEMO_PAY_TO_ADDRESS,
) -> dict:
    """Return a fully signed payment payload using the demo private key."""
    now = int(time.time())
    if nonce is None:
        nonce = "0x" + os.urandom(32).hex()
    payload = {
        "from": from_addr,
        "to": to_addr,
        "value": str(value),
        "validAfter": str(now + validAfter_offset),
        "validBefore": str(now + validBefore_offset),
        "nonce": nonce,
    }
    message_data = _payload_to_message_data(payload)
    account = Account.from_key(DEMO_PRIVATE_KEY)
    signed = account.sign_typed_data(
        domain_data=_DOMAIN_DATA,
        message_types=_MESSAGE_TYPES,
        message_data=message_data,
    )
    payload["signature"] = "0x" + signed.signature.hex()
    return payload
