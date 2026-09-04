from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional
import asyncio
import logging
import httpx
from bs4 import BeautifulSoup
from services.sitemap_crawler import (
    discover_sitemap_urls,
    curate_urls_with_llm,
    batch_scrape_urls,
)

logger = logging.getLogger(__name__)

try:
    from crawl4ai import AsyncWebCrawler
except ImportError:
    AsyncWebCrawler = None

router = APIRouter()

class ScrapeRequest(BaseModel):
    url: HttpUrl

class ScrapedPageItem(BaseModel):
    url: str
    title: str = ""
    markdown: str
    method: str = "none"
    success: bool = True

class ScrapeSiteRequest(BaseModel):
    url: HttpUrl
    max_pages: int = Field(default=30, ge=1, le=100)

class ScrapeSiteResponse(BaseModel):
    base_url: str
    total_discovered: int
    total_curated: int
    total_scraped: int
    pages: List[ScrapedPageItem]

def html_to_markdown(html_content: str, url_str: str) -> str:
    """Fallback parser to extract structured markdown/text from raw HTML."""
    soup = BeautifulSoup(html_content, "html.parser")

    # Remove non-content elements
    for element in soup(["script", "style", "nav", "footer", "iframe", "noscript", "svg"]):
        element.decompose()

    # Extract title
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    
    # Target main container if present
    main_content = soup.find("main") or soup.find("article") or soup.find("body") or soup

    lines = []
    if title:
        lines.append(f"# {title}\n")

    for elem in main_content.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "pre", "code", "blockquote"]):
        text = elem.get_text(separator=" ", strip=True)
        if not text:
            continue
        tag = elem.name
        if tag == "h1":
            lines.append(f"\n# {text}\n")
        elif tag == "h2":
            lines.append(f"\n## {text}\n")
        elif tag == "h3":
            lines.append(f"\n### {text}\n")
        elif tag in ["h4", "h5", "h6"]:
            lines.append(f"\n#### {text}\n")
        elif tag == "li":
            lines.append(f"- {text}")
        elif tag == "blockquote":
            lines.append(f"> {text}\n")
        elif tag in ["pre", "code"]:
            lines.append(f"\n```\n{text}\n```\n")
        else:
            lines.append(f"{text}\n")

    result = "\n".join(lines).strip()
    if not result:
        result = soup.get_text(separator="\n", strip=True)

    return result

@router.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    url_str = str(request.url)
    
    # 1. Attempt Crawl4AI (headless browser) first with 10s timeout
    if AsyncWebCrawler:
        try:
            async with AsyncWebCrawler() as crawler:
                result = await asyncio.wait_for(crawler.arun(url=url_str), timeout=10.0)
                if result and result.markdown and result.markdown.strip():
                    return {"markdown": result.markdown, "method": "crawl4ai"}
        except Exception as e:
            logger.warning(f"Crawl4AI failed or timed out for {url_str}: {e}. Falling back to HTTP scraper.")


    # 2. Fallback to HTTP request + BeautifulSoup parsing
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(url_str, headers=headers)
            response.raise_for_status()
            
            markdown = html_to_markdown(response.text, url_str)
            if not markdown or not markdown.strip():
                raise HTTPException(status_code=400, detail="Failed to extract text from the URL.")
            
            return {"markdown": markdown, "method": "http_fallback"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Scraping failed: {str(e)}"
        )


@router.post("/scrape-site", response_model=ScrapeSiteResponse)
async def scrape_site(request: ScrapeSiteRequest):
    url_str = str(request.url)
    max_pages = request.max_pages

    try:
        # 1. Discover all canonical URLs from sitemap and robots.txt
        logger.info(f"[Site Scrape] Discovering sitemap URLs for {url_str}...")
        discovered_urls = await discover_sitemap_urls(url_str, max_discovery=1000)
        logger.info(f"[Site Scrape] Discovered {len(discovered_urls)} candidate URLs for {url_str}")

        # 2. Curate highest-value URLs using Gemini LLM
        curated_urls = await curate_urls_with_llm(
            urls=discovered_urls,
            base_url=url_str,
            max_curated=max_pages
        )
        logger.info(f"[Site Scrape] LLM curated {len(curated_urls)} high-value pages for {url_str}")

        # 3. Batch scrape the curated URLs
        scraped_pages = await batch_scrape_urls(curated_urls, max_concurrency=5)
        successful_pages = [p for p in scraped_pages if p.get("success")]

        # If none succeeded via standard threshold, keep whatever was scraped
        final_pages = successful_pages if successful_pages else scraped_pages

        return ScrapeSiteResponse(
            base_url=url_str,
            total_discovered=len(discovered_urls),
            total_curated=len(curated_urls),
            total_scraped=len(final_pages),
            pages=[ScrapedPageItem(**p) for p in final_pages]
        )
    except Exception as e:
        logger.error(f"[Site Scrape Error] Failed scraping site {url_str}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Intelligent site scraping failed: {str(e)}"
        )

