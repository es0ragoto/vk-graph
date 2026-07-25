import unittest
from pathlib import Path

from scraper.parsers.band_page import parse_band_page
from scraper.parsers.musician_page import parse_musician_page

FIXTURES = Path(__file__).parent / "fixtures"


class TestBandPageParser(unittest.TestCase):
    def setUp(self):
        html = (FIXTURES / "real_band_page.html").read_text(encoding="utf-8")
        self.band = parse_band_page(html, "https://vk.gy/artists/phantasmagoria/")

    def test_basic_metadata(self):
        self.assertEqual(self.band.name, "Phantasmagoria")
        self.assertEqual(self.band.area, "Osaka")
        self.assertEqual(self.band.status, "disbanded")
        self.assertEqual(self.band.formed_year, 2004)
        self.assertEqual(self.band.disbanded_year, 2010)

    def test_current_lineup(self):
        names = {m.name for m in self.band.members}
        self.assertEqual(names, {"RIKU", "JUN", "IORI", "KISAKI", "MATOI"})
        riku = next(m for m in self.band.members if m.name == "RIKU")
        self.assertEqual(riku.name_native, "戮")
        self.assertEqual(riku.instrument, "vocals")
        self.assertEqual(riku.musician_url, "https://vk.gy/musicians/5/riku/")

    def test_former_members(self):
        self.assertEqual(len(self.band.former_members), 1)
        self.assertEqual(self.band.former_members[0].name, "Shion")
        self.assertEqual(self.band.former_members[0].instrument, "drums")

    def test_no_session_or_history_leakage(self):
        # "Intermittent projects" / inline band-history previews must never leak into the roster.
        all_names = {m.name for m in self.band.members + self.band.former_members}
        self.assertNotIn("Zaidan Houjin Kurojuuji", all_names)
        self.assertNotIn("KISAKI PROJECT feat.Jui", all_names)
        self.assertEqual(len(self.band.members), 5)


class TestMusicianPageParser(unittest.TestCase):
    def setUp(self):
        html = (FIXTURES / "real_musician_page.html").read_text(encoding="utf-8")
        self.musician = parse_musician_page(html, "https://vk.gy/musicians/5/riku/")

    def test_basic_metadata(self):
        self.assertEqual(self.musician.name, "RIKU")
        self.assertEqual(self.musician.usual_position, "vocals")

    def test_era_chronology_order_and_content(self):
        bands_in_order = [c.band_name for c in self.musician.career]
        self.assertEqual(
            bands_in_order,
            ["KAWON", "HISKAREA", "Phantasmagoria", "chariots", "LIN -the end of corruption world-",
             "chariots requiem", "chariots", "Riku"],
        )
        # era_index is the site's own numbering - not required to be contiguous (era 8 is
        # genuinely absent on the live page), and edge generation only cares about array order.
        self.assertEqual([c.era_index for c in self.musician.career], [1, 2, 3, 4, 5, 6, 7, 9])

    def test_irregular_projects_excluded(self):
        band_urls = {c.band_url for c in self.musician.career}
        self.assertNotIn("https://vk.gy/artists/zaidan-houjin-kurojuuji/", band_urls)
        self.assertNotIn("https://vk.gy/artists/bloodly-clown/", band_urls)


if __name__ == "__main__":
    unittest.main()
