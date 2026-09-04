"""
Test Suite — Intelligent Sitemap Crawler & LLM Curation (Strategy B)

Tests URL normalization, sitemap discovery (robots.txt & XML),
Gemini LLM curation, batch scraping, and the FastAPI scrape-site endpoint.
"""
import sys, os, pytest, json
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.sitemap_crawler import (
    sanitize_url,
    normalize_url,
    discover_sitemap_urls,
    curate_urls_with_llm,
    batch_scrape_urls,
)


class TestURLUtilities:
    def test_sanitize_url(self):
        assert sanitize_url("example.com") == "https://example.com"
        assert sanitize_url("https://example.com") == "https://example.com"
        assert sanitize_url("http://example.com/path") == "http://example.com/path"

    def test_normalize_url_same_domain(self):
        norm = normalize_url("https://example.com/about#section", "example.com")
        assert norm == "https://example.com/about"

    def test_normalize_url_rejects_external_domain(self):
        norm = normalize_url("https://google.com/search", "example.com")
        assert norm is None

    def test_normalize_url_rejects_binary_extensions(self):
        assert normalize_url("https://example.com/image.png", "example.com") is None
        assert normalize_url("https://example.com/doc.pdf", "example.com") is None
        assert normalize_url("https://example.com/style.css", "example.com") is None
        assert normalize_url("https://example.com/app.js", "example.com") is None

    def test_normalize_url_trailing_slash(self):
        norm = normalize_url("https://example.com/pricing/", "example.com")
        assert norm == "https://example.com/pricing"


class TestSitemapDiscovery:
    @pytest.mark.asyncio
    async def test_discover_from_sitemap_xml(self):
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/about</loc></url>
            <url><loc>https://example.com/pricing</loc></url>
            <url><loc>https://example.com/logo.png</loc></url>
        </urlset>"""

        mock_robots = MagicMock()
        mock_robots.status_code = 404

        mock_sitemap = MagicMock()
        mock_sitemap.status_code = 200
        mock_sitemap.headers = {"content-type": "application/xml"}
        mock_sitemap.text = xml_content

        mock_client = AsyncMock()

        async def mock_get(url, **kwargs):
            if "robots.txt" in url:
                return mock_robots
            if "sitemap.xml" in url:
                return mock_sitemap
            res = MagicMock()
            res.status_code = 404
            return res

        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            urls = await discover_sitemap_urls("https://example.com")

        assert "https://example.com/about" in urls
        assert "https://example.com/pricing" in urls
        assert "https://example.com/logo.png" not in urls # Ignored extension

    @pytest.mark.asyncio
    async def test_fallback_to_anchor_links(self):
        html_content = """<html><body>
            <a href="/features">Features</a>
            <a href="/docs/api">Docs</a>
            <a href="https://other.com">External</a>
        </body></html>"""

        mock_client = AsyncMock()

        async def mock_get(url, **kwargs):
            res = MagicMock()
            if url.endswith("/robots.txt") or "sitemap" in url:
                res.status_code = 404
            else:
                res.status_code = 200
                res.text = html_content
            return res

        mock_client.get = AsyncMock(side_effect=mock_get)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            urls = await discover_sitemap_urls("https://example.com")

        assert "https://example.com/features" in urls
        assert "https://example.com/docs/api" in urls
        assert "https://other.com" not in urls


class TestLLMCuration:
    @pytest.mark.asyncio
    async def test_curate_urls_with_llm(self):
        discovered = [
            "https://example.com",
            "https://example.com/pricing",
            "https://example.com/about",
            "https://example.com/careers/job/123",
            "https://example.com/fr/about",
        ]

        mock_llm_response = MagicMock()
        mock_llm_response.content = json.dumps([
            "https://example.com",
            "https://example.com/pricing",
            "https://example.com/about"
        ])

        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response)

        with patch("services.sitemap_crawler.get_llm", return_value=mock_llm):
            curated = await curate_urls_with_llm(discovered, "https://example.com", max_curated=3)

        assert len(curated) == 3
        assert "https://example.com/pricing" in curated
        assert "https://example.com/about" in curated
        assert "https://example.com/careers/job/123" not in curated

    @pytest.mark.asyncio
    async def test_curate_urls_heuristic_fallback(self):
        discovered = [
            "https://example.com",
            "https://example.com/pricing",
            "https://example.com/about",
            "https://example.com/tag/news?page=2",
        ]

        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(side_effect=Exception("LLM Unavailable"))

        with patch("services.sitemap_crawler.get_llm", return_value=mock_llm):
            curated = await curate_urls_with_llm(discovered, "https://example.com", max_curated=2)

        assert len(curated) <= 2
        assert "https://example.com" in curated


class TestBatchScrape:
    @pytest.mark.asyncio
    async def test_batch_scrape_http_fallback(self):
        urls = [
            "https://example.com/page1",
            "https://example.com/page2",
        ]

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = "<html><body><h1>Enterprise AI</h1><p>Workflow automation platform</p></body></html>"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        import types
        fake_crawl4ai = types.ModuleType("crawl4ai")
        fake_crawl4ai.AsyncWebCrawler = MagicMock(side_effect=ImportError("No crawl4ai"))

        with patch.dict("sys.modules", {"crawl4ai": fake_crawl4ai}), \
             patch("httpx.AsyncClient", return_value=mock_client):
            results = await batch_scrape_urls(urls, max_concurrency=2)

        assert len(results) == 2
        for r in results:
            assert r["success"] is True
            assert "Enterprise AI" in r["markdown"]
            assert r["method"] == "http_fallback"
