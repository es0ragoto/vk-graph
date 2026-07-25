from __future__ import annotations

import hashlib
import json
import random
import time
from dataclasses import dataclass
from pathlib import Path

import requests


class FetchError(Exception):
    pass


@dataclass
class FetchResult:
    html: str
    canonical_url: str
    from_cache: bool


class CachedFetcher:
    """Rate-limited HTTP GET with an on-disk HTML cache keyed by URL.

    Cache hits skip the rate limit entirely, so re-running a crawl or iterating on
    parsers later costs zero network traffic. Delay between real requests is a random
    value in [min_delay, max_delay], not a fixed interval - gentler on the server and
    less bot-like than a metronomic delay.
    """

    def __init__(self, session: requests.Session, cache_dir: Path, min_delay: float = 3.0, max_delay: float = 8.0):
        self.session = session
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.min_delay = min_delay
        self.max_delay = max_delay
        self._last_request_time: float | None = None

    def _cache_paths(self, url: str) -> tuple[Path, Path]:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.html", self.cache_dir / f"{digest}.meta.json"

    def _read_cache(self, url: str) -> FetchResult | None:
        html_path, meta_path = self._cache_paths(url)
        if not html_path.exists() or not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        html = html_path.read_text(encoding="utf-8")
        return FetchResult(html=html, canonical_url=meta["canonical_url"], from_cache=True)

    def _write_cache(self, url: str, html: str, canonical_url: str) -> None:
        html_path, meta_path = self._cache_paths(url)
        html_path.write_text(html, encoding="utf-8")
        meta_path.write_text(json.dumps({"url": url, "canonical_url": canonical_url}), encoding="utf-8")

    def _wait_for_rate_limit(self) -> None:
        if self._last_request_time is None:
            return
        target_delay = random.uniform(self.min_delay, self.max_delay)
        elapsed = time.monotonic() - self._last_request_time
        remaining = target_delay - elapsed
        if remaining > 0:
            time.sleep(remaining)

    def fetch(self, url: str, force_refresh: bool = False) -> FetchResult:
        if not force_refresh:
            cached = self._read_cache(url)
            if cached is not None:
                return cached

        self._wait_for_rate_limit()
        resp = self.session.get(url, timeout=20)
        self._last_request_time = time.monotonic()
        if resp.status_code != 200:
            raise FetchError(f"GET {url} -> HTTP {resp.status_code}")

        canonical_url = resp.url
        self._write_cache(url, resp.text, canonical_url)
        if canonical_url != url:
            self._write_cache(canonical_url, resp.text, canonical_url)
        return FetchResult(html=resp.text, canonical_url=canonical_url, from_cache=False)
