import pytest
from django.test import RequestFactory

from apps.accounts.ip import client_ip


@pytest.mark.parametrize(
    ("count", "xff", "expected"),
    [
        (2, "203.0.113.7, 10.0.0.2", "203.0.113.7"),  # Traefik set the client, Caddy appended Traefik
        (2, "198.51.100.1, 203.0.113.7, 10.0.0.2", "203.0.113.7"),  # spoofed left-most entry is ignored
        (1, "203.0.113.7", "203.0.113.7"),
        (2, "203.0.113.7", "172.18.0.5"),  # fewer hops than expected: fall back to the peer
        (1, "", "172.18.0.5"),
        (1, "not-an-ip", "172.18.0.5"),
    ],
)
def test_client_ip_uses_the_trusted_proxy_hop(settings, count, xff, expected):
    settings.TRUSTED_PROXY_COUNT = count
    request = RequestFactory().get("/", HTTP_X_FORWARDED_FOR=xff, REMOTE_ADDR="172.18.0.5")
    assert client_ip(request) == expected
