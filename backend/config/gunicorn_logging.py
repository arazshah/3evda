"""gunicorn's access log with client links and personal details masked.

The request path of a client's page carries its signed link; that link is a key to the page, so it is not
written down. (The application's own log lines are masked by `apps.core.logging`.)
"""

from typing import Any

from gunicorn.glogging import Logger

from apps.core.logging import scrub

MASKED_ATOMS = ("r", "U", "q", "f", "a")  # request line, path, query string, referer, user agent


class AccessLogger(Logger):  # type: ignore[misc]
    def atoms(self, resp: Any, req: Any, environ: Any, request_time: Any) -> dict[str, Any]:
        atoms: dict[str, Any] = super().atoms(resp, req, environ, request_time)
        for key in MASKED_ATOMS:
            if isinstance(atoms.get(key), str):
                atoms[key] = scrub(atoms[key])
        return atoms
