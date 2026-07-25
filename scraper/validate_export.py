"""Standalone sanity check for an already-written graph.json.

Usage: python -m scraper.validate_export path/to/graph.json
"""

from __future__ import annotations

import json
import sys

from .export import validate_graph


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 1:
        print("Usage: python -m scraper.validate_export path/to/graph.json", file=sys.stderr)
        return 2

    graph = json.loads(open(argv[0], encoding="utf-8").read())
    errors = validate_graph(graph)
    meta = graph.get("meta", {})
    print(f"bands={meta.get('band_count')} musicians={meta.get('musician_count')} edges={meta.get('edge_count')}")

    if errors:
        print(f"FAILED - {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK - graph is internally consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
