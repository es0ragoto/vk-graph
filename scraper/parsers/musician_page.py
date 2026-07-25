"""Parses a vk.gy musician page (e.g. https://vk.gy/musicians/5/riku/).

The page shows a numbered "Era #N" chronology - this is the authoritative, explicitly
ordered source for a musician's career path (not a parsed date). Each era can carry a
nested "Irregular projects" block (support/session/solo work); those are deliberately
skipped - not followed, not stored - per the "only real band eras count as membership"
scoping decision.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import CareerStop, MusicianPageData
from .common import bilingual_text, parse_data_panel

ERA_NUMBER_RE = re.compile(r"Era\s*#\s*(\d+)", re.IGNORECASE)


def _is_image_link(a: Tag) -> bool:
    classes = a.get("class") or []
    return "era__image" in classes


def _find_band_link(era_container: Tag) -> Tag | None:
    for a in era_container.find_all("a", href=True):
        if _is_image_link(a):
            continue
        if a.find_parent(class_="era__irregular") is not None:
            continue
        return a
    return None


def _parse_era(era_container: Tag, page_url: str) -> CareerStop | None:
    h5 = era_container.find("h5")
    if h5 is None:
        return None
    match = ERA_NUMBER_RE.search(h5.get_text(strip=True))
    if not match:
        return None
    era_index = int(match.group(1))

    band_link = _find_band_link(era_container)
    if band_link is None or not band_link.get("href"):
        return None
    band_name, _band_name_native = bilingual_text(band_link)
    if not band_name:
        return None
    band_url = urljoin(page_url, band_link["href"])

    return CareerStop(era_index=era_index, band_name=band_name, band_url=band_url)


def parse_musician_page(html: str, url: str) -> MusicianPageData:
    soup = BeautifulSoup(html, "html.parser")

    name_h2 = soup.find("h2")
    name, name_native = bilingual_text(name_h2) if name_h2 else (url, None)

    data_panel = parse_data_panel(soup.select_one(".data__container"))

    career = []
    for era_container in soup.find_all("div", class_="era__container"):
        stop = _parse_era(era_container, url)
        if stop is not None:
            career.append(stop)
    career.sort(key=lambda c: c.era_index)

    return MusicianPageData(
        name=name or url,
        name_native=name_native,
        url=url,
        bio=None,
        usual_position=data_panel.get("Usual position"),
        career=career,
    )
