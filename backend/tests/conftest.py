import sys
import os

# Ensure 'backend/' is on sys.path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from main import app
from routes import facilitator


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_nonces():
    """Clear in-memory nonce set before and after each test."""
    facilitator._used_nonces.clear()
    yield
    facilitator._used_nonces.clear()
