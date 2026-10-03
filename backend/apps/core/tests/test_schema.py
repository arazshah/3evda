import pytest
from django.test import Client


@pytest.mark.django_db
def test_schema_is_not_public():
    assert Client().get("/api/schema/").status_code == 403


def test_schema_requires_the_second_factor(owner_user):
    client = Client()
    client.force_login(owner_user)
    assert client.get("/api/schema/").status_code == 403


def test_schema_is_served_to_the_verified_owner(owner_client):
    response = owner_client.get("/api/schema/", HTTP_ACCEPT="application/vnd.oai.openapi+json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "3evda API"
    assert "/api/auth/login" in schema["paths"]
    assert "/api/health/live" not in schema["paths"]  # plain Django views stay out of the API contract
