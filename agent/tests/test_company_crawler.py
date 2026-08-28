"""
Test Suite — Agent 9: Company Crawler

Tests the Company Crawler router: URL sanitization, web scraping,
LLM extraction, fallback behavior, and edge cases.
"""
import sys, os, pytest, json
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestSanitizeURL:
    def test_adds_https(self):
        from routers.company_crawler import sanitize_url
        assert sanitize_url("example.com") == "https://example.com"

    def test_preserves_https(self):
        from routers.company_crawler import sanitize_url
        assert sanitize_url("https://example.com") == "https://example.com"

    def test_preserves_http(self):
        from routers.company_crawler import sanitize_url
        assert sanitize_url("http://example.com") == "http://example.com"

    def test_strips_whitespace(self):
        from routers.company_crawler import sanitize_url
        assert sanitize_url("  example.com  ") == "https://example.com"

    def test_www_prefix(self):
        from routers.company_crawler import sanitize_url
        assert sanitize_url("www.example.com") == "https://www.example.com"


class TestScrapeWebsiteContent:
    @pytest.mark.asyncio
    async def test_successful_scrape(self):
        from routers.company_crawler import scrape_website_content

        html = "<html><body><h1>Acme Corp</h1><p>We build software solutions.</p></body></html>"
        mock_resp = MagicMock()
        mock_resp.text = html
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        # AsyncWebCrawler is imported inside the function via `from crawl4ai import ...`
        # We mock the crawl4ai module to raise ImportError
        import types
        fake_crawl4ai = types.ModuleType("crawl4ai")
        fake_crawl4ai.AsyncWebCrawler = MagicMock(side_effect=ImportError("no crawl4ai"))

        with patch.dict("sys.modules", {"crawl4ai": fake_crawl4ai}), \
             patch("httpx.AsyncClient", return_value=mock_client):
            content = await scrape_website_content("https://example.com")

        assert "Acme Corp" in content
        assert "software solutions" in content

    @pytest.mark.asyncio
    async def test_insufficient_content_raises_400(self):
        from routers.company_crawler import scrape_website_content
        from fastapi import HTTPException

        mock_resp = MagicMock()
        mock_resp.text = "<html><body></body></html>"
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        import types
        fake_crawl4ai = types.ModuleType("crawl4ai")
        fake_crawl4ai.AsyncWebCrawler = MagicMock(side_effect=ImportError)

        with patch.dict("sys.modules", {"crawl4ai": fake_crawl4ai}), \
             patch("httpx.AsyncClient", return_value=mock_client), \
             pytest.raises(HTTPException) as exc_info:
            await scrape_website_content("https://empty.com")
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_network_error_raises_400(self):
        from routers.company_crawler import scrape_website_content
        from fastapi import HTTPException

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("Connection timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        import types
        fake_crawl4ai = types.ModuleType("crawl4ai")
        fake_crawl4ai.AsyncWebCrawler = MagicMock(side_effect=ImportError)

        with patch.dict("sys.modules", {"crawl4ai": fake_crawl4ai}), \
             patch("httpx.AsyncClient", return_value=mock_client), \
             pytest.raises(HTTPException) as exc_info:
            await scrape_website_content("https://timeout.com")
        assert exc_info.value.status_code == 400


class TestCrawlCompanyEndpoint:
    @pytest.mark.asyncio
    async def test_successful_crawl_with_llm(self):
        from routers.company_crawler import crawl_company_website, CrawlRequest
        from tests.conftest import MockAIMessage

        llm_response = json.dumps({
            "company_name": "Acme Corp",
            "description": "Enterprise SaaS platform for workflow automation.",
            "industry": "SaaS & Software"
        })

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(content=llm_response))

        with patch("routers.company_crawler.scrape_website_content",
                    AsyncMock(return_value="Acme Corp builds enterprise workflow tools")), \
             patch("routers.company_crawler.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = await crawl_company_website(CrawlRequest(url="acme.com"))

        assert result.success is True
        assert result.company_name == "Acme Corp"
        assert "SaaS" in result.industry

    @pytest.mark.asyncio
    async def test_llm_failure_uses_fallback(self):
        from routers.company_crawler import crawl_company_website, CrawlRequest

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(side_effect=Exception("LLM error"))

        with patch("routers.company_crawler.scrape_website_content",
                    AsyncMock(return_value="Some content from website")), \
             patch("routers.company_crawler.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = await crawl_company_website(CrawlRequest(url="https://fallback.com"))

        assert result.success is True
        assert result.company_name == "Fallback"  # Extracted from domain
        assert result.website == "https://fallback.com"

    @pytest.mark.asyncio
    async def test_llm_returns_markdown_wrapped_json(self):
        from routers.company_crawler import crawl_company_website, CrawlRequest
        from tests.conftest import MockAIMessage

        llm_response = '```json\n{"company_name": "TestCo", "description": "Testing.", "industry": "Tech"}\n```'
        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(content=llm_response))

        with patch("routers.company_crawler.scrape_website_content",
                    AsyncMock(return_value="TestCo builds tech products")), \
             patch("routers.company_crawler.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = await crawl_company_website(CrawlRequest(url="testco.com"))

        assert result.success is True
        assert result.company_name == "TestCo"


class TestCrawlRequestModel:
    def test_crawl_request(self):
        from routers.company_crawler import CrawlRequest
        r = CrawlRequest(url="https://example.com")
        assert r.url == "https://example.com"

    def test_crawl_response_model(self):
        from routers.company_crawler import CrawlResponse
        r = CrawlResponse(success=True, company_name="Test", description="Desc",
                          industry="Tech", website="https://test.com")
        assert r.success is True
        assert r.company_name == "Test"
