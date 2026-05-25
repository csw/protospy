ARG RUST_VERSION=1.95.0
FROM node:24.16.0-slim AS ui-build
WORKDIR /app/ui
RUN corepack enable
COPY ui/package.json ui/pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY ui/ ./
RUN pnpm run build

FROM lukemathwalker/cargo-chef:latest-rust-${RUST_VERSION} AS chef
WORKDIR /app

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS rust-build
WORKDIR /app
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies - this is the caching Docker layer!
RUN cargo chef cook --release --recipe-path recipe.json
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/
COPY --from=ui-build /app/ui/dist ./ui/dist
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release && cp target/release/protospy .

FROM debian:bookworm-20260421-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rust-build /app/protospy /usr/local/bin/
CMD ["protospy"]
