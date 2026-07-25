import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scraper.crawler import crawl
from scraper.fetcher import FetchResult
from scraper.models import BandPageData, CareerStop, MemberLink, MusicianPageData

FAKE_BAND_PAGES = {
    "https://fake/artists/a/": ("Band A", ["https://fake/musicians/1/"]),
    "https://fake/artists/b/": ("Band B", ["https://fake/musicians/1/", "https://fake/musicians/2/"]),
    "https://fake/artists/c/": ("Band C", ["https://fake/musicians/2/"]),
}
FAKE_MUSICIAN_PAGES = {
    "https://fake/musicians/1/": ("Musician 1", ["https://fake/artists/a/", "https://fake/artists/b/"]),
    "https://fake/musicians/2/": ("Musician 2", ["https://fake/artists/b/", "https://fake/artists/c/"]),
}


def _fake_parse_band(html: str, url: str) -> BandPageData:
    name, member_urls = FAKE_BAND_PAGES[url]
    members = [MemberLink(name=f"M-{u}", name_native=None, musician_url=u) for u in member_urls]
    return BandPageData(name=name, name_native=None, url=url, members=members, former_members=[])


def _fake_parse_musician(html: str, url: str) -> MusicianPageData:
    name, band_urls = FAKE_MUSICIAN_PAGES[url]
    career = [CareerStop(era_index=i + 1, band_name=f"B-{u}", band_url=u) for i, u in enumerate(band_urls)]
    return MusicianPageData(name=name, name_native=None, url=url, career=career)


class FakeFetcher:
    """Stands in for CachedFetcher: no network, no disk cache, just an in-memory site."""

    def fetch(self, url: str, force_refresh: bool = False) -> FetchResult:
        return FetchResult(html=f"<html>{url}</html>", canonical_url=url, from_cache=False)


@patch("scraper.crawler.parse_musician_page", side_effect=_fake_parse_musician)
@patch("scraper.crawler.parse_band_page", side_effect=_fake_parse_band)
class TestCrawler(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmpdir, ignore_errors=True)
        self.state_path = self.tmpdir / "state.json"

    def test_full_crawl_visits_everything_reachable(self, _mock_band, _mock_musician):
        state = crawl(FakeFetcher(), ["https://fake/artists/a/"], max_bands=10, state_path=self.state_path)
        self.assertEqual(state.visited_bands, set(FAKE_BAND_PAGES.keys()))
        self.assertEqual(state.visited_musicians, set(FAKE_MUSICIAN_PAGES.keys()))

    def test_cap_stops_new_band_fetches_but_finishes_in_flight_musicians(self, _mock_band, _mock_musician):
        state = crawl(FakeFetcher(), ["https://fake/artists/a/"], max_bands=1, state_path=self.state_path)
        self.assertEqual(len(state.visited_bands), 1)
        # Band B is referenced (via musician 1's career) but the cap must stop it being fetched.
        self.assertIn("https://fake/artists/b/", state.referenced_band_urls)
        self.assertNotIn("https://fake/artists/b/", state.visited_bands)

    def test_resume_from_saved_state_continues_past_the_old_cap(self, _mock_band, _mock_musician):
        crawl(FakeFetcher(), ["https://fake/artists/a/"], max_bands=1, state_path=self.state_path)
        resumed = crawl(FakeFetcher(), ["https://fake/artists/a/"], max_bands=10, state_path=self.state_path)
        self.assertEqual(resumed.visited_bands, set(FAKE_BAND_PAGES.keys()))

    def test_fresh_ignores_saved_state(self, _mock_band, _mock_musician):
        crawl(FakeFetcher(), ["https://fake/artists/a/"], max_bands=1, state_path=self.state_path)
        restarted = crawl(
            FakeFetcher(), ["https://fake/artists/a/"], max_bands=1, state_path=self.state_path, fresh=True,
        )
        self.assertEqual(len(restarted.visited_bands), 1)


if __name__ == "__main__":
    unittest.main()
