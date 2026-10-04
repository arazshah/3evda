"""Short-lived signed links to files in the private bucket, served through the gateway under /storage-signed."""

from urllib.parse import quote, urlsplit

from apps.media.storage import private_storage

SIGNED_PREFIX = "/storage-signed"


def signed_path(key: str, *, expire: int, filename: str | None = None) -> str:
    """A path (with its signature) that works for `expire` seconds and then stops.

    With a `filename` the file is always a download, never rendered in the site's own origin.
    """
    parameters = None
    if filename:
        parameters = {"ResponseContentDisposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    signed = urlsplit(private_storage().url(key, parameters=parameters, expire=expire))
    return f"{SIGNED_PREFIX}{signed.path}?{signed.query}"
