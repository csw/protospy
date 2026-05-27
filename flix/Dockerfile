FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies (cached; only re-runs when pyproject.toml / uv.lock change)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=README.md,target=README.md \
    uv sync --frozen --no-install-project --no-dev

# Copy source and install the project itself
COPY src /app/src
COPY pyproject.toml uv.lock README.md /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.14-slim

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY src /app/src
COPY data /app/data
COPY loader.py /app/loader.py

ENV PATH="/app/.venv/bin:$PATH"
ENTRYPOINT []

EXPOSE 8000
CMD ["uvicorn", "elasticflix.main:app", "--host", "0.0.0.0", "--port", "8000"]
