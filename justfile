export RUST_BACKTRACE := "full"

run $RUST_LOG="info,protospy=debug":
  cargo run -- --tokio-console -p --proxy=name=es,port=3000,target=localhost:9200

run-watched $RUST_LOG="info,protospy=debug":
  cargo watch -i docs -i conformance -i demo -i '**/*.md' -i justfile -- cargo run -- --tokio-console -p --proxy=name=es,port=3000,target=localhost:9200

record $RUST_LOG="info":
  cargo run -- --tokio-console --record-examples=docs/examples/ --proxy=name=es,port=3000,target=localhost:9200
