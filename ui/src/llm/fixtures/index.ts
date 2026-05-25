// Aggregate corpus of LLM SSE test fixtures. Adapter and view tests
// can either import a specific fixture by name from the provider
// subdirectories, or iterate `LLM_SSE_FIXTURE_CORPUS` for coverage
// checks. Provider tag on each entry preserves per-provider typing when
// narrowing.

import {
  ANTHROPIC_FIXTURES,
  type AnthropicFixture,
} from "@ui/llm/fixtures/anthropic/fixtures";
import {
  OPENAI_CHAT_FIXTURES,
  type OpenAIChatFixture,
} from "@ui/llm/fixtures/openai-chat/fixtures";
import {
  OPENAI_RESPONSES_FIXTURES,
  type OpenAIResponsesFixture,
} from "@ui/llm/fixtures/openai-responses/fixtures";

export type LlmFixtureCorpusEntry =
  | { provider: "anthropic"; fixture: AnthropicFixture }
  | { provider: "openai-chat"; fixture: OpenAIChatFixture }
  | { provider: "openai-responses"; fixture: OpenAIResponsesFixture };

export type LlmFixtureProvider = LlmFixtureCorpusEntry["provider"];

export const LLM_SSE_FIXTURE_CORPUS: readonly LlmFixtureCorpusEntry[] = [
  ...ANTHROPIC_FIXTURES.map(
    (fixture): LlmFixtureCorpusEntry => ({ provider: "anthropic", fixture }),
  ),
  ...OPENAI_CHAT_FIXTURES.map(
    (fixture): LlmFixtureCorpusEntry => ({ provider: "openai-chat", fixture }),
  ),
  ...OPENAI_RESPONSES_FIXTURES.map(
    (fixture): LlmFixtureCorpusEntry => ({
      provider: "openai-responses",
      fixture,
    }),
  ),
];

export {
  ANTHROPIC_FIXTURES,
  type AnthropicFixture,
} from "@ui/llm/fixtures/anthropic/fixtures";
export {
  OPENAI_CHAT_FIXTURES,
  type OpenAIChatFixture,
} from "@ui/llm/fixtures/openai-chat/fixtures";
export {
  OPENAI_RESPONSES_FIXTURES,
  type OpenAIResponsesFixture,
} from "@ui/llm/fixtures/openai-responses/fixtures";
export type { Fixture, FixtureEvent } from "@ui/llm/fixtures/types";
