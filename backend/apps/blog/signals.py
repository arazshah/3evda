from typing import Any

from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from .cache import bump_version
from .models import Article, ArticleSlugRedirect, Category, Tag


@receiver([post_save, post_delete], sender=Article)
@receiver([post_save, post_delete], sender=Category)
@receiver([post_save, post_delete], sender=Tag)
@receiver([post_save, post_delete], sender=ArticleSlugRedirect)
@receiver(m2m_changed, sender=Article.tags.through)
@receiver(m2m_changed, sender=Article.related_projects.through)
def _blog_changed(**kwargs: Any) -> None:
    """Any change to journal content makes cached public responses stale at once."""
    bump_version()
