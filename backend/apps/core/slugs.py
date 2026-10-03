from django.db.models import Model
from django.utils.text import slugify


def unique_slug(model: type[Model], *candidates: str, fallback: str, exclude_pk: int | None = None) -> str:
    """First usable ASCII slug from the candidates (e.g. the English title), made unique with a numeric suffix."""
    base = next((s for c in candidates if (s := slugify(c)[:70])), fallback)
    slug, n = base, 2
    qs = model._default_manager.exclude(pk=exclude_pk) if exclude_pk else model._default_manager.all()
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug
