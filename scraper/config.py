from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path

SCRAPER_DIR = Path(__file__).parent
DEFAULT_CACHE_DIR = SCRAPER_DIR / "cache" / "html"
DEFAULT_STATE_FILE = SCRAPER_DIR / "state" / "crawl_state.json"
DEFAULT_OUTPUT = SCRAPER_DIR.parent / "frontend" / "public" / "data" / "graph.json"
DEFAULT_WARNINGS_FILE = SCRAPER_DIR / "output" / "warnings.json"
SECRETS_PATH = SCRAPER_DIR / ".secrets.json"

DEFAULT_BASE_URL = "https://vk.gy"
DEFAULT_MAX_BANDS = 200
# Gentle by default - random delay range, not a fixed interval. Fine to wait; not in a hurry.
DEFAULT_MIN_DELAY = 3.0
DEFAULT_MAX_DELAY = 8.0


@dataclass
class ScraperConfig:
    seed_urls: list[str]
    base_url: str = DEFAULT_BASE_URL
    max_bands: int = DEFAULT_MAX_BANDS
    min_delay: float = DEFAULT_MIN_DELAY
    max_delay: float = DEFAULT_MAX_DELAY
    cache_dir: Path = DEFAULT_CACHE_DIR
    state_file: Path = DEFAULT_STATE_FILE
    output_file: Path = DEFAULT_OUTPUT
    warnings_file: Path = DEFAULT_WARNINGS_FILE
    fresh: bool = False


def load_secrets() -> dict:
    """Only needed if a page ever turns out to require login - band/musician pages don't."""
    if SECRETS_PATH.exists():
        return json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
    return {
        "username": os.environ.get("WIKI_USERNAME", ""),
        "password": os.environ.get("WIKI_PASSWORD", ""),
    }


def parse_args(argv: list[str] | None = None) -> ScraperConfig:
    parser = argparse.ArgumentParser(description="Scrape a subset of the vk.gy band/musician graph.")
    parser.add_argument("--seed-url", action="append", dest="seed_urls", required=True,
                         help="Band page URL to start crawling from (repeatable).")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--max-bands", type=int, default=DEFAULT_MAX_BANDS)
    parser.add_argument("--min-delay", type=float, default=DEFAULT_MIN_DELAY)
    parser.add_argument("--max-delay", type=float, default=DEFAULT_MAX_DELAY)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--state-file", type=Path, default=DEFAULT_STATE_FILE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--warnings-file", type=Path, default=DEFAULT_WARNINGS_FILE)
    parser.add_argument("--fresh", action="store_true", help="Discard any saved crawl state and start over.")
    args = parser.parse_args(argv)
    return ScraperConfig(
        seed_urls=args.seed_urls,
        base_url=args.base_url,
        max_bands=args.max_bands,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        cache_dir=args.cache_dir,
        state_file=args.state_file,
        output_file=args.output,
        warnings_file=args.warnings_file,
        fresh=args.fresh,
    )
