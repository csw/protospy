// OpenAI Chat Completions streaming event types.
//
// On the wire, chat-completions streaming uses bare `data:` lines (no
// `event:` field) carrying `chat.completion.chunk` JSON, terminated by
// the literal sentinel `data: [DONE]`. The fixture format here uses an
// `event` of "message" for chunks and "done" for the sentinel so the
// shape lines up with the other providers; an adapter just looks at
// `data` for chunks.
//
// See: https://platform.openai.com/docs/api-reference/chat/streaming

export type OpenAIChatFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "function_call"
  | null;

export interface OpenAIChatToolCallFunction {
  /** Present on the first delta of a given tool call. */
  name?: string;
  /** Streaming JSON fragments. */
  arguments?: string;
}

export interface OpenAIChatToolCallDelta {
  /** Disambiguates parallel tool calls within a single response. */
  index: number;
  /** Present on the first delta of a given tool call. */
  id?: string;
  /** Present on the first delta of a given tool call. */
  type?: "function";
  function?: OpenAIChatToolCallFunction;
}

export interface OpenAIChatChoiceDelta {
  role?: "assistant";
  content?: string | null;
  refusal?: string | null;
  tool_calls?: OpenAIChatToolCallDelta[];
}

export interface OpenAIChatChoice {
  index: number;
  delta: OpenAIChatChoiceDelta;
  finish_reason: OpenAIChatFinishReason;
  logprobs?: null;
}

export interface OpenAIChatPromptTokensDetails {
  cached_tokens?: number;
  audio_tokens?: number;
}

export interface OpenAIChatCompletionTokensDetails {
  reasoning_tokens?: number;
  audio_tokens?: number;
}

export interface OpenAIChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: OpenAIChatPromptTokensDetails;
  completion_tokens_details?: OpenAIChatCompletionTokensDetails;
}

export interface OpenAIChatChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  system_fingerprint?: string;
  service_tier?: string | null;
  choices: OpenAIChatChoice[];
  /** Only present when stream_options.include_usage is true. */
  usage?: OpenAIChatUsage | null;
}

/**
 * Fixture event: either a chunk or the terminating `[DONE]` sentinel.
 * The `event` field is a fixture-only label since the wire format is
 * unnamed.
 */
export type OpenAIChatFixtureEvent =
  | { event: "message"; data: OpenAIChatChunk }
  | { event: "done"; data: "[DONE]" };

// --- Request body ------------------------------------------------------

export interface OpenAIChatMessageParam {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAIChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIChatRequestBody {
  model: string;
  messages: OpenAIChatMessageParam[];
  stream: true;
  stream_options?: { include_usage?: boolean };
  tools?: OpenAIChatToolDefinition[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
}
