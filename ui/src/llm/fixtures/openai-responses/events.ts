// OpenAI Responses API streaming event types.
//
// Re-exported from the official SDK (`openai`) so the fixture corpus is
// validated at compile time against the authoritative wire-format
// definitions. The SDK's `ResponseStreamEvent` is the discriminated
// union of all event variants emitted on the wire.
//
// The Responses API uses named `event:` lines with strongly-typed
// payloads. On the wire, the `event` name always matches `data.type`.
//
// See: https://platform.openai.com/docs/api-reference/responses-streaming

import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

export type OpenAIResponsesResource = Response;
export type OpenAIResponsesEventData = ResponseStreamEvent;

/**
 * One Responses API SSE event. The `event` name on the wire always
 * matches `data.type`.
 */
export type OpenAIResponsesFixtureEvent = {
  event: OpenAIResponsesEventData["type"];
  data: OpenAIResponsesEventData;
};

// --- Request body ------------------------------------------------------

export type OpenAIResponsesRequestBody = ResponseCreateParamsStreaming;
