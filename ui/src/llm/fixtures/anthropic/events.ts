// Anthropic Messages streaming event types.
//
// Re-exported from the official SDK (`@anthropic-ai/sdk`) so the
// fixture corpus is validated at compile time against the authoritative
// wire-format definitions. The SDK's `RawMessageStreamEvent` covers the
// six "raw" event types in `Messages.create({stream: true})`: message_start,
// message_delta, message_stop, content_block_start, content_block_delta,
// content_block_stop. The Anthropic API also emits `ping` (keepalive)
// and `error` (mid-stream failure) events that are not part of that
// union — we define them locally below to keep fixtures honest.

import type {
  ContentBlock,
  Message,
  MessageCreateParamsStreaming,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStopEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";

export type AnthropicMessage = Message;
export type AnthropicContentBlock = ContentBlock;

export type AnthropicRawEvent = RawMessageStreamEvent;

export type {
  RawMessageStartEvent as AnthropicMessageStartData,
  RawContentBlockStartEvent as AnthropicContentBlockStartData,
  RawContentBlockDeltaEvent as AnthropicContentBlockDeltaData,
  RawContentBlockStopEvent as AnthropicContentBlockStopData,
  RawMessageDeltaEvent as AnthropicMessageDeltaData,
  RawMessageStopEvent as AnthropicMessageStopData,
};

// --- Events not in the SDK's RawMessageStreamEvent union ---------------

export interface AnthropicPingData {
  type: "ping";
}

export type AnthropicErrorType =
  | "overloaded_error"
  | "api_error"
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error";

export interface AnthropicErrorData {
  type: "error";
  error: {
    type: AnthropicErrorType;
    message: string;
  };
}

export type AnthropicEventData =
  | AnthropicRawEvent
  | AnthropicPingData
  | AnthropicErrorData;

/**
 * One Anthropic SSE event. The `event` name on the wire always matches
 * `data.type` for Anthropic — both are emitted so SSE-aware clients and
 * data-only consumers stay in sync.
 */
export type AnthropicFixtureEvent = {
  event: AnthropicEventData["type"];
  data: AnthropicEventData;
};

// --- Request body ------------------------------------------------------

export type AnthropicRequestBody = MessageCreateParamsStreaming;
