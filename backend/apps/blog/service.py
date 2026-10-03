"""Slugs, redirects and translations of articles."""

from django.db import transaction
from django.utils.text import slugify

from .models import Article, ArticleSlugRedirect


def make_slug(title: str, language: str, *, exclude_pk: int | None = None) -> str:
    """A unique slug in this language, made from the title (Persian letters are kept)."""
    base = slugify(title, allow_unicode=True)[:100] or "article"
    taken = Article.objects.filter(language=language)
    if exclude_pk:
        taken = taken.exclude(pk=exclude_pk)
    slug, n = base, 2
    while taken.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def slug_taken(language: str, slug: str, *, exclude_pk: int | None = None) -> bool:
    qs = Article.objects.filter(language=language, slug=slug)
    return (qs.exclude(pk=exclude_pk) if exclude_pk else qs).exists()


@transaction.atomic
def change_slug(article: Article, new_slug: str) -> None:
    """Rename an article: the old address keeps working as a permanent redirect.

    Redirects of earlier names already point at the article, so they follow it to the new slug.
    """
    old = article.slug
    if old == new_slug:
        return
    article.slug = new_slug
    article.save(update_fields=["slug", "updated_at"])  # also removes any redirect that used the new slug
    ArticleSlugRedirect.objects.update_or_create(language=article.language, old_slug=old, defaults={"article": article})
