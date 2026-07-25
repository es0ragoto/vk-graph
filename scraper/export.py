from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from .crawler import CrawlState


def _slugify(url: str) -> str:
    """Drop the leading collection segment ('artists'/'musicians') and join what's left,
    so ids stay unique (musician urls carry a numeric id) without being redundant with
    the b-/m- prefix already added by callers."""
    parts = [p for p in urlparse(url).path.split("/") if p]
    if len(parts) > 1:
        parts = parts[1:]
    return "-".join(parts) if parts else "root"


def build_graph(state: CrawlState, source_base_url: str) -> dict:
    band_id_by_url: dict[str, str] = {url: f"b-{_slugify(url)}" for url in sorted(state.referenced_band_urls)}
    musician_id_by_url: dict[str, str] = {
        url: f"m-{_slugify(url)}" for url in sorted(state.referenced_musician_urls)
    }

    # Cross-referencing data gathered purely from crawled pages: which instrument a
    # musician played in a given band, any native-script name spotted for them, and a
    # human-readable name for any band that's only ever seen as a stub (referenced from
    # a career list, but its own page was never fetched). Musician pages don't carry
    # per-era instrument or a reliable native name, so we enrich from whichever band
    # page actually listed that person; conversely a stub band's only display name may
    # come from how a musician's career list refers to it.
    instrument_by_pair: dict[tuple[str, str], str] = {}
    native_name_by_musician: dict[str, str] = {}
    name_by_musician: dict[str, str] = {}
    for band_url, raw_band in state.bands.items():
        for member in [*raw_band["members"], *raw_band["former_members"]]:
            m_url = member["musician_url"]
            if member.get("instrument"):
                instrument_by_pair[(m_url, band_url)] = member["instrument"]
            if member.get("name_native") and m_url not in native_name_by_musician:
                native_name_by_musician[m_url] = member["name_native"]
            if member.get("name") and m_url not in name_by_musician:
                name_by_musician[m_url] = member["name"]

    name_by_band: dict[str, str] = {}
    for raw_musician in state.musicians.values():
        for stop in raw_musician["career"]:
            b_url = stop["band_url"]
            if stop.get("band_name") and b_url not in name_by_band:
                name_by_band[b_url] = stop["band_name"]

    bands: list[dict] = []
    for url, band_id in band_id_by_url.items():
        raw = state.bands.get(url)
        if raw is None:
            bands.append({
                "id": band_id, "name": name_by_band.get(url) or _slugify(url), "name_native": None,
                "source_url": url, "formed_year": None, "disbanded_year": None, "stub": True, "member_ids": [],
            })
            continue
        member_urls = {m["musician_url"] for m in [*raw["members"], *raw["former_members"]]}
        bands.append({
            "id": band_id,
            "name": raw["name"],
            "name_native": raw["name_native"],
            "source_url": url,
            "formed_year": raw.get("formed_year"),
            "disbanded_year": raw.get("disbanded_year"),
            "stub": False,
            "member_ids": sorted(musician_id_by_url[u] for u in member_urls if u in musician_id_by_url),
        })
    bands_by_id = {b["id"]: b for b in bands}

    def ensure_stub_band(band_url: str, fallback_name: str) -> str:
        band_id = band_id_by_url.get(band_url)
        if band_id is None:
            band_id = f"b-{_slugify(band_url)}"
            band_id_by_url[band_url] = band_id
            stub = {
                "id": band_id, "name": fallback_name, "name_native": None, "source_url": band_url,
                "formed_year": None, "disbanded_year": None, "stub": True, "member_ids": [],
            }
            bands.append(stub)
            bands_by_id[band_id] = stub
        return band_id

    musicians: list[dict] = []
    edges: list[dict] = []
    extra_members_by_band: dict[str, set[str]] = {}

    for url, musician_id in musician_id_by_url.items():
        raw = state.musicians.get(url)
        if raw is None:
            musicians.append({
                "id": musician_id, "name": name_by_musician.get(url) or _slugify(url),
                "name_native": native_name_by_musician.get(url),
                "source_url": url, "bio": None, "stub": True, "career": [], "edge_ids": [],
            })
            continue

        career = []
        for stop in raw["career"]:
            band_id = ensure_stub_band(stop["band_url"], stop.get("band_name") or _slugify(stop["band_url"]))
            extra_members_by_band.setdefault(band_id, set()).add(musician_id)
            instrument = instrument_by_pair.get((url, stop["band_url"])) or raw.get("usual_position")
            career.append({
                "era_index": stop["era_index"],
                "band_id": band_id,
                "instrument": instrument,
                "start_year": stop.get("start_year"),
                "end_year": stop.get("end_year"),
            })
        career.sort(key=lambda c: c["era_index"])

        edge_ids = []
        for i in range(len(career) - 1):
            edge_id = f"e-{_slugify(url)}-{i}"
            edge_ids.append(edge_id)
            edges.append({
                "id": edge_id,
                "musician_id": musician_id,
                "source": career[i]["band_id"],
                "target": career[i + 1]["band_id"],
                "sequence_index": i,
                "from_year": career[i + 1]["start_year"],
                "concurrent": False,
            })

        musicians.append({
            "id": musician_id,
            "name": raw["name"],
            "name_native": raw.get("name_native") or native_name_by_musician.get(url),
            "source_url": url,
            "bio": raw.get("bio"),
            "stub": False,
            "career": career,
            "edge_ids": edge_ids,
        })

    for band_id, extra_ids in extra_members_by_band.items():
        band = bands_by_id[band_id]
        band["member_ids"] = sorted(set(band["member_ids"]) | extra_ids)

    graph = {
        "meta": {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source_base_url": source_base_url,
            "band_count": len(bands),
            "musician_count": len(musicians),
            "edge_count": len(edges),
        },
        "bands": bands,
        "musicians": musicians,
        "edges": edges,
    }
    errors = validate_graph(graph)
    if errors:
        raise ValueError("Graph failed validation:\n" + "\n".join(errors))
    return graph


def validate_graph(graph: dict) -> list[str]:
    errors: list[str] = []
    band_ids = [b["id"] for b in graph["bands"]]
    musician_ids = [m["id"] for m in graph["musicians"]]
    edge_ids = [e["id"] for e in graph["edges"]]
    band_id_set, musician_id_set, edge_id_set = set(band_ids), set(musician_ids), set(edge_ids)

    if len(band_id_set) != len(band_ids):
        errors.append("Duplicate band ids detected.")
    if len(musician_id_set) != len(musician_ids):
        errors.append("Duplicate musician ids detected.")
    if len(edge_id_set) != len(edge_ids):
        errors.append("Duplicate edge ids detected.")

    for b in graph["bands"]:
        for mid in b["member_ids"]:
            if mid not in musician_id_set:
                errors.append(f"Band {b['id']} references unknown musician {mid}")

    for m in graph["musicians"]:
        for stop in m["career"]:
            if stop["band_id"] not in band_id_set:
                errors.append(f"Musician {m['id']} career references unknown band {stop['band_id']}")
        for eid in m["edge_ids"]:
            if eid not in edge_id_set:
                errors.append(f"Musician {m['id']} references unknown edge {eid}")

    for e in graph["edges"]:
        if e["source"] not in band_id_set:
            errors.append(f"Edge {e['id']} has unknown source {e['source']}")
        if e["target"] not in band_id_set:
            errors.append(f"Edge {e['id']} has unknown target {e['target']}")
        if e["musician_id"] not in musician_id_set:
            errors.append(f"Edge {e['id']} has unknown musician {e['musician_id']}")

    meta = graph["meta"]
    if meta["band_count"] != len(graph["bands"]):
        errors.append("meta.band_count mismatch")
    if meta["musician_count"] != len(graph["musicians"]):
        errors.append("meta.musician_count mismatch")
    if meta["edge_count"] != len(graph["edges"]):
        errors.append("meta.edge_count mismatch")

    return errors
