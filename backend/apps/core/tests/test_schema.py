import pytest
from django.contrib.auth import get_user_model
from django.test import Client


@pytest.mark.django_db
def test_schema_is_not_public():
    assert Client().get("/api/schema/").status_code in (401, 403)


@pytest.mark.django_db
def test_schema_is_served_to_admins():
    admin = get_user_model().objects.create_user("admin", password="x" * 16, is_staff=True)
    client = Client()
    client.force_login(admin)

    response = client.get("/api/schema/", HTTP_ACCEPT="application/vnd.oai.openapi+json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "3evda API"
    assert "/api/health/live" not in schema["paths"]  # plain Django views stay out of the API contract
