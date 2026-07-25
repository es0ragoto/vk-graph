import unittest

from scraper.crawler import CrawlState
from scraper.export import build_graph, validate_graph


def make_state() -> CrawlState:
    state = CrawlState()
    state.referenced_band_urls = {
        "https://vk.gy/artists/a/", "https://vk.gy/artists/b/", "https://vk.gy/artists/c/",
    }
    state.referenced_musician_urls = {
        "https://vk.gy/musicians/1/alice/", "https://vk.gy/musicians/2/bob/", "https://vk.gy/musicians/3/carol/",
    }
    state.bands = {
        "https://vk.gy/artists/a/": {
            "name": "Band A", "name_native": None, "url": "https://vk.gy/artists/a/",
            "formed_year": 2000, "disbanded_year": 2005, "area": None, "status": "disbanded",
            "members": [
                {"name": "Alice", "name_native": None, "musician_url": "https://vk.gy/musicians/1/alice/",
                 "instrument": "guitar", "raw_date_text": None},
            ],
            "former_members": [],
        },
        "https://vk.gy/artists/b/": {
            "name": "Band B", "name_native": None, "url": "https://vk.gy/artists/b/",
            "formed_year": 2005, "disbanded_year": None, "area": None, "status": "active",
            "members": [
                {"name": "Alice", "name_native": None, "musician_url": "https://vk.gy/musicians/1/alice/",
                 "instrument": "bass", "raw_date_text": None},
                {"name": "Bob", "name_native": None, "musician_url": "https://vk.gy/musicians/2/bob/",
                 "instrument": "drums", "raw_date_text": None},
            ],
            "former_members": [],
        },
        # Band C is intentionally absent here (referenced but never fetched) -> becomes a stub.
    }
    state.musicians = {
        "https://vk.gy/musicians/1/alice/": {
            "name": "Alice", "name_native": None, "url": "https://vk.gy/musicians/1/alice/",
            "bio": None, "usual_position": "guitar",
            "career": [
                {"era_index": 1, "band_name": "Band A", "band_url": "https://vk.gy/artists/a/",
                 "instrument": None, "start_year": None, "end_year": None},
                {"era_index": 2, "band_name": "Band B", "band_url": "https://vk.gy/artists/b/",
                 "instrument": None, "start_year": None, "end_year": None},
                {"era_index": 3, "band_name": "Band C", "band_url": "https://vk.gy/artists/c/",
                 "instrument": None, "start_year": None, "end_year": None},
            ],
        },
        "https://vk.gy/musicians/2/bob/": {
            "name": "Bob", "name_native": None, "url": "https://vk.gy/musicians/2/bob/",
            "bio": None, "usual_position": "drums",
            "career": [
                {"era_index": 1, "band_name": "Band B", "band_url": "https://vk.gy/artists/b/",
                 "instrument": None, "start_year": None, "end_year": None},
            ],
        },
        # Mirrors a real pattern (e.g. KISAKI's two Phantasmagoria stints, era 12 and 14,
        # with era 13 an irregular-project-only gap): consecutive career entries land on
        # the *same* band. That must not produce a self-loop edge.
        "https://vk.gy/musicians/3/carol/": {
            "name": "Carol", "name_native": None, "url": "https://vk.gy/musicians/3/carol/",
            "bio": None, "usual_position": "vocals",
            "career": [
                {"era_index": 1, "band_name": "Band A", "band_url": "https://vk.gy/artists/a/",
                 "instrument": None, "start_year": None, "end_year": None},
                {"era_index": 2, "band_name": "Band B", "band_url": "https://vk.gy/artists/b/",
                 "instrument": None, "start_year": None, "end_year": None},
                {"era_index": 4, "band_name": "Band B", "band_url": "https://vk.gy/artists/b/",
                 "instrument": None, "start_year": None, "end_year": None},
                {"era_index": 5, "band_name": "Band C", "band_url": "https://vk.gy/artists/c/",
                 "instrument": None, "start_year": None, "end_year": None},
            ],
        },
    }
    return state


class TestBuildGraph(unittest.TestCase):
    def setUp(self):
        self.graph = build_graph(make_state(), "https://vk.gy")

    def test_validates_clean(self):
        self.assertEqual(validate_graph(self.graph), [])

    def test_band_c_is_a_stub_but_still_present(self):
        band_c = next(b for b in self.graph["bands"] if b["name"] == "Band C")
        self.assertTrue(band_c["stub"])

    def test_alice_chain_generates_two_edges_in_order(self):
        alice = next(m for m in self.graph["musicians"] if m["name"] == "Alice")
        self.assertEqual(len(alice["career"]), 3)
        self.assertEqual(len(alice["edge_ids"]), 2)
        edges_by_id = {e["id"]: e for e in self.graph["edges"]}
        first_edge = edges_by_id[alice["edge_ids"][0]]
        self.assertEqual(first_edge["source"], alice["career"][0]["band_id"])
        self.assertEqual(first_edge["target"], alice["career"][1]["band_id"])

    def test_bob_single_band_has_no_edges_but_is_a_member(self):
        bob = next(m for m in self.graph["musicians"] if m["name"] == "Bob")
        self.assertEqual(len(bob["career"]), 1)
        self.assertEqual(bob["edge_ids"], [])
        band_b = next(b for b in self.graph["bands"] if b["name"] == "Band B")
        self.assertIn(bob["id"], band_b["member_ids"])

    def test_instrument_enriched_per_band_with_stub_fallback(self):
        alice = next(m for m in self.graph["musicians"] if m["name"] == "Alice")
        by_era = {c["era_index"]: c["instrument"] for c in alice["career"]}
        self.assertEqual(by_era[1], "guitar")  # from Band A's own roster entry
        self.assertEqual(by_era[2], "bass")  # from Band B's own roster entry (different instrument)
        self.assertEqual(by_era[3], "guitar")  # Band C never crawled -> falls back to usual_position

    def test_band_b_membership_includes_both_musicians(self):
        band_b = next(b for b in self.graph["bands"] if b["name"] == "Band B")
        ids_by_name = {m["name"]: m["id"] for m in self.graph["musicians"]}
        self.assertIn(ids_by_name["Alice"], band_b["member_ids"])
        self.assertIn(ids_by_name["Bob"], band_b["member_ids"])

    def test_consecutive_same_band_eras_produce_no_self_loop_edge(self):
        carol = next(m for m in self.graph["musicians"] if m["name"] == "Carol")
        self.assertEqual(len(carol["career"]), 4)  # all four eras kept, including the repeat
        self.assertEqual(len(carol["edge_ids"]), 2)  # but only A->B and B->C generated
        edges_by_id = {e["id"]: e for e in self.graph["edges"]}
        for edge_id in carol["edge_ids"]:
            edge = edges_by_id[edge_id]
            self.assertNotEqual(edge["source"], edge["target"], "no edge should be a self-loop")
        # sequence_index must be a clean 0..N-1 over the edges that actually exist, not
        # the raw era position (which would otherwise skip a number at the gap).
        self.assertEqual([edges_by_id[eid]["sequence_index"] for eid in carol["edge_ids"]], [0, 1])


class TestValidateGraph(unittest.TestCase):
    def test_catches_dangling_reference(self):
        graph = {
            "meta": {"schema_version": 1, "band_count": 1, "musician_count": 0, "edge_count": 0},
            "bands": [{"id": "b-x", "member_ids": ["m-ghost"]}],
            "musicians": [],
            "edges": [],
        }
        errors = validate_graph(graph)
        self.assertTrue(any("m-ghost" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
