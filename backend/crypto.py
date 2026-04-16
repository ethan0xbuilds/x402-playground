from eth_account import Account
from eth_account.messages import encode_typed_data

_MESSAGE_TYPES = {
    "TransferWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ]
}


def build_structured_data(payload: dict, chain_id: int, asset_address: str) -> dict:
    """Build EIP-712 domain_data and message_data from a payment payload.

    Returns a dict with keys 'domain_data' and 'message_data' suitable for
    passing to encode_typed_data / sign_typed_data.
    """
    nonce_hex = payload["nonce"].removeprefix("0x").removeprefix("0X")
    nonce_bytes = bytes.fromhex(nonce_hex)
    if len(nonce_bytes) != 32:
        raise ValueError(f"nonce must be 32 bytes, got {len(nonce_bytes)}")
    domain_data = {
        "name": "USD Coin",
        "version": "2",
        "chainId": chain_id,
        "verifyingContract": asset_address,
    }
    message_data = {
        "from": payload["from"],
        "to": payload["to"],
        "value": int(payload["value"]),
        "validAfter": int(payload["validAfter"]),
        "validBefore": int(payload["validBefore"]),
        "nonce": nonce_bytes,
    }
    return {"domain_data": domain_data, "message_data": message_data}


def verify_eip3009_signature(payload: dict, chain_id: int, asset_address: str) -> str:
    """Verify an EIP-3009 TransferWithAuthorization signature.

    Returns the checksummed address of the signer.
    Raises ValueError on invalid signature format (wrong length or invalid v byte).
    Raises on malformed message encoding errors.
    """
    # Validate signature format before attempting recovery
    sig_hex = payload["signature"]
    sig_bytes = bytes.fromhex(sig_hex.removeprefix("0x").removeprefix("0X"))
    if len(sig_bytes) != 65:
        raise ValueError(
            f"Invalid signature length: expected 65 bytes, got {len(sig_bytes)}"
        )
    v_byte = sig_bytes[-1]
    if v_byte not in (0, 1, 27, 28):
        raise ValueError(
            f"Invalid signature v byte: {v_byte} (must be 0, 1, 27, or 28)"
        )

    parts = build_structured_data(payload, chain_id, asset_address)
    signable = encode_typed_data(
        domain_data=parts["domain_data"],
        message_types=_MESSAGE_TYPES,
        message_data=parts["message_data"],
    )
    recovered = Account.recover_message(signable, signature=payload["signature"])
    return recovered
