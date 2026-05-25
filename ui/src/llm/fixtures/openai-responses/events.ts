// OpenAI Responses API streaming event types.
//
// The Responses API uses named `event:` lines with strongly-typed
// payloads. The schema below covers the events exercised by the
// fixture corpus (R1–R7). Field names follow the OpenAPI spec
// (`ResponseCreatedEvent`, `ResponseOutputItemAddedEvent`, etc.).
//
// See: https://platform.openai.com/docs/api-reference/responses-streaming

export type OpenAIResponsesStatus =
  | "in_progress"
  | "completed"
  | "failed"
  | "incomplete"
  | "cancelled"
  | "queued";

export type OpenAIResponsesItemStatus =
  | "in_progress"
  | "completed"
  | "incomplete";

export interface OpenAIResponsesUsage {
  input_tokens: number;
  input_tokens_details?: { cached_tokens: number };
  output_tokens: number;
  output_tokens_details?: { reasoning_tokens: number };
  total_tokens: number;
}

export interface OpenAIResponsesOutputTextContent {
  type: "output_text";
  text: string;
  annotations: unknown[];
}

export interface OpenAIResponsesRefusalContent {
  type: "refusal";
  refusal: string;
}

export type OpenAIResponsesContentPart =
  | OpenAIResponsesOutputTextContent
  | OpenAIResponsesRefusalContent;

export interface OpenAIResponsesMessageItem {
  id: string;
  type: "message";
  role: "assistant";
  status: OpenAIResponsesItemStatus;
  content: OpenAIResponsesContentPart[];
}

export interface OpenAIResponsesFunctionCallItem {
  id: string;
  type: "function_call";
  status: OpenAIResponsesItemStatus;
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenAIResponsesWebSearchCallItem {
  id: string;
  type: "web_search_call";
  status: OpenAIResponsesItemStatus;
  action?: { type: "search"; query: string };
}

export interface OpenAIResponsesCodeInterpreterCallItem {
  id: string;
  type: "code_interpreter_call";
  status: OpenAIResponsesItemStatus;
  code?: string;
  outputs?: Array<{ type: "logs"; logs: string }>;
}

export interface OpenAIResponsesReasoningItem {
  id: string;
  type: "reasoning";
  status: OpenAIResponsesItemStatus;
  summary: Array<{ type: "summary_text"; text: string }>;
}

export type OpenAIResponsesOutputItem =
  | OpenAIResponsesMessageItem
  | OpenAIResponsesFunctionCallItem
  | OpenAIResponsesWebSearchCallItem
  | OpenAIResponsesCodeInterpreterCallItem
  | OpenAIResponsesReasoningItem;

export interface OpenAIResponsesResource {
  id: string;
  object: "response";
  status: OpenAIResponsesStatus;
  created_at: number;
  completed_at?: number;
  model: string;
  output: OpenAIResponsesOutputItem[];
  usage?: OpenAIResponsesUsage;
  incomplete_details?: {
    reason: "max_output_tokens" | "content_filter";
  } | null;
  error?: { code: string; message: string } | null;
}

// --- Event variants ----------------------------------------------------

interface BaseSequencedEvent {
  /** Sequence number for the event within the stream. */
  sequence_number: number;
}

export interface OpenAIResponsesCreatedEvent extends BaseSequencedEvent {
  type: "response.created";
  response: OpenAIResponsesResource;
}

export interface OpenAIResponsesInProgressEvent extends BaseSequencedEvent {
  type: "response.in_progress";
  response: OpenAIResponsesResource;
}

export interface OpenAIResponsesOutputItemAddedEvent extends BaseSequencedEvent {
  type: "response.output_item.added";
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponsesOutputItemDoneEvent extends BaseSequencedEvent {
  type: "response.output_item.done";
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponsesContentPartAddedEvent extends BaseSequencedEvent {
  type: "response.content_part.added";
  item_id: string;
  output_index: number;
  content_index: number;
  part: OpenAIResponsesContentPart;
}

export interface OpenAIResponsesContentPartDoneEvent extends BaseSequencedEvent {
  type: "response.content_part.done";
  item_id: string;
  output_index: number;
  content_index: number;
  part: OpenAIResponsesContentPart;
}

export interface OpenAIResponsesOutputTextDeltaEvent extends BaseSequencedEvent {
  type: "response.output_text.delta";
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenAIResponsesOutputTextDoneEvent extends BaseSequencedEvent {
  type: "response.output_text.done";
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface OpenAIResponsesFunctionCallArgumentsDeltaEvent extends BaseSequencedEvent {
  type: "response.function_call_arguments.delta";
  item_id: string;
  output_index: number;
  delta: string;
}

export interface OpenAIResponsesFunctionCallArgumentsDoneEvent extends BaseSequencedEvent {
  type: "response.function_call_arguments.done";
  item_id: string;
  output_index: number;
  arguments: string;
}

export interface OpenAIResponsesWebSearchCallInProgressEvent extends BaseSequencedEvent {
  type: "response.web_search_call.in_progress";
  item_id: string;
  output_index: number;
}

export interface OpenAIResponsesWebSearchCallSearchingEvent extends BaseSequencedEvent {
  type: "response.web_search_call.searching";
  item_id: string;
  output_index: number;
}

export interface OpenAIResponsesWebSearchCallCompletedEvent extends BaseSequencedEvent {
  type: "response.web_search_call.completed";
  item_id: string;
  output_index: number;
}

export interface OpenAIResponsesCodeInterpreterCallInProgressEvent extends BaseSequencedEvent {
  type: "response.code_interpreter_call.in_progress";
  item_id: string;
  output_index: number;
}

export interface OpenAIResponsesCodeInterpreterCallCodeDeltaEvent extends BaseSequencedEvent {
  type: "response.code_interpreter_call_code.delta";
  item_id: string;
  output_index: number;
  delta: string;
}

export interface OpenAIResponsesCodeInterpreterCallCodeDoneEvent extends BaseSequencedEvent {
  type: "response.code_interpreter_call_code.done";
  item_id: string;
  output_index: number;
  code: string;
}

export interface OpenAIResponsesCodeInterpreterCallCompletedEvent extends BaseSequencedEvent {
  type: "response.code_interpreter_call.completed";
  item_id: string;
  output_index: number;
}

export interface OpenAIResponsesReasoningSummaryPartAddedEvent extends BaseSequencedEvent {
  type: "response.reasoning_summary_part.added";
  item_id: string;
  output_index: number;
  summary_index: number;
  part: { type: "summary_text"; text: string };
}

export interface OpenAIResponsesReasoningSummaryTextDeltaEvent extends BaseSequencedEvent {
  type: "response.reasoning_summary_text.delta";
  item_id: string;
  output_index: number;
  summary_index: number;
  delta: string;
}

export interface OpenAIResponsesReasoningSummaryTextDoneEvent extends BaseSequencedEvent {
  type: "response.reasoning_summary_text.done";
  item_id: string;
  output_index: number;
  summary_index: number;
  text: string;
}

export interface OpenAIResponsesCompletedEvent extends BaseSequencedEvent {
  type: "response.completed";
  response: OpenAIResponsesResource;
}

export interface OpenAIResponsesFailedEvent extends BaseSequencedEvent {
  type: "response.failed";
  response: OpenAIResponsesResource;
}

export interface OpenAIResponsesIncompleteEvent extends BaseSequencedEvent {
  type: "response.incomplete";
  response: OpenAIResponsesResource;
}

export type OpenAIResponsesEventData =
  | OpenAIResponsesCreatedEvent
  | OpenAIResponsesInProgressEvent
  | OpenAIResponsesOutputItemAddedEvent
  | OpenAIResponsesOutputItemDoneEvent
  | OpenAIResponsesContentPartAddedEvent
  | OpenAIResponsesContentPartDoneEvent
  | OpenAIResponsesOutputTextDeltaEvent
  | OpenAIResponsesOutputTextDoneEvent
  | OpenAIResponsesFunctionCallArgumentsDeltaEvent
  | OpenAIResponsesFunctionCallArgumentsDoneEvent
  | OpenAIResponsesWebSearchCallInProgressEvent
  | OpenAIResponsesWebSearchCallSearchingEvent
  | OpenAIResponsesWebSearchCallCompletedEvent
  | OpenAIResponsesCodeInterpreterCallInProgressEvent
  | OpenAIResponsesCodeInterpreterCallCodeDeltaEvent
  | OpenAIResponsesCodeInterpreterCallCodeDoneEvent
  | OpenAIResponsesCodeInterpreterCallCompletedEvent
  | OpenAIResponsesReasoningSummaryPartAddedEvent
  | OpenAIResponsesReasoningSummaryTextDeltaEvent
  | OpenAIResponsesReasoningSummaryTextDoneEvent
  | OpenAIResponsesCompletedEvent
  | OpenAIResponsesFailedEvent
  | OpenAIResponsesIncompleteEvent;

/**
 * One Responses API SSE event. The `event` name on the wire always
 * matches `data.type`.
 */
export type OpenAIResponsesFixtureEvent = {
  event: OpenAIResponsesEventData["type"];
  data: OpenAIResponsesEventData;
};

// --- Request body ------------------------------------------------------

export interface OpenAIResponsesFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface OpenAIResponsesWebSearchTool {
  type: "web_search" | "web_search_preview";
}

export interface OpenAIResponsesCodeInterpreterTool {
  type: "code_interpreter";
  container?: { type: "auto" };
}

export type OpenAIResponsesTool =
  | OpenAIResponsesFunctionTool
  | OpenAIResponsesWebSearchTool
  | OpenAIResponsesCodeInterpreterTool;

export interface OpenAIResponsesInputMessage {
  role: "system" | "developer" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "input_text"; text: string }
        | { type: "output_text"; text: string }
      >;
}

export interface OpenAIResponsesRequestBody {
  model: string;
  stream: true;
  input: string | OpenAIResponsesInputMessage[];
  instructions?: string;
  tools?: OpenAIResponsesTool[];
  tool_choice?: "auto" | "none" | "required";
  max_output_tokens?: number;
  reasoning?: {
    effort?: "minimal" | "low" | "medium" | "high";
    summary?: "auto" | "concise" | "detailed";
  };
}
