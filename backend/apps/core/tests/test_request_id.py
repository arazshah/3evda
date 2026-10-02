from django.test import Client


def test_generates_a_request_id_when_missing():
    response = Client().get("/api/health/live")
    assert len(response["X-Request-ID"]) == 32


def test_propagates_a_safe_incoming_request_id():
    response = Client().get("/api/health/live", HTTP_X_REQUEST_ID="abc-123_DEF")
    assert response["X-Request-ID"] == "abc-123_DEF"


def test_replaces_an_unsafe_incoming_request_id():
    response = Client().get("/api/health/live", HTTP_X_REQUEST_ID="bad\nvalue" + "x" * 200)
    assert response["X-Request-ID"] != "bad\nvalue" + "x" * 200
    assert len(response["X-Request-ID"]) == 32
