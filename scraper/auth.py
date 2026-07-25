"""Optional login support.

Band and musician pages on vk.gy were confirmed publicly readable without an account -
only interactive features (e.g. "add to list") require sign-in. The crawler therefore
runs anonymously by default via build_anonymous_session(). login() exists as a fallback,
only needed if some page we actually need turns out to be gated; its selectors are
placeholders until that happens.
"""

from __future__ import annotations

import requests
from bs4 import BeautifulSoup

LOGIN_URL_PATH = "/login"  # placeholder
LOGIN_FORM_SELECTOR = "form"  # placeholder
USERNAME_FIELD = "username"  # placeholder
PASSWORD_FIELD = "password"  # placeholder

USER_AGENT = "vk-graph-scraper/0.1 (personal research project)"


def build_anonymous_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def extract_hidden_fields(html: str, form_selector: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    form = soup.select_one(form_selector)
    if not form:
        return {}
    return {
        inp.get("name"): inp.get("value", "")
        for inp in form.select("input[type=hidden]")
        if inp.get("name")
    }


def login(session: requests.Session, base_url: str, username: str, password: str) -> None:
    login_url = base_url.rstrip("/") + LOGIN_URL_PATH
    resp = session.get(login_url, timeout=15)
    hidden = extract_hidden_fields(resp.text, LOGIN_FORM_SELECTOR)
    payload = {**hidden, USERNAME_FIELD: username, PASSWORD_FIELD: password}
    resp = session.post(login_url, data=payload, timeout=15)
    if "logout" not in resp.text.lower():
        raise RuntimeError("Login failed - check field names/selector in scraper/auth.py")
