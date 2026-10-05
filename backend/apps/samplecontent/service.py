"""Fill the site with made-up content, and take exactly that content away again.

Loading is additive: it never overwrites what the owner wrote (settings and blocks are filled only when empty) and it
records everything it makes, so unloading removes those things and nothing else.
"""

from __future__ import annotations

import logging
import uuid
from datetime import time, timedelta
from decimal import Decimal
from typing import Any

from django.apps import apps
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone

from apps.audit.service import record as audit
from apps.blog.models import Article, Tag
from apps.blog.models import Category as BlogCategory
from apps.booking.models import BookingSettings, SessionType, WorkingHours
from apps.cms.models import ContentBlock, ContentItem, SiteSettings
from apps.galleries import service as galleries
from apps.galleries.models import Gallery
from apps.galleries.tasks import process_photo
from apps.inquiries.models import Inquiry
from apps.media.models import MediaAsset
from apps.media.service import create_asset, delete_asset
from apps.media.tasks import process_asset
from apps.portfolio.models import Category, Project, ProjectImage
from apps.pricing.models import Package, PackageFeature, PackageGroup, QuoteRule

from . import content as c
from .images import make_image
from .models import SampleRecord, SampleState

logger = logging.getLogger(__name__)

# A load or unload that has not reported back after this long is taken for dead (the worker was restarted).
STALE_AFTER = timedelta(minutes=20)

LANDSCAPE = (1600, 1067)
PORTRAIT = (1067, 1600)


class Superseded(Exception):
    """This run no longer holds the lease (it was declared dead, or a newer run started): stop quietly."""


def hold(run_id: uuid.UUID | None) -> None:
    if run_id is not None and not SampleState.objects.filter(pk=1, run_id=run_id).exists():
        raise Superseded


class SampleError(Exception):
    def __init__(self, code: str, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def current_state() -> SampleState:
    """The state, with a dead run turned into `failed` so the owner can clean up and try again."""
    state = SampleState.load()
    busy = state.status in (SampleState.Status.LOADING, SampleState.Status.UNLOADING)
    if busy and state.started_at and timezone.now() - state.started_at > STALE_AFTER:
        state.status = SampleState.Status.FAILED
        state.run_id = uuid.uuid4()  # a task that is still alive (or redelivered) loses its lease
        state.message = "عملیات نیمه‌کاره ماند (احتمالاً سرویس پس‌زمینه دوباره راه افتاد). پاک‌سازی و دوباره بارگذاری کنید."
        state.save()
    return state


def counts() -> dict[str, int]:
    out: dict[str, int] = {}
    for row in SampleRecord.objects.filter(kind=SampleRecord.Kind.OBJECT).values_list("group", flat=True):
        out[row] = out.get(row, 0) + 1
    return out


def begin(status: str, allowed: tuple[str, ...]) -> SampleState:
    """Move to a busy state, atomically, or refuse with 409 (so two clicks cannot start two runs)."""
    with transaction.atomic():
        state = SampleState.objects.select_for_update().get_or_create(pk=1)[0]
        if state.status in (SampleState.Status.LOADING, SampleState.Status.UNLOADING) and not (
            state.started_at and timezone.now() - state.started_at > STALE_AFTER
        ):
            raise SampleError("busy", "عملیات دیگری در حال انجام است؛ کمی صبر کنید.")
        if state.status not in allowed:
            if status == SampleState.Status.LOADING:
                raise SampleError("already_loaded", "محتوای نمونه قبلاً بارگذاری شده است؛ ابتدا آن را پاک کنید.")
            raise SampleError("nothing_to_unload", "محتوای نمونه‌ای برای پاک‌سازی نیست.")
        state.status = status
        state.run_id = uuid.uuid4()
        state.message = ""
        state.started_at = timezone.now()
        state.save()
    return state


# ── load ─────────────────────────────────────────────────────────────────────────────────────────────────────────


class _Loader:
    def __init__(self, user: Any, run_id: uuid.UUID | None = None) -> None:
        self.user = user
        self.run_id = run_id

    def track(self, obj: Any, group: str) -> Any:
        hold(self.run_id)
        SampleRecord.objects.create(
            kind=SampleRecord.Kind.OBJECT, model_label=obj._meta.label_lower, object_id=str(obj.pk), group=group
        )
        return obj

    def image(self, seed: int, size: tuple[int, int], name: str) -> MediaAsset:
        hold(self.run_id)
        upload = SimpleUploadedFile(f"{name}.jpg", make_image(seed, *size), content_type="image/jpeg")
        asset, created = create_asset(upload, self.user, queue=False)
        if created:
            self.track(asset, "media")
            process_asset(str(asset.pk))  # inline: the page can show the photo as soon as loading says "loaded"
            asset.refresh_from_db()
        return asset

    def fill(self, obj: Any, field: str, value: Any) -> None:
        """Set an empty field of a singleton and remember it, so unloading can empty it again."""
        hold(self.run_id)
        current = getattr(obj, f"{field}_id" if obj._meta.get_field(field).is_relation else field)
        if current not in (None, ""):
            return
        setattr(obj, field, value)
        obj.save()
        SampleRecord.objects.create(
            kind=SampleRecord.Kind.FIELD,
            model_label=obj._meta.label_lower,
            object_id=str(obj.pk),
            field=field,
            value=str(value.pk if hasattr(value, "pk") else value)[:300],
        )

    def guard(self) -> None:
        slugs = [p["slug"] for p in c.PROJECTS] + [p["slug"] for p in c.CATEGORIES]
        if Project.objects.filter(slug__in=slugs).exists() or Category.objects.filter(slug__in=slugs).exists():
            raise SampleError(
                "slug_taken", "محتوایی با نام‌های نمونه از قبل وجود دارد؛ آن را تغییر نام دهید یا پاک کنید."
            )
        if Article.objects.filter(slug__in=[a["slug"] for a in c.ARTICLES]).exists():
            raise SampleError(
                "slug_taken", "مقاله‌ای با نشانی نمونه از قبل وجود دارد؛ آن را تغییر نام دهید یا پاک کنید."
            )
        if (
            QuoteRule.objects.filter(key__in=[r["key"] for r in c.QUOTE_RULES]).exists()
            or SessionType.objects.filter(key__in=[s[0] for s in c.SESSION_TYPES]).exists()
        ):
            raise SampleError("slug_taken", "قاعده‌ی قیمت یا نوع جلسه‌ای با کلید نمونه از قبل وجود دارد.")

    def run(self) -> None:
        hold(self.run_id)
        self.guard()
        self.site()
        self.hero_and_items()
        projects = self.portfolio()
        self.pricing()
        self.articles(projects)
        self.booking()
        self.inquiries()
        self.gallery()

    def site(self) -> None:
        settings = SiteSettings.load()
        for field, value in c.SETTINGS.items():
            self.fill(settings, field, value)
        self.fill(settings, "og_image", self.image(1, LANDSCAPE, "sample-og"))
        for key, seed, size in (("home.intro_image", 4, PORTRAIT), ("about.photo", 5, PORTRAIT)):
            block, _ = ContentBlock.objects.get_or_create(key=key)
            self.fill(block, "media", self.image(seed, size, f"sample-{key.replace('.', '-')}"))

    def hero_and_items(self) -> None:
        def item(collection: str, position: int, **fields: Any) -> None:
            self.track(ContentItem.objects.create(collection=collection, position=position, **fields), collection)

        for i, row in enumerate(c.HERO):
            item("hero_slide", i, media=self.image(i + 1, (1800, 1200), f"sample-hero-{i + 1}"), **row)
        for i, row in enumerate(c.SERVICES):
            item("service", i, media=self.image(10 + i, LANDSCAPE, f"sample-service-{i + 1}"), **row)
        for i, row in enumerate(c.STEPS):
            item("process_step", i, **row)
        for i, row in enumerate(c.FAQ):
            item("faq", i, **row)
        for i, row in enumerate(c.TESTIMONIALS):
            item("testimonial", i, **row)
        for i, (fa, en) in enumerate(c.CLIENTS):
            item("client", i, title_fa=fa, title_en=en)
        for i, (fa, en) in enumerate(c.BEHIND):
            item(
                "behind_scenes",
                i,
                title_fa=fa,
                title_en=en,
                media=self.image(50 + i, (1000, 1000), f"sample-behind-{i + 1}"),
            )

    def portfolio(self) -> dict[str, Project]:
        categories: dict[str, Category] = {}
        for i, cat in enumerate(c.CATEGORIES):
            categories[cat["slug"]] = self.track(Category.objects.create(position=i, **cat), "category")
        projects: dict[str, Project] = {}
        for i, row in enumerate(c.PROJECTS):
            extra: dict[str, Any] = {k: v for k, v in row.items() if k not in ("category", "featured")}
            n = 6 + i % 3
            assets = []
            for j in range(n):
                size = PORTRAIT if j % 3 == 1 else LANDSCAPE
                assets.append(self.image(100 + i * 10 + j, size, f"{row['slug']}-{j + 1}"))
            project = self.track(
                Project.objects.create(
                    category=categories[row["category"]],
                    is_featured=row["featured"],
                    is_published=True,
                    position=i,
                    cover=assets[0],
                    **extra,
                ),
                "project",
            )
            for j, asset in enumerate(assets):
                ProjectImage.objects.create(project=project, media=asset, position=j)
            projects[row["slug"]] = project
        for category, row in zip(categories.values(), c.CATEGORIES, strict=True):
            first = next(p for p in c.PROJECTS if p["category"] == row["slug"])
            category.cover = projects[first["slug"]].cover
            category.save()
        return projects

    def pricing(self) -> None:
        for i, group in enumerate(c.PACKAGE_GROUPS):
            g = self.track(
                PackageGroup.objects.create(
                    position=i,
                    **{k: v for k, v in group.items() if k != "packages"},
                ),
                "package_group",
            )
            for j, pkg in enumerate(group["packages"]):
                p = self.track(
                    Package.objects.create(
                        group=g,
                        title_fa=pkg["title_fa"],
                        title_en=pkg["title_en"],
                        summary_fa=pkg["summary_fa"],
                        summary_en=pkg["summary_en"],
                        price_mode=pkg["mode"],
                        price_amount=pkg["amount"],
                        price_unit_fa=pkg["unit_fa"],
                        price_unit_en=pkg["unit_en"],
                        badge_fa=pkg["badge_fa"],
                        badge_en=pkg["badge_en"],
                        is_featured=pkg["featured"],
                        position=j,
                    ),
                    "package",
                )
                for k, (fa, en, included) in enumerate(pkg["features"]):
                    PackageFeature.objects.create(package=p, text_fa=fa, text_en=en, included=included, position=k)
        for i, rule in enumerate(c.QUOTE_RULES):
            data = dict(rule)
            if "factor" in data:
                data["factor"] = Decimal(data["factor"])
            self.track(QuoteRule.objects.create(position=i, **data), "quote_rule")

    def articles(self, projects: dict[str, Project]) -> None:
        category = self.track(
            BlogCategory.objects.create(
                slug="sample-photography-notes", title_fa="یادداشت‌های عکاسی", title_en="Photography notes"
            ),
            "blog_category",
        )
        tags = {
            slug: self.track(Tag.objects.create(slug=slug, title_fa=fa, title_en=en), "blog_tag")
            for slug, fa, en in c.TAGS
        }
        import uuid

        for i, row in enumerate(c.ARTICLES):
            cover = self.image(70 + i, LANDSCAPE, f"{row['slug']}-cover")
            group = uuid.uuid4()
            for language in ("fa", "en"):
                text = row[language]
                body = {
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": paragraph}]}
                        for paragraph in text["paragraphs"]
                    ],
                }
                article = Article(
                    language=language,
                    translation_group=group,
                    slug=row["slug"],
                    title=text["title"],
                    summary=text["summary"],
                    body=body,
                    cover=cover,
                    category=category,
                    status=Article.Status.PUBLISHED,
                    published_at=timezone.now() - timedelta(days=row["days"]),
                    reading_minutes=2,
                )
                article.save()
                article.tags.set([tags[t] for t in row["tags"]])
                article.related_projects.set(list(projects.values())[i : i + 2])
                self.track(article, "article")

    def booking(self) -> None:
        BookingSettings.load()
        for i, (key, fa, en, minutes, buffer) in enumerate(c.SESSION_TYPES):
            self.track(
                SessionType.objects.create(
                    key=key, title_fa=fa, title_en=en, duration_minutes=minutes, buffer_minutes=buffer, position=i
                ),
                "session_type",
            )
        if not WorkingHours.objects.exists():  # Saturday to Thursday, 10:00–18:00 (Python: Monday is 0)
            for weekday in (5, 6, 0, 1, 2, 3):
                self.track(WorkingHours.objects.create(weekday=weekday, start=time(10), end=time(18)), "working_hours")

    def inquiries(self) -> None:
        for i, row in enumerate(c.INQUIRIES):
            seen = None if row["status"] == "new" else timezone.now() - timedelta(days=i)
            inquiry = Inquiry.objects.create(
                name=row["name"],
                brand=row["brand"],
                phone=row.get("phone", ""),
                email=row.get("email", ""),
                language=row.get("language", "fa"),
                service_key=row["service_key"],
                service_label=row["service_label"],
                quantity=row["quantity"],
                estimate_low=row["low"],
                estimate_high=row["high"],
                message=row["message"],
                status=row["status"],
                seen_at=seen,
            )
            self.track(inquiry, "inquiry")

    def gallery(self) -> None:
        gallery = self.track(
            Gallery.objects.create(title=c.GALLERY_TITLE, client_name="مشتری خیالی", language="fa", watermark=True),
            "gallery",
        )
        for i in range(12):
            size = PORTRAIT if i % 4 == 1 else LANDSCAPE
            upload = SimpleUploadedFile(
                f"sample-gallery-{i + 1}.jpg", make_image(200 + i, *size), content_type="image/jpeg"
            )
            photo = galleries.add_photo(gallery, upload, queue=False)
            process_photo(photo.pk)
        galleries.publish(gallery)


def run_load(user: Any = None, run_id: uuid.UUID | None = None) -> dict[str, int]:
    """The body of the load task. Everything made so far stays recorded when something fails."""
    try:
        _Loader(user, run_id).run()
    except Superseded:
        return {}
    except SampleError as error:
        _finish(
            run_id,
            SampleState.Status.FAILED if SampleRecord.objects.exists() else SampleState.Status.EMPTY,
            error.message,
        )
        raise
    except Exception as error:
        logger.exception("sample content load failed")
        _finish(
            run_id,
            SampleState.Status.FAILED,
            f"بارگذاری ناموفق بود ({type(error).__name__}). محتوای نیمه‌کاره را پاک کنید و دوباره بسازید.",
        )
        raise
    result = counts()
    _finish(run_id, SampleState.Status.LOADED, "", result)
    audit("sample.load", actor=user, counts=result)
    return result


def _finish(run_id: uuid.UUID | None, status: str, message: str, result: dict[str, int] | None = None) -> None:
    """Write the outcome, but only if this run still holds the lease."""
    rows = SampleState.objects.filter(pk=1)
    if run_id is not None:
        rows = rows.filter(run_id=run_id)
    rows.update(status=status, message=message[:500], result=result or {}, started_at=None, updated_at=timezone.now())


# ── unload ───────────────────────────────────────────────────────────────────────────────────────────────────────


def _remove(label: str, obj: Any) -> bool:
    """Delete one recorded thing; False when something the owner made still uses it."""
    try:
        with transaction.atomic():
            if label == "media.mediaasset":
                delete_asset(obj)
            elif label == "galleries.gallery":
                galleries.delete_gallery(obj)
            else:
                obj.delete()
    except ProtectedError:
        return False
    return True


def run_unload(user: Any = None, run_id: uuid.UUID | None = None) -> dict[str, int]:
    removed = 0
    kept = 0
    try:
        # Fields we filled go back to empty first (only if the owner has not changed them since).
        for rec in SampleRecord.objects.filter(kind=SampleRecord.Kind.FIELD).order_by("-id"):
            hold(run_id)
            model = apps.get_model(rec.model_label)
            obj = model.objects.filter(pk=rec.object_id).first()
            if obj is not None:
                field = model._meta.get_field(rec.field)
                attr = f"{rec.field}_id" if field.is_relation else rec.field
                if str(getattr(obj, attr) or "") == rec.value:
                    setattr(
                        obj, attr, None if field.is_relation else field.get_default() if field.has_default() else ""
                    )
                    obj.save()
            rec.delete()
        # Newest first, but media last: an asset is made before the things that use it only sometimes (a category's
        # cover is a project photo made after the category), so it can only go once nothing refers to it.
        records = list(SampleRecord.objects.filter(kind=SampleRecord.Kind.OBJECT).order_by("-id"))
        records.sort(key=lambda r: r.model_label == "media.mediaasset")
        for rec in records:
            hold(run_id)
            obj = apps.get_model(rec.model_label).objects.filter(pk=rec.object_id).first()
            if obj is None or _remove(rec.model_label, obj):
                removed += obj is not None
                rec.delete()
            else:
                kept += 1
                rec.delete()  # no longer ours: the owner uses it, so it is theirs now
    except Superseded:
        return {}
    except Exception as error:
        logger.exception("sample content unload failed")
        _finish(run_id, SampleState.Status.FAILED, f"پاک‌سازی ناموفق بود ({type(error).__name__}). دوباره تلاش کنید.")
        raise
    result = {"removed": removed, "kept": kept}
    message = f"{kept} مورد چون در جای دیگری از سایت استفاده شده بود ماند." if kept else ""
    _finish(run_id, SampleState.Status.EMPTY, message, result)
    audit("sample.unload", actor=user, removed=removed, kept=kept)
    return result
