"""Download Sevda's real portfolio photos from the live site into promo/reel/photos/.

Run this on a computer inside Iran (the server refuses connections from abroad). Needs only Python 3, no packages:

    python3 promo/reel/tools/fetch_site_photos.py            # from the repository root
    python3 fetch_site_photos.py --site https://3evda.com    # or anywhere, with the site address

It reads the public portfolio API (/api/public/portfolio), takes the largest version of every project image and saves
it as photos/<project>-<n>.<ext>. Then commit and push the photos folder (or upload it on GitHub) and the reel can be
rendered with the real work.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent / "photos"
UA = {"User-Agent": "3evda-reel-builder/1.0", "Accept": "application/json"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:  # noqa: S310
        return r.read()


def largest(media: dict) -> dict | None:
    images = [v for v in media.get("variants", []) if v.get("format") in {"jpeg", "jpg", "webp", "png"}]
    return max(images, key=lambda v: (v.get("width") or 0) * (v.get("height") or 0), default=None)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="https://3evda.com")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--max-per-project", type=int, default=4)
    args = ap.parse_args()
    site = args.site.rstrip("/")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    portfolio = json.loads(get(f"{site}/api/public/portfolio"))
    projects = portfolio.get("projects", [])
    print(f"{len(projects)} projects")
    saved = 0
    index = []
    for p in projects:
        slug = p["slug"]
        detail = json.loads(get(f"{site}/api/public/portfolio/{urllib.parse.quote(slug)}"))
        for n, img in enumerate(detail.get("images", [])[: args.max_per_project], start=1):
            v = largest(img["media"])
            if not v:
                continue
            url = urllib.parse.urljoin(site + "/", v["url"])
            ext = "jpg" if v["format"] in {"jpeg", "jpg"} else v["format"]
            dest = out / f"{slug}-{n}.{ext}"
            dest.write_bytes(get(url))
            saved += 1
            index.append({"file": dest.name, "project": p.get("title_fa"), "category": p.get("category"),
                          "style": p.get("style"), "caption": img.get("caption_fa")})
            print(f"  {dest.name}  {v.get('width')}x{v.get('height')}")
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{saved} photos saved in {out}")
    if not saved:
        sys.exit("No photos found: is the portfolio published on the site?")


if __name__ == "__main__":
    main()
