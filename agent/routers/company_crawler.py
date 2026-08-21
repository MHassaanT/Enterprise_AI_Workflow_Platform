"""
Company Website Crawler Router — uses Crawl4AI / HTTP scraping + Gemini LLM extraction
to analyze company websites during workspace sign up.
"""
import re
import json
import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from config import settings

router = APIRouter(prefix="/crawl-company", tags=["Company Crawler"])

class CrawlRequest(BaseModel):
    url: str

class CrawlResponse(BaseModel):
    success: bool
    company_name: str
    description: str
    industry: str
    website: str


def sanitize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url


async def scrape_website_content(url: str) -> str:
    """
    Attempts Crawl4AI first, falling back to httpx + BeautifulSoup.
    """
    content = ""
    
    # 1. Try Crawl4AI
    try:
        from crawl4ai import AsyncWebCrawler
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            if result and result.markdown:
                content = result.markdown[:10000] # Take top 10k chars
    except Exception as crawl_err:
        print(f"[CRAWL4AI NOTE] Crawl4AI direct browser run skipped/fallback ({crawl_err}). Using HTTP scraper.")

    # 2. Fallback to httpx + BeautifulSoup if Crawl4AI content is empty
    if not content or len(content.strip()) < 50:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # Strip scripts and styles
                for script in soup(["script", "style", "nav", "footer"]):
                    script.extract()
                
                text = soup.get_text(separator=' ')
                lines = (line.strip() for line in text.splitlines())
                chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                content = ' '.join(chunk for chunk in chunks if chunk)[:8000]
        except Exception as http_err:
            print(f"[HTTP SCRAPING ERROR] Failed to fetch {url}: {http_err}")
            raise HTTPException(status_code=400, detail=f"Could not reach or crawl company website: {str(http_err)}")

    if not content or len(content.strip()) < 20:
        raise HTTPException(status_code=400, detail="The website contained insufficient text content to extract details.")

    return content


@router.post("", response_model=CrawlResponse)
async def crawl_company_website(req: CrawlRequest):
    url = sanitize_url(req.url)
    
    # 1. Extract page content
    page_text = await scrape_website_content(url)
    
    # 2. Extract structured details using LLM
    llm = ChatGoogleGenerativeAI(
        model=settings.GEMINI_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.2,
    )
    
    system_prompt = (
        "You are an expert business analyst and website scanner. "
        "Analyze the provided website content and extract structured company information. "
        "Return ONLY a valid JSON object with the following fields:\n"
        "- company_name: Official or common company name (string)\n"
        "- description: A clear, professional 2-3 sentence overview of what the company does, its core products, services, and value proposition (string)\n"
        "- industry: Primary industry or business domain, e.g., 'SaaS & Software', 'E-Commerce', 'Fintech', 'Healthcare', 'Manufacturing', 'Consulting', etc. (string)\n\n"
        "Do NOT include any markdown code block formatting like ```json or trailing text. Return pure JSON only."
    )
    
    human_prompt = f"Website URL: {url}\n\nExtracted Content:\n{page_text[:6000]}"
    
    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ])
        
        raw_res = response.content.strip()
        # Clean markdown codeblocks if LLM included them
        clean_json = re.sub(r"^```(json)?\n?", "", raw_res, flags=re.IGNORECASE)
        clean_json = re.sub(r"\n?```$", "", clean_json).strip()
        
        parsed = json.loads(clean_json)
        
        return CrawlResponse(
            success=True,
            company_name=parsed.get("company_name", "").strip() or "Company",
            description=parsed.get("description", "").strip(),
            industry=parsed.get("industry", "").strip() or "General Business",
            website=url
        )
    except Exception as e:
        print(f"[CRAWLER LLM ERROR] Failed to parse company details: {e}")
        # Fallback response using domain name
        domain_name = url.split("//")[-1].split("/")[0].replace("www.", "").split(".")[0].title()
        return CrawlResponse(
            success=True,
            company_name=domain_name,
            description=f"{domain_name} is an enterprise organization.",
            industry="Technology & Business Services",
            website=url
        )
