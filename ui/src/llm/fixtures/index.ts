// Aggregate corpus of LLM SSE test fixtures. Adapter and view tests
// can either import a specific fixture by name from the provider
// subdirectories, or iterate `LLM_SSE_FIXTURE_CORPUS` for coverage
// checks. Scenarios mirror the spec in
// `Applications/LLM SSE streams/LLM SSE test vector sources.md`.

import type { Fixture } from "@ui/llm/fixtures/types";
import { ANTHROPIC_FIXTURES } from "@ui/llm/fixtures/anthropic/fixtures";
import { OPENAI_CHAT_FIXTURES } from "@ui/llm/fixtures/openai-chat/fixtures";
import { OPENAI_RESPONSES_FIXTURES } from "@ui/llm/fixtures/openai-responses/fixtures";

export type LlmFixtureProvider =
  | "anthropic"
  | "openai-chat"
  | "openai-responses";

export interface LlmFixtureCorpusEntry {
  provider: LlmFixtureProvider;
  fixture: Fixture;
}

export const LLM_SSE_FIXTURE_CORPUS: readonly LlmFixtureCorpusEntry[] = [
  ...ANTHROPIC_FIXTURES.map((fixture) => ({
    provider: "anthropic" as const,
    fixture: fixture as Fixture,
  })),
  ...OPENAI_CHAT_FIXTURES.map((fixture) => ({
    provider: "openai-chat" as const,
    fixture: fixture as Fixture,
  })),
  ...OPENAI_RESPONSES_FIXTURES.map((fixture) => ({
    provider: "openai-responses" as const,
    fixture: fixture as Fixture,
  })),
];

export { ANTHROPIC_FIXTURES } from "@ui/llm/fixtures/anthropic/fixtures";
export { OPENAI_CHAT_FIXTURES } from "@ui/llm/fixtures/openai-chat/fixtures";
export { OPENAI_RESPONSES_FIXTURES } from "@ui/llm/fixtures/openai-responses/fixtures";
export type { Fixture, FixtureEvent } from "@ui/llm/fixtures/types";
