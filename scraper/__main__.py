"""Entry point: python -m scraper --seed-url https://vk.gy/artists/<some-band>/

Runs anonymously (band/musician pages are publicly readable on vk.gy), rate-limits
itself with a randomized delay between requests, and resumes from any saved crawl
state unless --fresh is passed. Progress is checkpointed periodically, so an
interrupted run picks back up rather than starting over.
"""

from __future__ import annotations

import json
import sys

from .auth import build_anonymous_session
from .config import parse_args
from .crawler import crawl
from .export import build_graph
from .fetcher import CachedFetcher


def main(argv: list[str] | None = None) -> int:
    config = parse_args(argv)

    session = build_anonymous_session()
    fetcher = CachedFetcher(
        session=session,
        cache_dir=config.cache_dir,
        min_delay=config.min_delay,
        max_delay=config.max_delay,
    )

    print(f"Crawling from {config.seed_urls} (cap: {config.max_bands} bands)...")
    state = crawl(
        fetcher=fetcher,
        seed_band_urls=config.seed_urls,
        max_bands=config.max_bands,
        state_path=config.state_file,
        fresh=config.fresh,
    )
    print(f"Crawled {len(state.visited_bands)} bands, {len(state.visited_musicians)} musicians, "
          f"{len(state.warnings)} warnings.")

    if state.warnings:
        config.warnings_file.parent.mkdir(parents=True, exist_ok=True)
        config.warnings_file.write_text(json.dumps(state.warnings, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Warnings written to {config.warnings_file}")

    graph = build_graph(state, source_base_url=config.base_url)
    config.output_file.parent.mkdir(parents=True, exist_ok=True)
    config.output_file.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Graph written to {config.output_file} "
          f"({graph['meta']['band_count']} bands, {graph['meta']['musician_count']} musicians, "
          f"{graph['meta']['edge_count']} edges).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
