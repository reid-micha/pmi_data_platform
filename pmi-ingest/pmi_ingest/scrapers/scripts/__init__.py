"""JavaScript file loader for Playwright scraper scripts.

Each scraper's `page.evaluate()` / `add_init_script()` JS lives as a
standalone .js file under this directory tree. Cached so every file is
read once per process regardless of how many scraper instances spawn.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).parent


@lru_cache(maxsize=None)
def load_js(path: str) -> str:
    """Load a JS script. `path` is relative to this package.

    Raises `FileNotFoundError` if the file is missing — callers should
    surface that as a setup error, not catch it.
    """
    full_path = _SCRIPTS_DIR / path
    if not full_path.exists():
        raise FileNotFoundError(f"JS script not found: {full_path}")
    return full_path.read_text(encoding="utf-8")
