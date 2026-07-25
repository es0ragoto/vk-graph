from __future__ import annotations

import json
from collections import deque
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .fetcher import CachedFetcher, FetchError
from .parsers.band_page import parse_band_page
from .parsers.musician_page import parse_musician_page


@dataclass
class CrawlState:
    queue: deque = field(default_factory=deque)  # deque of [url, kind] where kind is "band"/"musician"
    queued_urls: set = field(default_factory=set)  # urls currently pending in queue (avoids duplicate entries)
    visited_bands: set = field(default_factory=set)  # canonical urls actually fetched+parsed
    visited_musicians: set = field(default_factory=set)
    deferred_band_urls: set = field(default_factory=set)  # skipped only because the cap was hit
    referenced_band_urls: set = field(default_factory=set)  # every band url ever referenced, visited or not
    referenced_musician_urls: set = field(default_factory=set)
    bands: dict = field(default_factory=dict)  # canonical_url -> BandPageData as dict
    musicians: dict = field(default_factory=dict)  # canonical_url -> MusicianPageData as dict
    warnings: list = field(default_factory=list)

    def enqueue(self, url: str, kind: str) -> None:
        if url in self.queued_urls:
            return
        self.queued_urls.add(url)
        self.queue.append([url, kind])

    def to_json(self) -> dict:
        return {
            "queue": list(self.queue),
            "queued_urls": sorted(self.queued_urls),
            "visited_bands": sorted(self.visited_bands),
            "visited_musicians": sorted(self.visited_musicians),
            "deferred_band_urls": sorted(self.deferred_band_urls),
            "referenced_band_urls": sorted(self.referenced_band_urls),
            "referenced_musician_urls": sorted(self.referenced_musician_urls),
            "bands": self.bands,
            "musicians": self.musicians,
            "warnings": self.warnings,
        }

    @classmethod
    def from_json(cls, data: dict) -> CrawlState:
        return cls(
            queue=deque(tuple(x) for x in data.get("queue", [])),
            queued_urls=set(data.get("queued_urls", [])),
            visited_bands=set(data.get("visited_bands", [])),
            visited_musicians=set(data.get("visited_musicians", [])),
            deferred_band_urls=set(data.get("deferred_band_urls", [])),
            referenced_band_urls=set(data.get("referenced_band_urls", [])),
            referenced_musician_urls=set(data.get("referenced_musician_urls", [])),
            bands=data.get("bands", {}),
            musicians=data.get("musicians", {}),
            warnings=data.get("warnings", []),
        )

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_json(), indent=2, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> CrawlState:
        return cls.from_json(json.loads(path.read_text(encoding="utf-8")))


def crawl(
    fetcher: CachedFetcher,
    seed_band_urls: list[str],
    max_bands: int,
    state_path: Path,
    fresh: bool = False,
    checkpoint_every: int = 10,
) -> CrawlState:
    """BFS: band -> its members' musician pages -> each musician's Era band pages -> ...
    capped at max_bands *fetched* bands. Once the cap is hit, new band pages are recorded
    in deferred_band_urls instead of fetched - not dropped - so resuming later with a
    larger --max-bands picks them back up. Musician pages already queued still finish
    processing either way, so a career in flight isn't truncated mid-path. Any band or
    musician referenced but never fetched becomes a stub at export time.
    """
    if not fresh and state_path.exists():
        state = CrawlState.load(state_path)
    else:
        state = CrawlState()

    if not state.queue and not state.visited_bands:
        for url in seed_band_urls:
            state.referenced_band_urls.add(url)
            state.enqueue(url, "band")

    # Re-offer anything previously deferred due to a lower cap - relevant on resume
    # after raising --max-bands. No-op if nothing was ever deferred.
    for url in sorted(state.deferred_band_urls):
        if url not in state.visited_bands:
            state.enqueue(url, "band")

    processed = 0
    while state.queue:
        url, kind = state.queue.popleft()
        state.queued_urls.discard(url)
        try:
            if kind == "band":
                if url in state.visited_bands:
                    continue
                if len(state.visited_bands) >= max_bands:
                    state.deferred_band_urls.add(url)
                    continue
                state.deferred_band_urls.discard(url)
                result = fetcher.fetch(url)
                data = parse_band_page(result.html, result.canonical_url)
                state.bands[result.canonical_url] = asdict(data)
                state.visited_bands.add(result.canonical_url)
                for member in [*data.members, *data.former_members]:
                    state.referenced_musician_urls.add(member.musician_url)
                    state.enqueue(member.musician_url, "musician")
            else:
                if url in state.visited_musicians:
                    continue
                result = fetcher.fetch(url)
                data = parse_musician_page(result.html, result.canonical_url)
                state.musicians[result.canonical_url] = asdict(data)
                state.visited_musicians.add(result.canonical_url)
                for stop in data.career:
                    state.referenced_band_urls.add(stop.band_url)
                    state.enqueue(stop.band_url, "band")
        except FetchError as e:
            state.warnings.append({"url": url, "kind": kind, "error": str(e)})
        except Exception as e:  # noqa: BLE001 - one bad page must not kill a long crawl
            state.warnings.append({"url": url, "kind": kind, "error": f"{type(e).__name__}: {e}"})

        processed += 1
        if processed % checkpoint_every == 0:
            state.save(state_path)

    state.save(state_path)
    return state
