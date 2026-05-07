set dotenv-load
set dotenv-filename := ".env.dev"

mod demo
mod ui

export RUST_BACKTRACE := "full"

default:
    @just --list

export PROXY__ES__PORT := "3000"
export PROXY__ES__TARGET := "http://localhost:9200/"

[arg("release", long="release", short="r", value="1")]
build release="":
    cargo build {{ if release != "" { "--release" } else { "" } }}

# Run protospy with default ES configuration
run $RUST_LOG="info,protospy=debug" $PRINT_MESSAGES="1" $TOKIO_CONSOLE="1":
    cargo build

[arg("release", long="release", short="r", value="1")]
run-direct release="" $RUST_LOG="info,protospy=debug" $PRINT_MESSAGES="1" $TOKIO_CONSOLE="1": (build release)
    ./target/{{ if release != "" { "release" } else { "debug" } }}/protospy

# Run protospy with default ES configuration, restarting on code changes
run-watched $RUST_LOG="info,protospy=debug" $PRINT_MESSAGES="1" $TOKIO_CONSOLE="1":
    cargo watch -i docs -i conformance -i demo -i '**/*.md' -i scripts -i scratch -i justfile -- cargo run

# Run protospy in protospy-ext configuration for conformance tests
run-ext $RUST_LOG="info,protospy=debug" $PRINT_MESSAGES="1" $TOKIO_CONSOLE="1":
    PROXY__GOOD__PORT=7400 \
    PROXY__GOOD__TARGET=127.0.0.1:7300 \
    PROXY__WIRE__PORT=7401 \
    PROXY__WIRE__TARGET=127.0.0.1:7301 \
    PROXY__DEAD__PORT=7402 \
    PROXY__DEAD__TARGET=127.0.0.1:7399 \
    WEB=0 \
    cargo run

# Run protospy for example recording; see docs
[env("RECORD_EXAMPLES", "docs/examples/")]
[env("RUST_LOG", "info")]
record:
    cargo run --

# Run clippy, watching for code changes
watch-clippy:
    cargo watch -c clippy --all-targets --no-deps --target-dir target/clippy -- -D warnings
