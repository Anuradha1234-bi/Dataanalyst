"""Integration tests for Smart Duplicate Dataset API Endpoints."""

from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.models.user import User
from app.auth.security import create_access_token


def test_duplicate_dataset_endpoints():
    client = TestClient(app)
    db = next(get_db())
    user = db.query(User).first()
    assert user is not None, "Test requires at least one user in database."

    token = create_access_token(data={"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test dedicated duplicates detect endpoint
    res = client.post("/api/relationships/duplicates/detect", json={}, headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert "duplicate_datasets" in data
    assert "total_pairs_evaluated" in data
    assert isinstance(data["duplicate_datasets"], list)

    # 2. Test GET duplicates endpoint
    res_get = client.get("/api/relationships/duplicates", headers=headers)
    assert res_get.status_code == 200
    assert "duplicate_datasets" in res_get.json()

    # 3. Test ignore endpoint
    res_ignore = client.post("/api/relationships/duplicates/ignore", json={"pair_id": "dup_5_6"}, headers=headers)
    assert res_ignore.status_code == 200
    assert res_ignore.json()["status"] == "IGNORED"

    # 4. Test detect relationships includes duplicate_datasets
    res_rels = client.post("/api/relationships/detect", json={}, headers=headers)
    assert res_rels.status_code == 200
    rels_data = res_rels.json()
    assert "duplicate_datasets" in rels_data
    assert isinstance(rels_data["duplicate_datasets"], list)
