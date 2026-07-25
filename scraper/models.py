from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class MemberLink:
    name: str
    name_native: str | None
    musician_url: str
    instrument: str | None = None
    raw_date_text: str | None = None


@dataclass
class BandPageData:
    name: str
    name_native: str | None
    url: str
    formed_year: int | None = None
    disbanded_year: int | None = None
    area: str | None = None
    status: str | None = None
    members: list[MemberLink] = field(default_factory=list)
    former_members: list[MemberLink] = field(default_factory=list)


@dataclass
class CareerStop:
    era_index: int
    band_name: str
    band_url: str
    instrument: str | None = None
    start_year: int | None = None
    end_year: int | None = None


@dataclass
class MusicianPageData:
    name: str
    name_native: str | None
    url: str
    bio: str | None = None
    usual_position: str | None = None
    career: list[CareerStop] = field(default_factory=list)
