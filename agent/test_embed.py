import asyncio
import os
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from config import settings

async def main():
    print("Testing text-embedding-004...")
    try:
        e1 = GoogleGenerativeAIEmbeddings(model="text-embedding-004", google_api_key=settings.GEMINI_API_KEY)
        res1 = await e1.aembed_query("hello")
        print("text-embedding-004 success:", len(res1))
    except Exception as e:
        print("text-embedding-004 error:", e)

    print("Testing models/text-embedding-004...")
    try:
        e2 = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004", google_api_key=settings.GEMINI_API_KEY)
        res2 = await e2.aembed_query("hello")
        print("models/text-embedding-004 success:", len(res2))
    except Exception as e:
        print("models/text-embedding-004 error:", e)

    print("Testing gemini-embedding-001...")
    try:
        e3 = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001", google_api_key=settings.GEMINI_API_KEY)
        res3 = await e3.aembed_query("hello")
        print("gemini-embedding-001 success:", len(res3))
    except Exception as e:
        print("gemini-embedding-001 error:", e)

    print("Testing models/embedding-001...")
    try:
        e4 = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=settings.GEMINI_API_KEY)
        res4 = await e4.aembed_query("hello")
        print("models/embedding-001 success:", len(res4))
    except Exception as e:
        print("models/embedding-001 error:", e)

if __name__ == "__main__":
    asyncio.run(main())
