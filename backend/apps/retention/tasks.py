from celery import shared_task

from . import service


@shared_task
def run_retention() -> dict[str, int]:
    """Daily. A switched-off policy (in the panel) makes this do nothing."""
    summary = service.run(trigger="scheduled")
    return summary["counts"]  # type: ignore[no-any-return]
