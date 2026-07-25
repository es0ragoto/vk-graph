"""Shared helpers for vk.gy's markup conventions, used by both page parsers.

The site renders most labels/names as an any--en element (romaji/English) paired with a
sibling any--ja element (native script, often wrapped in literal parens) - but
inconsistently as either `<span>` or `<div>` depending on context (e.g. plain member
names on a band page use spans; some musicians' own profile headers use divs for the
same convention). Matching by class only, regardless of tag name, handles both.
Structured key/value panels ("Data" on band pages, the bio list on musician pages)
share a `.data__item` -> `<h5>label</h5>` + value convention too.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

YEAR_RE = re.compile(r"(?:19|20)\d{2}")


def bilingual_text(tag: Tag | None) -> tuple[str, str | None]:
    """Extract (romaji_name, native_name) from a tag using the any--en/any--ja convention.
    Falls back to the tag's plain text (native=None) when neither is present."""
    if tag is None:
        return "", None
    en_el = tag.find(class_="any--en")
    if en_el is None:
        return tag.get_text(strip=True), None
    name = en_el.get_text(strip=True)
    native = None
    ja_el = tag.find(class_="any--ja")
    if ja_el is not None:
        native_text = ja_el.get_text(strip=True).strip("() ").strip()
        if native_text and native_text != name:
            native = native_text
    return name, native


def parse_data_panel(container: Tag | None) -> dict[str, str]:
    """Read a `.data__item` (h5 label -> value) panel into a plain dict, keyed by the
    English label text. Works for both the band page's div-based panel and the
    musician page's li-based one."""
    data: dict[str, str] = {}
    if container is None:
        return data
    for item in container.find_all(class_="data__item", recursive=True):
        h5 = item.find("h5")
        if h5 is None:
            continue
        label_en = h5.find(class_="any--en")
        label = label_en.get_text(strip=True) if label_en else h5.get_text(strip=True)

        item_copy = BeautifulSoup(str(item), "html.parser")
        h5_copy = item_copy.find("h5")
        if h5_copy is not None:
            h5_copy.decompose()
        value_en = item_copy.find(class_="any--en")
        if value_en is not None and value_en.get_text(strip=True):
            value = value_en.get_text(strip=True)
        else:
            value = item_copy.get_text(strip=True)
        if value:
            data[label] = value
    return data


def parse_year_range(active_text: str | None, status: str | None) -> tuple[int | None, int | None]:
    """Best-effort only: 'Active' text can list several non-contiguous periods
    (e.g. "2004~2007, 2009~2010"). We collapse that to an overall span rather than
    modeling reunions - correctness of the graph never depends on these years."""
    if not active_text:
        return None, None
    years = [int(y) for y in YEAR_RE.findall(active_text)]
    if not years:
        return None, None
    formed = min(years)
    disbanded = max(years) if status and "disbanded" in status.lower() else None
    return formed, disbanded
