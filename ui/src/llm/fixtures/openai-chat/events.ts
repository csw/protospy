// OpenAI Chat Completions streaming event types.
//
// Re-exported from the official SDK (`openai`) so the fixture corpus is
// validated at compile time against the authoritative wire-format
// definitions. The SDK's `ChatCompletionChunk` is the streaming
// per-chunk type emitted on the wire.
//
// On the wire, chat-completions streaming uses bare `data:` lines (no
// `event:` field) carrying `chat.completion.chunk` JSON, terminated by
// the literal sentinel `data: [DONE]`. The fixture format here uses an
// `event` of "message" for chunks and "done" for the sentinel so the
// shape lines up with the other providers; an adapter just looks at
// `data` for chunks.
//
// See: https://platform.openai.com/docs/api-reference/chat/streaming

import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions/completions";

export type OpenAIChatChunk = ChatCompletionChunk;

/**
 * Fixture event: either a chunk or the terminating `[DONE]` sentinel.
 * The `event` field is a fixture-only label since the wire format is
 * unnamed.
 */
export type OpenAIChatFixtureEvent =
  | { event: "message"; data: OpenAIChatChunk }
  | { event: "done"; data: "[DONE]" };

// --- Request body ------------------------------------------------------

export type OpenAIChatRequestBody = ChatCompletionCreateParamsStreaming;
