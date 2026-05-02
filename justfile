set dotenv-load
set dotenv-filename := ".env.dev"

mod demo
mod ui

export RUST_BACKTRACE := "full"

default:
    @just --list

es_proxy_opt := "--proxy=name=es,port=3000,target=localhost:9200"

run $RUST_LOG="info,protospy=debug":
    cargo run -- --tokio-console -p {{ es_proxy_opt }}

run-watched $RUST_LOG="info,protospy=debug":
    cargo watch -i docs -i conformance -i demo -i '**/*.md' -i scripts -i scratch -i justfile -- cargo run -- --tokio-console -p {{ es_proxy_opt }}

record $RUST_LOG="info":
    cargo run -- --tokio-console --record-examples=docs/examples/ {{ es_proxy_opt }}

watch-clippy:
    cargo watch -c clippy --all-targets --all-features --no-deps -- -D warnings
