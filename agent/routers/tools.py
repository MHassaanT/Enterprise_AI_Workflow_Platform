from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
import asyncio

try:
    from crawl4ai import AsyncWebCrawler
except ImportError:
    AsyncWebCrawler = None

router = APIRouter()

class ScrapeRequest(BaseModel):
    url: HttpUrl

@router.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    if not AsyncWebCrawler:
        raise HTTPException(status_code=500, detail="crawl4ai is not installed or configured correctly.")
    
    try:
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=str(request.url))
            if not result or not result.markdown:
                raise HTTPException(status_code=400, detail="Failed to extract markdown from the URL.")
            
            return {"markdown": result.markdown}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
