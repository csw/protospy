// Re-export so existing browser specs (which import from
// "./fixtures/exchanges") keep working. The canonical source lives under
// src/test/ so unit tests can use the same builders.
export * from "../../src/test/fixtures";
