from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
import asyncio
import logging
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

try:
    from crawl4ai import AsyncWebCrawler
except ImportError:
    AsyncWebCrawler = None

router = APIRouter()

class ScrapeRequest(BaseModel):
    url: HttpUrl

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
    
    # 1. Attempt Crawl4AI (headless browser) first
    if AsyncWebCrawler:
        try:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(url=url_str)
                if result and result.markdown and result.markdown.strip():
                    return {"markdown": result.markdown, "method": "crawl4ai"}
        except Exception as e:
            logger.warning(f"Crawl4AI failed for {url_str}: {e}. Falling back to HTTP scraper.")

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

