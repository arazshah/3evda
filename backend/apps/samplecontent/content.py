"""The words of the sample site. Everything here is made up: restaurants, brands and people do not exist.

Keep the texts plausible but obviously fictional where they could be mistaken for a real person (enquiries).
"""

from __future__ import annotations

from typing import Any

PREFIX = "sample-"

SETTINGS: dict[str, str] = {
    "description_fa": "عکاسی تبلیغاتی غذا و محصول برای رستوران‌ها، کافه‌ها و برندهای خوراکی؛ از ارومیه برای همه‌جا.",
    "description_en": "Advertising photography of food and products for restaurants, cafés and food brands, shot in Urmia.",
    "phone": "۰۴۴-۰۰۰۰۰۰۰۰ (نمونه)",
    "email": "hello@example.com",
    "whatsapp": "https://wa.me/0000000000",
    "telegram": "https://t.me/example",
    "map_url": "https://maps.example.com/urmia",
    "footer_text_fa": "این سایت با محتوای نمونه پر شده است؛ از پنل ویرایش کنید.",
    "footer_text_en": "This site is filled with sample content; edit it from the panel.",
}

HERO: list[dict[str, str]] = [
    {"title_fa": "طعم را دیدنی می‌کنیم", "title_en": "We make flavour visible",
     "subtitle_fa": "عکاسی غذا برای رستوران‌ها و کافه‌ها", "subtitle_en": "Food photography for restaurants and cafés"},
    {"title_fa": "هر محصول یک داستان دارد", "title_en": "Every product has a story",
     "subtitle_fa": "نور، رنگ و بافت؛ آنچه برند شما را می‌فروشد", "subtitle_en": "Light, colour and texture, the things that sell your brand"},
    {"title_fa": "از منو تا کمپین", "title_en": "From the menu to the campaign",
     "subtitle_fa": "یک سبک تصویری یکدست برای همه‌ی نقاط تماس", "subtitle_en": "One consistent look for every touchpoint"},
]  # fmt: skip

SERVICES: list[dict[str, str]] = [
    {"title_fa": "عکاسی منوی رستوران", "title_en": "Restaurant menu photography",
     "body_fa": "عکس تک‌تک غذاها برای منوی چاپی و دیجیتال، با نور و استایل یکدست.",
     "body_en": "Every dish shot for printed and digital menus, with consistent light and styling."},
    {"title_fa": "عکاسی محصول و بسته‌بندی", "title_en": "Product and packaging",
     "body_fa": "عکس فروشگاهی و تبلیغاتی برای برندهای خوراکی، با پس‌زمینه‌ی ساده یا صحنه‌سازی.",
     "body_en": "Shop and advertising images for food brands, on clean backgrounds or styled sets."},
    {"title_fa": "کمپین و شبکه‌های اجتماعی", "title_en": "Campaigns and social",
     "body_fa": "مجموعه‌ی عکس و ویدیوی کوتاه برای کمپین‌های فصلی و اینستاگرام.",
     "body_en": "Photo and short-video sets for seasonal campaigns and Instagram."},
    {"title_fa": "استایلینگ و مشاوره", "title_en": "Styling and consultation",
     "body_fa": "طراحی صحنه، انتخاب ظروف و رنگ، و برنامه‌ی تصویری برای برند.",
     "body_en": "Set design, props and colour, and a visual plan for the brand."},
]  # fmt: skip

STEPS: list[dict[str, str]] = [
    {"title_fa": "گفتگو", "title_en": "Brief",
     "body_fa": "هدف، مخاطب و سبک تصویر را با هم روشن می‌کنیم.", "body_en": "We settle the goal, the audience and the look."},
    {"title_fa": "برنامه و استایل", "title_en": "Plan and styling",
     "body_fa": "فهرست عکس‌ها، ظروف و رنگ‌ها پیش از روز عکاسی مشخص می‌شود.", "body_en": "The shot list, props and colours are fixed before the day."},
    {"title_fa": "روز عکاسی", "title_en": "Shoot day",
     "body_fa": "در استودیو یا محل شما؛ همراه با نمایش زنده‌ی نتیجه.", "body_en": "In the studio or at your place, with a live preview."},
    {"title_fa": "ویرایش و تحویل", "title_en": "Edit and delivery",
     "body_fa": "انتخاب شما در گالری خصوصی، ویرایش نهایی و تحویل فایل‌ها.", "body_en": "You choose in a private gallery; then final edits and delivery."},
]  # fmt: skip

FAQ: list[dict[str, str]] = [
    {"title_fa": "هزینه‌ی عکاسی چطور حساب می‌شود؟", "title_en": "How is the price worked out?",
     "body_fa": "بر اساس تعداد محصول و نوع کار؛ از صفحه‌ی استعلام قیمت برآورد فوری بگیرید.",
     "body_en": "By the number of items and the kind of work; get an instant estimate on the quote page."},
    {"title_fa": "زمان تحویل چقدر است؟", "title_en": "How long does delivery take?",
     "body_fa": "معمولاً ۳ تا ۷ روز کاری پس از روز عکاسی؛ تحویل فوری هم ممکن است.",
     "body_en": "Usually 3 to 7 working days after the shoot; rush delivery is possible."},
    {"title_fa": "آیا در محل ما عکاسی می‌کنید؟", "title_en": "Do you shoot on location?",
     "body_fa": "بله، در ارومیه و شهرهای اطراف؛ هزینه‌ی رفت‌وآمد جداگانه اعلام می‌شود.",
     "body_en": "Yes, in Urmia and nearby cities; travel is quoted separately."},
    {"title_fa": "عکس‌ها را چطور تحویل می‌گیرم؟", "title_en": "How do I receive the photos?",
     "body_fa": "از یک گالری خصوصی با لینک و رمز، که عکس‌ها را انتخاب و دانلود می‌کنید.",
     "body_en": "From a private gallery with a link and a password, where you choose and download."},
    {"title_fa": "حق استفاده از عکس‌ها چیست؟", "title_en": "What are the usage rights?",
     "body_fa": "استفاده‌ی تبلیغاتی برای برند شما؛ جزئیات در پیش‌فاکتور نوشته می‌شود.",
     "body_en": "Advertising use for your brand; the details are written in the proforma."},
]  # fmt: skip

TESTIMONIALS: list[dict[str, str]] = [
    {"title_fa": "مریم نمونه", "title_en": "Maryam Sample", "subtitle_fa": "مدیر کافه‌ی گیلاس (خیالی)", "subtitle_en": "Gilas Café manager (fictional)",
     "body_fa": "بعد از عکس‌های جدید منو، سفارش دسرها تقریباً دو برابر شد.", "body_en": "After the new menu photos, dessert orders nearly doubled."},
    {"title_fa": "کامران نمونه", "title_en": "Kamran Sample", "subtitle_fa": "برند حلوای زعفران (خیالی)", "subtitle_en": "Saffron Halva brand (fictional)",
     "body_fa": "دقیقاً همان حس خانگی و گرم که می‌خواستیم روی بسته‌بندی دیده شد.", "body_en": "It captured exactly the warm, homemade feel we wanted on the packaging."},
    {"title_fa": "نگار نمونه", "title_en": "Negar Sample", "subtitle_fa": "رستوران شب (خیالی)", "subtitle_en": "Night Restaurant (fictional)",
     "body_fa": "حرفه‌ای، سروقت و با حوصله؛ گالری انتخاب هم کار را خیلی ساده کرد.", "body_en": "Professional, punctual and patient; the selection gallery made it easy."},
]  # fmt: skip

CLIENTS: list[tuple[str, str]] = [
    ("کافه‌ی گیلاس", "Gilas Café"),
    ("حلوای زعفران", "Saffron Halva"),
    ("رستوران شب", "Night Restaurant"),
    ("نانوایی برکت", "Barakat Bakery"),
    ("شیرینی‌سرای آرام", "Aram Pâtisserie"),
]

BEHIND: list[tuple[str, str]] = [
    ("چیدن صحنه", "Setting the scene"),
    ("تنظیم نور", "Shaping the light"),
    ("استایل نهایی", "Final styling"),
    ("لحظه‌ی کلیک", "The click"),
    ("بازبینی با مشتری", "Reviewing with the client"),
    ("ویرایش رنگ", "Colour editing"),
]

CATEGORIES: list[dict[str, str]] = [
    {"slug": "sample-restaurant", "title_fa": "رستوران و کافه", "title_en": "Restaurants and cafés",
     "description_fa": "منو، غذا و فضای رستوران.", "description_en": "Menus, dishes and the room."},
    {"slug": "sample-product", "title_fa": "محصول و بسته‌بندی", "title_en": "Product and packaging",
     "description_fa": "عکس فروشگاهی و تبلیغاتی محصولات خوراکی.", "description_en": "Shop and advertising images of food products."},
    {"slug": "sample-campaign", "title_fa": "کمپین تبلیغاتی", "title_en": "Advertising campaigns",
     "description_fa": "تصویر برای کمپین‌های فصلی و شبکه‌های اجتماعی.", "description_en": "Imagery for seasonal and social campaigns."},
]  # fmt: skip

PROJECTS: list[dict[str, Any]] = [
    {"slug": "sample-gilas-cafe-menu", "category": "sample-restaurant", "style": "natural", "year": 1404, "featured": True,
     "title_fa": "منوی کافه‌ی گیلاس", "title_en": "Gilas Café menu", "client_fa": "کافه‌ی گیلاس (خیالی)", "client_en": "Gilas Café (fictional)",
     "summary_fa": "عکس ۳۲ آیتم منو با نور طبیعی پنجره.", "summary_en": "Thirty-two menu items shot in soft window light.",
     "body_fa": "کافه‌ی گیلاس منویی می‌خواست که بوی قهوه و شیرینی را به تصویر بیاورد. ظرف‌های سفالی محلی و نور صبحگاهی پنجره، حس یکدستی به همه‌ی آیتم‌ها داد.",
     "body_en": "Gilas Café wanted a menu that makes you smell the coffee and pastries. Local ceramics and morning window light gave all items one voice."},
    {"slug": "sample-saffron-sweets", "category": "sample-product", "style": "high_key", "year": 1404, "featured": True,
     "title_fa": "حلوا و شیرینی زعفرانی", "title_en": "Saffron sweets", "client_fa": "حلوای زعفران (خیالی)", "client_en": "Saffron Halva (fictional)",
     "summary_fa": "عکس بسته‌بندی با پس‌زمینه‌ی روشن و روشنایی ملایم.", "summary_en": "Packaging on a bright background with gentle light.",
     "body_fa": "برای بسته‌بندی هدیه‌ی نوروزی، عکس‌ها روی پس‌زمینه‌ی روشن و با رنگ زعفرانی برجسته گرفته شد.",
     "body_en": "For the Nowruz gift box, the images were shot on a bright ground with the saffron colour as the accent."},
    {"slug": "sample-night-burger", "category": "sample-campaign", "style": "low_key", "year": 1403, "featured": True,
     "title_fa": "کمپین برگر شب", "title_en": "Night burger campaign", "client_fa": "رستوران شب (خیالی)", "client_en": "Night Restaurant (fictional)",
     "summary_fa": "تصویر تاریک و پرکنتراست برای کمپین شبانه.", "summary_en": "Dark, high-contrast imagery for a late-night campaign.",
     "body_fa": "ایده‌ی کمپین، «شب شهر» بود. با پس‌زمینه‌ی تیره و نور لبه‌ای، غذا مثل نشانی روشن در تاریکی دیده می‌شود.",
     "body_en": "The idea was 'city night'. On a dark ground with rim light, the food reads like a sign glowing in the dark."},
    {"slug": "sample-fresh-bakery", "category": "sample-product", "style": "natural", "year": 1403, "featured": False,
     "title_fa": "نان تازه‌ی برکت", "title_en": "Barakat fresh bread", "client_fa": "نانوایی برکت (خیالی)", "client_en": "Barakat Bakery (fictional)",
     "summary_fa": "عکس بسته‌بندی و تابلوی فروشگاه.", "summary_en": "Packaging and in-store signage images.",
     "body_fa": "بخار و تُرد بودن نان، دو چیزی بود که باید در عکس دیده می‌شد.", "body_en": "Steam and crispness were the two things the photo had to show."},
    {"slug": "sample-persian-breakfast", "category": "sample-restaurant", "style": "natural", "year": 1402, "featured": False,
     "title_fa": "صبحانه‌ی ایرانی", "title_en": "Persian breakfast", "client_fa": "رستوران شب (خیالی)", "client_en": "Night Restaurant (fictional)",
     "summary_fa": "سفره‌ی صبحانه با نان، پنیر و چای.", "summary_en": "A breakfast spread with bread, cheese and tea.",
     "body_fa": "سفره‌ای پرجزئیات که باید شلوغ و در عین حال منظم دیده می‌شد.", "body_en": "A detailed spread that had to look abundant yet orderly."},
    {"slug": "sample-dessert-lab", "category": "sample-campaign", "style": "low_key", "year": 1402, "featured": False,
     "title_fa": "آزمایشگاه دسر", "title_en": "Dessert lab", "client_fa": "شیرینی‌سرای آرام (خیالی)", "client_en": "Aram Pâtisserie (fictional)",
     "summary_fa": "مجموعه‌ی دسرهای فصلی در سبک مینیمال.", "summary_en": "Seasonal desserts in a minimal style.",
     "body_fa": "هر دسر مثل یک اثر کوچک روی سکوی خودش عکاسی شد.", "body_en": "Each dessert was shot on its own plinth like a small artwork."},
]  # fmt: skip

PACKAGE_GROUPS: list[dict[str, Any]] = [
    {"title_fa": "رستوران و کافه", "title_en": "Restaurants and cafés",
     "description_fa": "برای منو و شبکه‌های اجتماعی.", "description_en": "For menus and social media.",
     "packages": [
         {"title_fa": "منوی کوچک", "title_en": "Small menu", "summary_fa": "تا ۱۰ آیتم، یک سبک یکدست.", "summary_en": "Up to 10 items in one style.",
          "mode": "from", "amount": 8_000_000, "unit_fa": "", "unit_en": "", "badge_fa": "", "badge_en": "", "featured": False,
          "features": [("۱۰ عکس نهایی ویرایش‌شده", "10 final retouched photos", True), ("تحویل در ۵ روز", "5-day delivery", True), ("ویدیوی کوتاه", "Short video", False)]},
         {"title_fa": "منوی کامل", "title_en": "Full menu", "summary_fa": "تا ۳۰ آیتم همراه با استایلینگ.", "summary_en": "Up to 30 items with styling.",
          "mode": "from", "amount": 20_000_000, "unit_fa": "", "unit_en": "", "badge_fa": "محبوب", "badge_en": "Popular", "featured": True,
          "features": [("۳۰ عکس نهایی ویرایش‌شده", "30 final retouched photos", True), ("استایلینگ و ظرف", "Styling and props", True), ("ویدیوی کوتاه", "Short video", True)]},
         {"title_fa": "همکاری ماهانه", "title_en": "Monthly retainer", "summary_fa": "محتوای تازه برای هر ماه.", "summary_en": "Fresh content every month.",
          "mode": "inquiry", "amount": None, "unit_fa": "", "unit_en": "", "badge_fa": "", "badge_en": "", "featured": False,
          "features": [("یک روز عکاسی در ماه", "One shoot day a month", True), ("برنامه‌ی تصویری", "Visual plan", True)]},
     ]},
    {"title_fa": "محصول و برند", "title_en": "Products and brands",
     "description_fa": "برای فروشگاه و بسته‌بندی.", "description_en": "For shops and packaging.",
     "packages": [
         {"title_fa": "عکس محصول", "title_en": "Product shots", "summary_fa": "پس‌زمینه‌ی ساده، قیمت به‌ازای هر محصول.", "summary_en": "Clean background, priced per item.",
          "mode": "fixed", "amount": 1_000_000, "unit_fa": "به ازای هر محصول", "unit_en": "per item", "badge_fa": "", "badge_en": "", "featured": False,
          "features": [("۳ زاویه برای هر محصول", "3 angles per item", True), ("برش و ویرایش رنگ", "Cut-out and colour work", True)]},
         {"title_fa": "کمپین برند", "title_en": "Brand campaign", "summary_fa": "صحنه‌سازی، عکس و ویدیو.", "summary_en": "Set design, photo and video.",
          "mode": "from", "amount": 35_000_000, "unit_fa": "", "unit_en": "", "badge_fa": "", "badge_en": "", "featured": False,
          "features": [("صحنه‌سازی اختصاصی", "Custom set design", True), ("عکس و ویدیو", "Photo and video", True), ("حق استفاده‌ی گسترده", "Extended usage rights", True)]},
     ]},
]  # fmt: skip

QUOTE_RULES: list[dict[str, Any]] = [
    {"key": "sample-rule-food", "kind": "service", "label_fa": "عکاسی غذا", "label_en": "Food photography", "amount": 1_000_000},
    {"key": "sample-rule-product", "kind": "service", "label_fa": "عکاسی محصول", "label_en": "Product photography", "amount": 800_000},
    {"key": "sample-rule-tier", "kind": "tier", "label_fa": "۱۰ محصول به بالا", "label_en": "10+ items", "factor": "0.90", "min_quantity": 10},
    {"key": "sample-rule-styling", "kind": "addon_per_item", "label_fa": "استایلینگ", "label_en": "Styling", "amount": 100_000},
    {"key": "sample-rule-video", "kind": "addon_fixed", "label_fa": "ویدیوی کوتاه", "label_en": "Short video", "amount": 2_000_000},
    {"key": "sample-rule-rush", "kind": "multiplier", "label_fa": "تحویل فوری", "label_en": "Rush delivery", "factor": "1.50"},
]  # fmt: skip

TAGS: list[tuple[str, str, str]] = [
    ("sample-light", "نور", "light"),
    ("sample-styling", "استایلینگ", "styling"),
    ("sample-menu", "منو", "menu"),
]

ARTICLES: list[dict[str, Any]] = [
    {"slug": "sample-window-light", "tags": ["sample-light", "sample-menu"], "days": 3,
     "fa": {"title": "چرا نور پنجره بهترین دوست عکس غذاست", "summary": "یک منبع نور ملایم، سایه‌ی کنترل‌شده و حس طبیعی: همه‌ی آنچه برای عکس منو لازم دارید.",
            "paragraphs": ["نور پنجره نرم و جهت‌دار است و بافت غذا را بدون برق‌انداختن نشان می‌دهد.",
                           "کافی است میز را کنار پنجره بگذارید، پرده‌ی سفید بکشید و با یک بازتاب‌دهنده‌ی ساده سایه‌ها را باز کنید."]},
     "en": {"title": "Why window light is a food photo's best friend", "summary": "One soft source, controlled shadows and a natural feel: all you need for menu photos.",
            "paragraphs": ["Window light is soft and directional, so it shows texture without glare.",
                           "Put the table beside the window, hang a white curtain and open the shadows with a simple reflector."]}},
    {"slug": "sample-styling-basics", "tags": ["sample-styling"], "days": 10,
     "fa": {"title": "اصول استایل غذا: سه چیز که باید ساده بماند", "summary": "ظرف، رنگ و چیدمان؛ چطور بدون شلوغی، غذا را خواستنی کنیم.",
            "paragraphs": ["ظرف را متناسب با غذا انتخاب کنید نه برعکس؛ ظرف ساده بهتر است.",
                           "حداکثر دو رنگ مکمل کنار رنگ اصلی غذا بگذارید و بقیه را خنثی نگه دارید."]},
     "en": {"title": "Food styling basics: three things to keep simple", "summary": "Plate, colour and arrangement: how to make food desirable without clutter.",
            "paragraphs": ["Choose the plate to suit the dish, not the other way round; plain is better.",
                           "Add at most two complementary colours beside the main colour and keep the rest neutral."]}},
    {"slug": "sample-menu-shoot-prep", "tags": ["sample-menu"], "days": 18,
     "fa": {"title": "آماده‌شدن برای روز عکاسی منو", "summary": "فهرست کوتاه برای اینکه روز عکاسی روان پیش برود.",
            "paragraphs": ["فهرست آیتم‌ها را پیش از روز عکاسی بدهید و بگویید کدام‌ها اولویت دارند.",
                           "غذاها باید تازه و به ترتیب آماده شوند؛ با آشپزخانه هماهنگ کنید."]},
     "en": {"title": "Getting ready for a menu shoot day", "summary": "A short list to keep the shoot day smooth.",
            "paragraphs": ["Send the item list before the day and say which ones matter most.",
                           "Dishes should be prepared fresh and in order; coordinate with the kitchen."]}},
]  # fmt: skip

INQUIRIES: list[dict[str, Any]] = [
    {"name": "نمونه‌ی یک (ساختگی)", "brand": "کافه‌ی خیالی", "phone": "۰۹۰۰۰۰۰۰۰۰۱", "service_key": "sample-rule-food", "service_label": "عکاسی غذا",
     "quantity": 12, "low": 9_500_000, "high": 13_000_000, "status": "new", "message": "این یک استعلام ساختگی است؛ برای دیدن فهرست استعلام‌ها."},
    {"name": "نمونه‌ی دو (ساختگی)", "brand": "برند خیالی", "phone": "۰۹۰۰۰۰۰۰۰۰۲", "service_key": "sample-rule-product", "service_label": "عکاسی محصول",
     "quantity": 25, "low": 17_000_000, "high": 22_000_000, "status": "reviewing", "message": "ساختگی؛ می‌توانید وضعیتش را تغییر دهید."},
    {"name": "Sample Three (fake)", "brand": "Fictional Foods", "email": "three@example.com", "language": "en", "service_key": "sample-rule-food",
     "service_label": "Food photography", "quantity": 6, "low": 5_000_000, "high": 7_000_000, "status": "proforma_sent", "message": "A fake enquiry, only to fill the list."},
    {"name": "نمونه‌ی چهار (ساختگی)", "brand": "", "phone": "۰۹۰۰۰۰۰۰۰۰۴", "service_key": "", "service_label": "", "quantity": None,
     "low": None, "high": None, "status": "closed", "message": "ساختگی؛ بسته‌شده."},
]  # fmt: skip

SESSION_TYPES: list[tuple[str, str, str, int, int]] = [
    ("sample-studio", "عکاسی در استودیو", "Studio session", 120, 30),
    ("sample-on-site", "عکاسی در محل", "On-site shoot", 180, 60),
]

GALLERY_TITLE = "گالری نمونه‌ی مشتری"
