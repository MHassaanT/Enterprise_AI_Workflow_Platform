"""
Intelligent Sitemap Discovery & LLM Curation Service for Knowledge Base.

Pipeline:
1. Discover all canonical website URLs via robots.txt and sitemap.xml
2. Curate and prioritize highest-value knowledge pages using Gemini LLM
3. Batch scrape curated pages using Crawl4AI (with resilient HTTP fallback)
"""
import asyncio
import json
import logging
import re
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse, urldefrag
from typing import List, Dict, Any, Optional

import httpx
from bs4 import BeautifulSoup
from langchain_core.messages import SystemMessage, HumanMessage

from services.llm_gateway import get_llm

logger = logging.getLogger(__name__)

# Common file extensions to exclude from web scraping
IGNORED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp", ".tiff",
    ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
    ".mp4", ".webm", ".mov", ".avi", ".mp3", ".wav", ".ogg",
    ".css", ".js", ".mjs", ".xml", ".json", ".rss", ".atom",
    ".woff", ".woff2", ".ttf", ".eot", ".otf"
}


def sanitize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url


def normalize_url(url: str, base_domain: str) -> Optional[str]:
    """
    Cleans, defragments, and verifies that the URL belongs strictly to base_domain.
    Filters out static assets and non-HTTP schemes.
    """
    try:
        url, _ = urldefrag(url)
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return None

        # Domain boundary check
        netloc = parsed.netloc.lower()
        if netloc != base_domain and not netloc.endswith("." + base_domain):
            return None

        # Extension check
        path_lower = parsed.path.lower()
        if any(path_lower.endswith(ext) for ext in IGNORED_EXTENSIONS):
            return None

        # Clean tracking query parameters
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        if clean_url.endswith("/") and len(parsed.path) > 1:
            clean_url = clean_url.rstrip("/")

        return clean_url
    except Exception:
        return None


def html_to_markdown(html_content: str, url_str: str = "") -> str:
    """Extract clean structured markdown text from raw HTML."""
    soup = BeautifulSoup(html_content, "html.parser")

    for element in soup(["script", "style", "nav", "footer", "iframe", "noscript", "svg"]):
        element.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    main_content = soup.find("main") or soup.find("article") or soup.find("body") or soup

    lines = []
    if title:
        lines.append(f"# {title}\n")

    for elem in main_content.find_all(
        ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "pre", "code", "blockquote"]
    ):
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


async def _fetch_sitemap_xml(client: httpx.AsyncClient, sitemap_url: str) -> Optional[str]:
    try:
        resp = await client.get(sitemap_url, headers={"User-Agent": "EnterpriseAI-KnowledgeCrawler/1.0"})
        if resp.status_code == 200 and ("xml" in resp.headers.get("content-type", "") or resp.text.strip().startswith("<?xml") or "<urlset" in resp.text or "<sitemapindex" in resp.text):
            return resp.text
    except Exception as e:
        logger.debug(f"Failed fetching sitemap {sitemap_url}: {e}")
    return None


async def discover_sitemap_urls(base_url: str, max_discovery: int = 1000) -> List[str]:
    """
    Discovers all canonical page URLs by inspecting robots.txt and standard sitemap paths.
    Recursively expands sitemap indexes and falls back to anchor links if no sitemap exists.
    """
    clean_base = sanitize_url(base_url)
    parsed_base = urlparse(clean_base)
    base_domain = parsed_base.netloc.lower()
    scheme = parsed_base.scheme

    discovered_urls: set[str] = set()
    sitemap_targets: list[str] = []

    timeout = httpx.Timeout(12.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        # 1. Check robots.txt for Sitemap directives
        robots_url = f"{scheme}://{base_domain}/robots.txt"
        try:
            robots_resp = await client.get(robots_url, headers={"User-Agent": "EnterpriseAI-KnowledgeCrawler/1.0"})
            if robots_resp.status_code == 200:
                for line in robots_resp.text.splitlines():
                    match = re.match(r"^\s*Sitemap:\s*(\S+)", line, re.IGNORECASE)
                    if match:
                        sitemap_targets.append(match.group(1).strip())
        except Exception as e:
            logger.debug(f"robots.txt check failed for {base_domain}: {e}")

        # 2. Add standard sitemap locations
        standard_sitemaps = [
            f"{scheme}://{base_domain}/sitemap.xml",
            f"{scheme}://{base_domain}/sitemap_index.xml",
            f"{scheme}://{base_domain}/sitemaps/sitemap.xml",
        ]
        for sm in standard_sitemaps:
            if sm not in sitemap_targets:
                sitemap_targets.append(sm)

        # 3. Process sitemaps
        sub_sitemaps_visited: set[str] = set()
        queue = list(sitemap_targets)

        while queue and len(discovered_urls) < max_discovery and len(sub_sitemaps_visited) < 15:
            current_sitemap = queue.pop(0)
            if current_sitemap in sub_sitemaps_visited:
                continue
            sub_sitemaps_visited.add(current_sitemap)

            xml_content = await _fetch_sitemap_xml(client, current_sitemap)
            if not xml_content:
                continue

            try:
                # Strip default namespaces to simplify tag search
                clean_xml = re.sub(r'\sxmlns="[^"]+"', '', xml_content, count=1)
                root = ET.fromstring(clean_xml)

                # Check if it's a sitemap index (<sitemapindex><sitemap><loc>...)
                sitemap_nodes = root.findall(".//sitemap/loc")
                for node in sitemap_nodes:
                    if node.text and node.text.strip() not in sub_sitemaps_visited:
                        queue.append(node.text.strip())

                # Check for URLs (<urlset><url><loc>...)
                url_nodes = root.findall(".//url/loc")
                for node in url_nodes:
                    if node.text:
                        norm = normalize_url(node.text.strip(), base_domain)
                        if norm:
                            discovered_urls.add(norm)
                            if len(discovered_urls) >= max_discovery:
                                break
            except Exception as parse_err:
                logger.debug(f"XML parse error for sitemap {current_sitemap}: {parse_err}")

        # 4. Fallback: If no URLs discovered via sitemap, scrape anchor links on the seed page
        if not discovered_urls:
            try:
                resp = await client.get(clean_base, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    for a_tag in soup.find_all("a", href=True):
                        href = a_tag["href"]
                        full = urljoin(clean_base, href)
                        norm = normalize_url(full, base_domain)
                        if norm:
                            discovered_urls.add(norm)
                            if len(discovered_urls) >= max_discovery:
                                break
            except Exception as fb_err:
                logger.warning(f"Fallback anchor link discovery failed: {fb_err}")

    # Always ensure the root base_url is included
    root_norm = normalize_url(clean_base, base_domain) or clean_base
    discovered_urls.add(root_norm)

    return sorted(list(discovered_urls))


async def curate_urls_with_llm(
    urls: List[str],
    base_url: str,
    max_curated: int = 30
) -> List[str]:
    """
    Uses Gemini LLM to inspect the full list of discovered URLs and curate the
    highest-value pages for the enterprise knowledge base, pruning noise.
    """
    clean_base = sanitize_url(base_url)

    if len(urls) <= max_curated:
        return urls

    llm = get_llm()

    sample_urls = urls[:600] # Cap input sample to stay well within token limits
    url_list_str = "\n".join(f"- {u}" for u in sample_urls)

    system_prompt = (
        "You are an expert enterprise AI Knowledge Base curator.\n"
        "Your task is to analyze the provided list of website URLs and select the most valuable pages "
        f"to ingest into an enterprise AI Knowledge Base (limit: up to {max_curated} URLs).\n\n"
        "PRIORITIZE HIGH-VALUE PAGES:\n"
        "1. Core platform, products, features, solutions, and service overviews\n"
        "2. Pricing, subscription plans, tier comparison, and billing policies\n"
        "3. Technical documentation, developer guides, API references, architecture, and FAQs\n"
        "4. Company overview, about us, mission, leadership, and contact\n"
        "5. Compliance, terms of service, privacy policy, security, and refund policy\n\n"
        "PRUNE NOISE & LOW-VALUE PAGES:\n"
        "- Exclude localized/regional duplicates (e.g., /fr/, /de/, /es/, /ja/ - keep only primary canonical/English version)\n"
        "- Exclude individual job postings (/careers/apply/123), news archive pagination, tag lists\n"
        "- Exclude dynamic city landing pages (/cities/austin, /cities/boston)\n"
        "- Exclude login, signup, cart, checkout, or account settings\n\n"
        "Return ONLY a valid JSON array of strings containing the selected URLs, like:\n"
        "[\"https://.../about\", \"https://.../pricing\", ...]\n"
        "Do NOT include markdown formatting or extra text. Pure JSON array only."
    )

    human_prompt = f"Base Website URL: {clean_base}\nTarget Selection Count: {max_curated}\n\nAvailable URLs:\n{url_list_str}"

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ])
        raw_res = response.content.strip()
        clean_json = re.sub(r"^```(json)?\n?", "", raw_res, flags=re.IGNORECASE)
        clean_json = re.sub(r"\n?```$", "", clean_json).strip()

        parsed = json.loads(clean_json)
        if isinstance(parsed, list) and len(parsed) > 0:
            curated = [u.strip() for u in parsed if isinstance(u, str) and u.strip().startswith("http")]
            # Guarantee base_url is present
            if clean_base not in curated:
                curated.insert(0, clean_base)
            return curated[:max_curated]
    except Exception as e:
        logger.warning(f"LLM URL curation failed ({e}). Falling back to heuristic scoring.")

    # Heuristic fallback if LLM parsing encounters an error
    priority_keywords = [
        "about", "product", "feature", "pricing", "plan", "docs", "doc", "api",
        "guide", "help", "faq", "terms", "privacy", "security", "policy", "contact"
    ]

    def score_url(u: str) -> int:
        score = 0
        u_low = u.lower()
        if u == clean_base or u == clean_base + "/":
            score += 100
        for kw in priority_keywords:
            if kw in u_low:
                score += 10
        # Penalize pagination, tags, dates
        if re.search(r"/\d{4}/\d{2}/", u_low) or "page=" in u_low or "/tag/" in u_low:
            score -= 20
        return score

    sorted_urls = sorted(urls, key=score_url, reverse=True)
    return sorted_urls[:max_curated]


async def _scrape_single_url(
    url: str,
    semaphore: asyncio.Semaphore,
    crawler_instance: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Scrapes a single URL using Crawl4AI when available, with automatic HTTP fallback.
    """
    async with semaphore:
        markdown = ""
        title = ""
        method = "none"

        # 1. Attempt Crawl4AI
        if crawler_instance is not None:
            try:
                result = await asyncio.wait_for(crawler_instance.arun(url=url), timeout=12.0)
                if result and result.markdown and result.markdown.strip():
                    markdown = result.markdown
                    title = getattr(result, "metadata", {}).get("title", "") if hasattr(result, "metadata") else ""
                    method = "crawl4ai"
            except Exception as c_err:
                logger.debug(f"Crawl4AI failed for {url} ({c_err}), falling back to HTTP.")

        # 2. Resilient fallback to HTTP + BeautifulSoup
        if not markdown or len(markdown.strip()) < 40:
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                }
                async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        title = soup.title.string.strip() if soup.title and soup.title.string else ""
                        markdown = html_to_markdown(resp.text, url)
                        method = "http_fallback"
            except Exception as h_err:
                logger.warning(f"HTTP scraping failed for {url}: {h_err}")

        is_success = bool(markdown and len(markdown.strip()) >= 30)
        return {
            "url": url,
            "title": title or url,
            "markdown": markdown,
            "method": method,
            "success": is_success,
        }


async def batch_scrape_urls(
    urls: List[str],
    max_concurrency: int = 5
) -> List[Dict[str, Any]]:
    """
    Batch scrapes the specified URLs concurrently with polite rate limiting.
    """
    semaphore = asyncio.Semaphore(max_concurrency)

    crawler_instance = None
    crawler_cm = None
    try:
        from crawl4ai import AsyncWebCrawler
        crawler_cm = AsyncWebCrawler(verbose=False)
        crawler_instance = await crawler_cm.__aenter__()
    except Exception as e:
        logger.info(f"Crawl4AI browser engine not initialized ({e}). Using resilient HTTP scraper.")

    try:
        tasks = [
            _scrape_single_url(url, semaphore, crawler_instance)
            for url in urls
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        clean_results = []
        for r, u in zip(results, urls):
            if isinstance(r, dict):
                clean_results.append(r)
            else:
                clean_results.append({
                    "url": u,
                    "title": u,
                    "markdown": "",
                    "method": "failed",
                    "success": False,
                    "error": str(r)
                })

        return clean_results
    finally:
        if crawler_cm is not None:
            try:
                await crawler_cm.__aexit__(None, None, None)
            except Exception:
                pass
