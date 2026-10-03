import uuid

import pytest

from apps.blog.body import BodyError, clean_doc, media_ids, reading_minutes, render_html, safe_href

MEDIA_ID = str(uuid.uuid4())


def para(*nodes):  # type: ignore[no-untyped-def]
    return {"type": "paragraph", "content": list(nodes)}


def text(value, *marks):  # type: ignore[no-untyped-def]
    node = {"type": "text", "text": value}
    if marks:
        node["marks"] = list(marks)
    return node


def doc(*blocks):  # type: ignore[no-untyped-def]
    return {"type": "doc", "content": list(blocks)}


def media(alt_fa="متن", alt_en="text"):  # type: ignore[no-untyped-def]
    return {
        MEDIA_ID: {
            "alt_fa": alt_fa,
            "alt_en": alt_en,
            "width": 1200,
            "height": 800,
            "variants": [
                {"name": "w960", "format": "webp", "url": "/media/b.webp", "width": 960},
                {"name": "w480", "format": "webp", "url": "/media/a.webp", "width": 480},
                {"name": "w480", "format": "avif", "url": "/media/a.avif", "width": 480},
            ],
        }
    }


# ---- validation ------------------------------------------------------------------------------------


def test_empty_values_become_an_empty_document():
    for empty in (None, "", {}, {"type": "doc"}):
        assert clean_doc(empty) == {"type": "doc", "content": []}


def test_a_normal_article_is_kept():
    source = doc(
        {"type": "heading", "attrs": {"level": 2}, "content": [text("عنوان")]},
        para(text("سلام ", {"type": "bold"}), text("دنیا", {"type": "link", "attrs": {"href": "https://example.com"}})),
        {"type": "bulletList", "content": [{"type": "listItem", "content": [para(text("یک"))]}]},
        {"type": "image", "attrs": {"mediaId": MEDIA_ID}},
    )
    assert clean_doc(source) == source


@pytest.mark.parametrize(
    "bad",
    [
        doc({"type": "script", "content": []}),  # unknown node
        doc(para({"type": "text", "text": "x", "marks": [{"type": "underline-blink"}]})),  # unknown mark
        doc({"type": "heading", "attrs": {"level": 1}, "content": [text("h1")]}),  # only h2-h4
        doc({"type": "heading", "attrs": {"level": 9}, "content": [text("h9")]}),
        doc({"type": "image", "attrs": {"mediaId": "not-a-uuid"}}),
        doc(text("loose text outside a paragraph")),  # text is not allowed directly in the doc
        doc(
            {"type": "blockquote", "content": [{"type": "heading", "attrs": {"level": 2}, "content": [text("h")]}]}
        ),  # wrong nesting
        {"type": "paragraph", "content": []},  # not a doc
        "<p>raw html</p>",
        doc(para({"type": "text", "text": ""})),
        doc(para(text("x" * 20_001))),
    ],
)
def test_documents_outside_the_vocabulary_are_rejected(bad):
    with pytest.raises(BodyError):
        clean_doc(bad)


@pytest.mark.parametrize("attrs", [[], "x", 7, True])
def test_attrs_that_are_not_objects_are_a_validation_error_not_a_crash(attrs):
    link = {"type": "text", "text": "x", "marks": [{"type": "link", "attrs": attrs}]}
    for bad in (
        doc(para(link)),
        doc({"type": "heading", "attrs": attrs, "content": [text("h")]}),
        doc({"type": "image", "attrs": attrs}),
    ):
        with pytest.raises(BodyError):
            clean_doc(bad)


@pytest.mark.parametrize(
    "href",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:text/html;base64,AAAA",
        "vbscript:x",
        "//evil.example",
        "",
        "ht tp://x",
    ],
)
def test_dangerous_links_are_rejected(href):
    with pytest.raises(BodyError):
        safe_href(href)


@pytest.mark.parametrize(
    "href", ["https://a.example/x?y=1", "http://a.example", "mailto:a@b.example", "/portfolio", "#top"]
)
def test_safe_links_are_accepted(href):
    assert safe_href(href) == href


def test_unknown_attributes_are_dropped_not_stored():
    cleaned = clean_doc(
        doc(
            {"type": "paragraph", "attrs": {"onclick": "x()", "style": "color:red"}, "content": [text("a")]},
            {"type": "image", "attrs": {"mediaId": MEDIA_ID, "src": "javascript:x", "onerror": "x()"}},
        )
    )
    assert cleaned["content"][0] == para(text("a"))
    assert cleaned["content"][1] == {"type": "image", "attrs": {"mediaId": MEDIA_ID}}


def test_deep_nesting_and_huge_documents_are_rejected():
    node = para(text("x"))
    for _ in range(14):
        node = {"type": "blockquote", "content": [node]}
    with pytest.raises(BodyError):
        clean_doc(doc(node))
    with pytest.raises(BodyError):
        clean_doc(doc(*[para(text("y" * 5000)) for _ in range(80)]))


# ---- rendering -------------------------------------------------------------------------------------


def test_text_is_escaped():
    html = render_html(doc(para(text("<script>alert(1)</script> & <b>"))), {}, "fa")
    assert "<script>" not in html and "&lt;script&gt;" in html and "&amp;" in html


def test_marks_and_structure_render():
    html = render_html(
        doc(
            {"type": "heading", "attrs": {"level": 3}, "content": [text("T")]},
            para(text("a", {"type": "bold"}), text("b", {"type": "italic"}), text("c", {"type": "code"})),
            {"type": "orderedList", "content": [{"type": "listItem", "content": [para(text("one"))]}]},
            {"type": "blockquote", "content": [para(text("q"))]},
            {"type": "horizontalRule"},
        ),
        {},
        "en",
    )
    assert "<h3>T</h3>" in html
    assert "<strong>a</strong><em>b</em><code>c</code>" in html
    assert "<ol><li><p>one</p></li></ol>" in html
    assert "<blockquote><p>q</p></blockquote>" in html and "<hr>" in html


def test_empty_paragraphs_are_not_rendered():
    html = render_html(doc(para(text("a")), {"type": "paragraph"}, para()), {}, "fa")
    assert html == "<p>a</p>"


def test_external_links_get_a_safe_rel():
    html = render_html(doc(para(text("go", {"type": "link", "attrs": {"href": "https://example.com"}}))), {}, "fa")
    assert 'href="https://example.com"' in html and 'rel="noopener noreferrer"' in html


def test_sanitiser_is_a_second_line_of_defence():
    """Even a document that skipped validation can't produce an executable link or attribute."""
    hostile = doc(para(text("x", {"type": "link", "attrs": {"href": "javascript:alert(1)"}})))
    html = render_html(hostile, {}, "fa")
    assert "javascript:" not in html


def test_images_use_the_library_data_and_the_right_alt_text():
    html = render_html(doc({"type": "image", "attrs": {"mediaId": MEDIA_ID}}), media(), "en")
    assert 'alt="text"' in html
    assert 'srcset="/media/a.webp 480w, /media/b.webp 960w"' in html
    assert 'src="/media/b.webp"' in html and 'loading="lazy"' in html
    assert 'width="1200"' in html and "avif" not in html
    assert 'alt="متن"' in render_html(doc({"type": "image", "attrs": {"mediaId": MEDIA_ID}}), media(), "fa")


def test_an_image_that_is_gone_is_left_out():
    assert render_html(doc({"type": "image", "attrs": {"mediaId": MEDIA_ID}}), {}, "fa") == ""


def test_media_ids_are_unique_and_in_order():
    other = str(uuid.uuid4())
    source = doc(
        {"type": "image", "attrs": {"mediaId": other}},
        {"type": "image", "attrs": {"mediaId": MEDIA_ID}},
        {"type": "image", "attrs": {"mediaId": other}},
    )
    assert media_ids(source) == [other, MEDIA_ID]


def test_reading_time_rounds_up_and_is_never_zero():
    assert reading_minutes(doc(), "fa") == 1
    assert reading_minutes(doc(para(text("کلمه " * 181))), "fa") == 2
    assert reading_minutes(doc(para(text("word " * 220))), "en") == 1
    assert reading_minutes(doc(para(text("word " * 221))), "en") == 2
