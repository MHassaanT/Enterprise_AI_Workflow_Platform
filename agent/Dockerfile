FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Automatically install system dependencies for Chromium via Playwright CLI
RUN apt-get update && python -m playwright install-deps chromium && rm -rf /var/lib/apt/lists/*
RUN python -m playwright install chromium

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
