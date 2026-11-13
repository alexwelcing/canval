FROM oven/bun:1-debian

WORKDIR /app

# Install Python 3 and audio library for Earlybird-29M + EmbeddingGemma 2 bridge
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    libsndfile1 \
    ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Install CPU PyTorch + Transformers 5 + SentenceTransformers
RUN pip install --no-cache-dir --break-system-packages \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir --break-system-packages \
    "transformers>=5.19.0" \
    "sentence-transformers>=6.0.0" \
    safetensors \
    huggingface_hub \
    soundfile \
    scipy \
    pillow \
    numpy

# Pre-download Earlybird-29M (16.8 MB 4-bit weights) into image for instant cold start
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('sahilmahendrakar/Earlybird-29M', local_dir='/app/models/earlybird', allow_patterns=['config.json','generation_config.json','tokenizer.json','tokenizer_config.json','earlybird.safetensors'])"

COPY package.json bun.lock ./
RUN bun install

COPY . .
RUN bun run build:client

ENV NODE_ENV=production
ENV PORT=8080
ENV EARLYBIRD_MODEL=/app/models/earlybird
ENV GEMMA_TEXT_ONLY=1
ENV LOAD_EMBEDDING_GEMMA=auto
ENV EB_THREADS=2

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
