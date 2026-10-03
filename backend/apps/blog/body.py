"""Article bodies.

The editor (TipTap/ProseMirror) saves a JSON document. That JSON is the source of truth: it is
validated against a fixed vocabulary on the way in, and turned into HTML here on the way out.
HTML from a client is never accepted or stored, and the generated HTML is sanitised once more.
"""

import json
import math
import re
import uuid
from collections.abc import Iterable, Mapping
from html import escape
from typing import Any
from urllib.parse import urlsplit

import nh3

MAX_BYTES = 300_000
MAX_DEPTH = 10
MAX_TEXT = 20_000
EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": []}

# node type -> (may contain, allowed children)
BLOCKS = {"paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule", "image", "codeBlock"}
CONTAINERS: dict[str, set[str]] = {
    "doc": BLOCKS,
    "paragraph": {"text", "hardBreak"},
    "heading": {"text", "hardBreak"},
    "bulletList": {"listItem"},
    "orderedList": {"listItem"},
    "listItem": {"paragraph", "bulletList", "orderedList"},
    "blockquote": {"paragraph"},
    "codeBlock": {"text"},
}
LEAVES = {"text", "hardBreak", "horizontalRule", "image"}
MARKS = {"bold", "italic", "code", "link"}
HEADING_LEVELS = {2, 3, 4}
ALLOWED_SCHEMES = {"http", "https", "mailto"}


class BodyError(ValueError):
    """The submitted document is not acceptable; the message is shown to the owner."""


def safe_href(value: object) -> str:
    """http(s), mailto or a site-relative path; anything else (javascript:, data:, …) is rejected."""
    href = str(value).strip()
    if not href or len(href) > 2000 or any(c in href for c in "\x00\r\n\t "):
        raise BodyError("نشانی پیوند نامعتبر است.")
    if href.startswith("/") and not href.startswith("//"):
        return href
    if href.startswith("#"):
        return href
    parts = urlsplit(href)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise BodyError("پیوند فقط می‌تواند http، https، mailto یا نشانی داخلی سایت باشد.")
    return href


def _clean_marks(raw: object) -> list[dict[str, Any]]:
    marks: list[dict[str, Any]] = []
    for mark in raw if isinstance(raw, list) else []:
        kind = mark.get("type") if isinstance(mark, dict) else None
        if kind not in MARKS:
            raise BodyError("قالب‌بندی ناشناخته در متن مقاله.")
        if kind == "link":
            attrs = mark.get("attrs") or {}
            marks.append({"type": "link", "attrs": {"href": safe_href(attrs.get("href", ""))}})
        else:
            marks.append({"type": kind})
    return marks


def _clean_node(node: object, parent: str, depth: int) -> dict[str, Any]:
    if depth > MAX_DEPTH:
        raise BodyError("ساختار متن بیش از حد تو در تو است.")
    if not isinstance(node, dict) or not isinstance(node.get("type"), str):
        raise BodyError("ساختار متن مقاله نامعتبر است.")
    kind: str = node["type"]
    if kind not in CONTAINERS and kind not in LEAVES:
        raise BodyError("بخش ناشناخته در متن مقاله.")
    if kind not in CONTAINERS[parent]:
        raise BodyError("این بخش در این جای متن مجاز نیست.")

    if kind == "text":
        text = node.get("text")
        if not isinstance(text, str) or not text or len(text) > MAX_TEXT:
            raise BodyError("متن نامعتبر یا بیش از حد طولانی است.")
        out: dict[str, Any] = {"type": "text", "text": text}
        if marks := _clean_marks(node.get("marks")):
            out["marks"] = marks
        return out
    if kind in ("hardBreak", "horizontalRule"):
        return {"type": kind}
    if kind == "image":
        attrs = node.get("attrs") or {}
        try:
            media_id = str(uuid.UUID(str(attrs.get("mediaId", ""))))
        except ValueError:
            raise BodyError("شناسه‌ی تصویر نامعتبر است.") from None
        return {"type": "image", "attrs": {"mediaId": media_id}}

    out = {"type": kind}
    if kind == "heading":
        level = (node.get("attrs") or {}).get("level")
        if level not in HEADING_LEVELS:
            raise BodyError("سطح عنوان باید ۲ تا ۴ باشد.")
        out["attrs"] = {"level": level}
    children = node.get("content") or []
    if not isinstance(children, list):
        raise BodyError("ساختار متن مقاله نامعتبر است.")
    out["content"] = [_clean_node(child, kind, depth + 1) for child in children]
    return out


def clean_doc(doc: object) -> dict[str, Any]:
    """The document reduced to the allowed vocabulary, or `BodyError`."""
    if doc in (None, "", {}):
        return {"type": "doc", "content": []}
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise BodyError("متن مقاله باید یک سند ویرایشگر باشد.")
    if len(json.dumps(doc, ensure_ascii=False).encode()) > MAX_BYTES:
        raise BodyError("متن مقاله بیش از حد طولانی است.")
    children = doc.get("content") or []
    if not isinstance(children, list):
        raise BodyError("ساختار متن مقاله نامعتبر است.")
    return {"type": "doc", "content": [_clean_node(child, "doc", 1) for child in children]}


def _walk(node: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
    yield node
    for child in node.get("content") or []:
        yield from _walk(child)


def media_ids(doc: Mapping[str, Any]) -> list[str]:
    """Ids of the library images used in the body, in order of first use."""
    seen: dict[str, None] = {}
    for node in _walk(doc):
        if node.get("type") == "image":
            seen.setdefault(str(node["attrs"]["mediaId"]), None)
    return list(seen)


def plain_text(doc: Mapping[str, Any]) -> str:
    return " ".join(str(n["text"]) for n in _walk(doc) if n.get("type") == "text")


WORDS_PER_MINUTE = {"fa": 180, "en": 220}


def reading_minutes(doc: Mapping[str, Any], language: str) -> int:
    words = len(re.findall(r"\w+", plain_text(doc)))
    return max(1, math.ceil(words / WORDS_PER_MINUTE.get(language, 200)))


# ---- rendering -------------------------------------------------------------------------------------

SANITIZE_TAGS = {
    "p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "br", "pre", "code", "strong", "em", "a",
    "figure", "img",
}  # fmt: skip
SANITIZE_ATTRIBUTES = {
    "a": {"href"},
    "img": {"src", "srcset", "sizes", "alt", "width", "height", "loading"},
}


def _inline(node: Mapping[str, Any]) -> str:
    if node["type"] == "hardBreak":
        return "<br>"
    html = escape(str(node["text"]))
    for mark in node.get("marks") or []:
        match mark["type"]:
            case "bold":
                html = f"<strong>{html}</strong>"
            case "italic":
                html = f"<em>{html}</em>"
            case "code":
                html = f"<code>{html}</code>"
            case "link":
                html = f'<a href="{escape(mark["attrs"]["href"], quote=True)}">{html}</a>'
    return html


def _image(node: Mapping[str, Any], media: Mapping[str, Mapping[str, Any]], language: str) -> str:
    data = media.get(str(node["attrs"]["mediaId"]))
    if data is None:  # deleted or not processed: leave it out rather than break the page
        return ""
    webp = sorted(
        (v for v in data["variants"] if v["format"] == "webp" and v["name"].startswith("w")), key=lambda v: v["width"]
    )
    if not webp:
        return ""
    alt = (data["alt_en"] if language == "en" else data["alt_fa"]) or data["alt_fa"] or data["alt_en"]
    srcset = ", ".join(f"{v['url']} {v['width']}w" for v in webp)
    width, height = data.get("width"), data.get("height")
    size = f' width="{int(width)}" height="{int(height)}"' if width and height else ""
    return (
        f'<figure><img src="{escape(webp[-1]["url"], quote=True)}" srcset="{escape(srcset, quote=True)}" '
        f'sizes="(min-width: 768px) 720px, 100vw" alt="{escape(str(alt), quote=True)}" loading="lazy"{size}></figure>'
    )


def _blocks(nodes: Iterable[Mapping[str, Any]], media: Mapping[str, Mapping[str, Any]], language: str) -> str:
    return "".join(_block(n, media, language) for n in nodes)


def _block(node: Mapping[str, Any], media: Mapping[str, Mapping[str, Any]], language: str) -> str:
    kind = node["type"]
    children = node.get("content") or []
    match kind:
        case "paragraph" | "heading" | "codeBlock":
            inner = "".join(_inline(c) for c in children)  # only these hold text
            if kind == "paragraph":
                return f"<p>{inner}</p>"
            if kind == "heading":
                return f"<h{node['attrs']['level']}>{inner}</h{node['attrs']['level']}>"
            return f"<pre><code>{inner}</code></pre>"
        case "bulletList":
            return f"<ul>{_blocks(children, media, language)}</ul>"
        case "orderedList":
            return f"<ol>{_blocks(children, media, language)}</ol>"
        case "listItem":
            return f"<li>{_blocks(children, media, language)}</li>"
        case "blockquote":
            return f"<blockquote>{_blocks(children, media, language)}</blockquote>"
        case "horizontalRule":
            return "<hr>"
        case "image":
            return _image(node, media, language)
    return ""


def render_html(doc: Mapping[str, Any], media: Mapping[str, Mapping[str, Any]], language: str) -> str:
    """Safe HTML for a validated document. `media` maps id -> public media data (variants, alt texts)."""
    html = _blocks(doc.get("content") or [], media, language)
    return nh3.clean(
        html,
        tags=SANITIZE_TAGS,
        attributes=SANITIZE_ATTRIBUTES,
        url_schemes=ALLOWED_SCHEMES,
        link_rel="noopener noreferrer",
    )
