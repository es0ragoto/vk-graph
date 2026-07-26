"""Parses a vk.gy band page (e.g. https://vk.gy/artists/phantasmagoria/).

Only pulls what the graph needs: band name/metadata, and the Lineup + Former members
rosters. Deliberately ignores discography, image gallery, news, history log, and
comments - not graph-relevant. Each member's own "Intermittent projects" preview
(shown inline here too) is ignored; that data is only followed from the member's own
page, and only their numbered Eras count as real membership (see musician_page.py).
"""

from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import BandPageData, MemberLink
from .common import bilingual_text, parse_data_panel, parse_year_range


def _parse_member_block(block: Tag, page_url: str) -> MemberLink | None:
    name_h3 = block.find("h3")
    if name_h3 is None:
        return None
    link = name_h3.find("a")
    if link is None or not link.get("href"):
        return None

    name, name_native = bilingual_text(link)
    if not name:
        return None
    musician_url = urljoin(page_url, link["href"])

    instrument = None
    position_h4 = block.find("h4")
    if position_h4 is not None:
        # Simple positions ("vocals", "guitar") are plain text, but qualified ones (e.g.
        # "support guitarist") use the same any--en/any--ja convention as names - route
        # through the same helper so the native half doesn't get concatenated in.
        instrument = bilingual_text(position_h4)[0] or None

    return MemberLink(name=name, name_native=name_native, musician_url=musician_url, instrument=instrument)


def _parse_member_section(soup: BeautifulSoup, anchor_id: str, page_url: str) -> list[MemberLink]:
    anchor = soup.find("span", id=anchor_id)
    if anchor is None:
        return []
    details = anchor.find_parent("details")
    if details is None:
        return []

    members = []
    for wrapper in details.find_all(class_="lineup__wrapper"):
        for block in wrapper.find_all("div", class_="ul", recursive=False):
            member = _parse_member_block(block, page_url)
            if member is not None:
                members.append(member)
    return members


def parse_band_page(html: str, url: str) -> BandPageData:
    soup = BeautifulSoup(html, "html.parser")

    title = soup.find("h1")
    name, name_native = bilingual_text(title) if title else (url, None)

    data_panel = parse_data_panel(soup.select_one(".data__container"))
    formed_year, disbanded_year = parse_year_range(data_panel.get("Active"), data_panel.get("Status"))

    return BandPageData(
        name=name or url,
        name_native=name_native,
        url=url,
        formed_year=formed_year,
        disbanded_year=disbanded_year,
        area=data_panel.get("Area"),
        status=data_panel.get("Status"),
        members=_parse_member_section(soup, "lineup", url),
        former_members=_parse_member_section(soup, "former", url),
    )
