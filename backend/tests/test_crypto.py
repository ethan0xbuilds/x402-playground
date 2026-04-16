import os
import pytest
from eth_account import Account

from config import DEMO_CLIENT_ADDRESS, CHAIN_ID, ASSET_ADDRESS
from tests.helpers import make_signed_payload


def test_valid_signature_recovers_correct_address():
    payload = make_signed_payload()
    from crypto import verify_eip3009_signature
    recovered = verify_eip3009_signature(payload, CHAIN_ID, ASSET_ADDRESS)
    assert recovered.lower() == DEMO_CLIENT_ADDRESS.lower()


def test_bad_signature_raises():
    payload = make_signed_payload()
    payload["signature"] = "0x" + "ab" * 65  # garbage signature
    from crypto import verify_eip3009_signature
    with pytest.raises(Exception):
        verify_eip3009_signature(payload, CHAIN_ID, ASSET_ADDRESS)


def test_tampered_value_recovers_wrong_address():
    """Changing value after signing means the recovered address won't match 'from'."""
    payload = make_signed_payload(value=10000)
    payload["value"] = "99999"  # tamper after signing
    from crypto import verify_eip3009_signature
    recovered = verify_eip3009_signature(payload, CHAIN_ID, ASSET_ADDRESS)
    assert recovered.lower() != DEMO_CLIENT_ADDRESS.lower()
