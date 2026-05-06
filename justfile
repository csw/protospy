set dotenv-load
set dotenv-filename := ".env.dev"

mod demo
mod ui

export RUST_BACKTRACE := "full"

default:
    @just --list

export PROXY__ES__PORT := "3000"
export PROXY__ES__TARGET := "http://localhost:9200/"

run $RUST_LOG="info,protospy=debug" $PRINT_MESSAGES="1" $TOKIO_CONSOLE="1":
    cargo run

run-watched $RUST_LOG="info,protospy=debug" $PRINT_MESSAGES="1" $TOKIO_CONSOLE="1":
    cargo watch -i docs -i conformance -i demo -i '**/*.md' -i scripts -i scratch -i justfile -- cargo run

[env("RECORD_EXAMPLES", "docs/examples/")]
[env("RUST_LOG", "info")]
record:
    cargo run --

watch-clippy:
    cargo watch -c clippy --all-targets --no-deps --target-dir target/clippy -- -D warnings
