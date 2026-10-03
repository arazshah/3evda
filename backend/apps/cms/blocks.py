"""Every editable text/image slot of the public site.

Pages read blocks by key; the panel lists them grouped. Adding a slot means adding a line here
(a missing row is created on first read), so no migration is needed.
"""

from dataclasses import dataclass
from typing import Literal

Kind = Literal["text", "longtext", "image"]


@dataclass(frozen=True)
class BlockDef:
    key: str
    group: str
    label: str
    kind: Kind
    fa: str = ""
    en: str = ""


GROUPS = {
    "home": "صفحه‌ی خانه",
    "portfolio": "نمونه‌کارها",
    "services": "خدمات",
    "packages": "پکیج‌ها",
    "about": "درباره‌ی من",
    "contact": "تماس",
    "footer": "پایین صفحه",
}

BLOCKS: tuple[BlockDef, ...] = (
    BlockDef("home.intro_title", "home", "معرفی: عنوان", "text", "طعم را دیدنی می‌کنیم", "We make flavour visible"),
    BlockDef(
        "home.intro_body",
        "home",
        "معرفی: متن",
        "longtext",
        "عکاسی تبلیغاتی برای رستوران‌ها، کافه‌ها و برندهای خوراکی؛ از منوی رستوران تا کمپین محصول.",
        "Advertising photography for restaurants, cafés and food brands — from the menu to the product campaign.",
    ),
    BlockDef("home.intro_image", "home", "معرفی: تصویر", "image"),
    BlockDef("home.cta_primary", "home", "دکمه‌ی اصلی هیرو", "text", "استعلام قیمت", "Get a quote"),
    BlockDef("home.cta_secondary", "home", "دکمه‌ی دوم هیرو", "text", "مشاهده‌ی نمونه‌کارها", "View portfolio"),
    BlockDef("home.categories_title", "home", "عنوان بخش دسته‌ها", "text", "حوزه‌های کاری", "What I shoot"),
    BlockDef("home.featured_title", "home", "عنوان بخش منتخب‌ها", "text", "نمونه‌کارهای منتخب", "Selected work"),
    BlockDef("home.services_title", "home", "عنوان بخش خدمات", "text", "خدمات", "Services"),
    BlockDef("home.process_title", "home", "عنوان بخش فرایند همکاری", "text", "فرایند همکاری", "How we work"),
    BlockDef("home.packages_title", "home", "عنوان بخش پکیج‌ها", "text", "پکیج‌ها", "Packages"),
    BlockDef("home.clients_title", "home", "عنوان بخش مشتریان", "text", "مشتریان", "Clients"),
    BlockDef("home.testimonials_title", "home", "عنوان بخش نظرات", "text", "نظر مشتریان", "Kind words"),
    BlockDef("home.behind_title", "home", "عنوان بخش پشت صحنه", "text", "پشت صحنه", "Behind the scenes"),
    BlockDef("home.faq_title", "home", "عنوان بخش پرسش‌ها", "text", "پرسش‌های پرتکرار", "Frequently asked"),
    BlockDef(
        "home.cta_title",
        "home",
        "دعوت پایانی: عنوان",
        "text",
        "پروژه‌ی بعدی‌تان را شروع کنیم",
        "Let's shoot your next project",
    ),
    BlockDef(
        "home.cta_body",
        "home",
        "دعوت پایانی: متن",
        "longtext",
        "محصولتان را بفرستید، عکس‌ها را آنلاین تحویل بگیرید.",
        "Send your product, receive the photos online.",
    ),
    BlockDef("portfolio.title", "portfolio", "عنوان صفحه", "text", "نمونه‌کارها", "Portfolio"),
    BlockDef("portfolio.intro", "portfolio", "متن مقدمه", "longtext"),
    BlockDef("services.title", "services", "عنوان صفحه", "text", "خدمات", "Services"),
    BlockDef("services.intro", "services", "متن مقدمه", "longtext"),
    BlockDef("packages.title", "packages", "عنوان صفحه", "text", "پکیج‌ها", "Packages"),
    BlockDef(
        "packages.intro",
        "packages",
        "متن مقدمه",
        "longtext",
        "قیمت‌ها نقطه‌ی شروع هستند؛ برای پروژه‌ی دقیق‌تان استعلام بگیرید.",
        "Prices are starting points — request a quote for your exact project.",
    ),
    BlockDef("about.title", "about", "عنوان صفحه", "text", "درباره‌ی من", "About me"),
    BlockDef("about.body", "about", "متن درباره‌ی من", "longtext"),
    BlockDef("about.photo", "about", "عکس", "image"),
    BlockDef("contact.title", "contact", "عنوان صفحه", "text", "تماس", "Contact"),
    BlockDef("contact.intro", "contact", "متن مقدمه", "longtext"),
    BlockDef("footer.about", "footer", "متن کوتاه پایین صفحه", "longtext"),
)

BY_KEY = {b.key: b for b in BLOCKS}
