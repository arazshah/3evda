from typing import Any

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.blog.models import Article, Category, Tag
from apps.core.demo import require_demo_allowed

PARAGRAPH = {
    "fa": "این یک مقاله‌ی نمونه است که فقط برای آزمایش خودکار ساخته شده. آن را از پنل حذف کنید.",
    "en": "This is a sample article created only for automated checks. Delete it from the panel.",
}
TITLES = {"fa": "مقاله‌ی نمونه", "en": "Sample article"}


def doc(language: str) -> dict[str, Any]:
    return {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": TITLES[language]}]},
            {"type": "paragraph", "content": [{"type": "text", "text": PARAGRAPH[language]}]},
        ],
    }


class Command(BaseCommand):
    help = "Create one published sample article in each language (for CI and local checks; safe to repeat)."

    def handle(self, *args: Any, **options: Any) -> None:
        require_demo_allowed("seed_blog_demo")
        category, _ = Category.objects.get_or_create(
            slug="sample", defaults={"title_fa": "نمونه", "title_en": "Sample"}
        )
        tag, _ = Tag.objects.get_or_create(slug="sample", defaults={"title_fa": "نمونه", "title_en": "sample"})
        existing = {a.language: a for a in Article.objects.filter(slug="sample-article")}
        # Keep one translation group even when only one of the two samples is left (or they drifted apart).
        group = (existing.get("fa") or existing.get("en") or Article(language="fa")).translation_group
        created = 0
        for language in ("fa", "en"):
            article = existing.get(language)
            if article is not None:
                if article.translation_group != group:
                    article.translation_group = group
                    article.save()
                continue
            article = Article(
                language=language,
                translation_group=group,
                slug="sample-article",
                title=TITLES[language],
                summary=PARAGRAPH[language],
                body=doc(language),
                category=category,
                status=Article.Status.PUBLISHED,
                published_at=timezone.now(),
                reading_minutes=1,
            )
            article.save()
            article.tags.add(tag)
            created += 1
        self.stdout.write(self.style.SUCCESS(f"Sample articles ready ({created} created)."))
