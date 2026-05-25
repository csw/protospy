// Anthropic Messages streaming event type definitions.
//
// Modeled on the SDK types in `anthropic.types.*` (Python:
// `RawMessageStreamEvent` discriminated union; TypeScript:
// `MessageStreamEvent`). Field names and shapes match the wire format,
// not the SDK's helper-event names (`text`, `inputJson`, etc.).
//
// See: https://docs.anthropic.com/en/api/messages-streaming

export type AnthropicStopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "pause_turn"
  | "refusal";

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface AnthropicMessageDeltaUsage {
  output_tokens: number;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface AnthropicRedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock;

export interface AnthropicTextDelta {
  type: "text_delta";
  text: string;
}

export interface AnthropicInputJsonDelta {
  type: "input_json_delta";
  partial_json: string;
}

export interface AnthropicThinkingDelta {
  type: "thinking_delta";
  thinking: string;
}

export interface AnthropicSignatureDelta {
  type: "signature_delta";
  signature: string;
}

export type AnthropicContentBlockDelta =
  | AnthropicTextDelta
  | AnthropicInputJsonDelta
  | AnthropicThinkingDelta
  | AnthropicSignatureDelta;

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: AnthropicStopReason | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

export interface AnthropicMessageStartData {
  type: "message_start";
  message: AnthropicMessage;
}

export interface AnthropicContentBlockStartData {
  type: "content_block_start";
  index: number;
  content_block: AnthropicContentBlock;
}

export interface AnthropicContentBlockDeltaData {
  type: "content_block_delta";
  index: number;
  delta: AnthropicContentBlockDelta;
}

export interface AnthropicContentBlockStopData {
  type: "content_block_stop";
  index: number;
}

export interface AnthropicMessageDeltaData {
  type: "message_delta";
  delta: {
    stop_reason: AnthropicStopReason | null;
    stop_sequence: string | null;
  };
  usage: AnthropicMessageDeltaUsage;
}

export interface AnthropicMessageStopData {
  type: "message_stop";
}

export interface AnthropicPingData {
  type: "ping";
}

export interface AnthropicErrorData {
  type: "error";
  error: {
    type:
      | "overloaded_error"
      | "api_error"
      | "invalid_request_error"
      | "authentication_error"
      | "permission_error"
      | "not_found_error"
      | "rate_limit_error";
    message: string;
  };
}

export type AnthropicEventData =
  | AnthropicMessageStartData
  | AnthropicContentBlockStartData
  | AnthropicContentBlockDeltaData
  | AnthropicContentBlockStopData
  | AnthropicMessageDeltaData
  | AnthropicMessageStopData
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

// --- Request body shape (subset used by fixtures) -----------------------

export interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: AnthropicMessageParam[];
  system?: string;
  tools?: AnthropicToolDefinition[];
  stream: true;
  thinking?: {
    type: "enabled";
    budget_tokens: number;
  };
}
