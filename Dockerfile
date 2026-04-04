# FastAPI + Selenium (Chromium) for hosts like Render.
# Build: docker build -t nepse-api .
# Run:  docker run --rm -p 10000:10000 -e PORT=10000 --env-file .env nepse-api

FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        chromium-driver \
        ca-certificates \
        fonts-liberation \
        libasound2t64 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnss3 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libxss1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY main.py supabase_client.py api_app.py meroshare_crypto.py scraper_db.py ./

RUN pip install --upgrade pip \
    && pip install .

# Render sets PORT at runtime; default for local docker run.
EXPOSE 10000

CMD ["sh", "-c", "exec uvicorn api_app:app --host 0.0.0.0 --port ${PORT:-10000}"]
