// OpenAI Responses API streaming fixtures (R1–R7).
//
// Source: corpus spec at
// `Applications/LLM SSE streams/LLM SSE test vector sources.md`.
// Synthesised against the documented event lifecycle and the OpenAPI
// schemas for ResponseCreatedEvent, ResponseInProgressEvent,
// ResponseIncompleteEvent, etc.

import type { Fixture } from "@ui/llm/fixtures/types";
import type {
  OpenAIResponsesFixtureEvent,
  OpenAIResponsesRequestBody,
  OpenAIResponsesResource,
} from "@ui/llm/fixtures/openai-responses/events";

type OpenAIResponsesFixture = Fixture<
  OpenAIResponsesFixtureEvent,
  OpenAIResponsesRequestBody
>;

const MODEL = "gpt-5.1-2025-11-01";
const CREATED_AT = 1_716_000_000;

function baseResponse(
  id: string,
  partial: Partial<OpenAIResponsesResource> = {},
): OpenAIResponsesResource {
  return {
    id,
    object: "response",
    status: "in_progress",
    created_at: CREATED_AT,
    model: MODEL,
    output: [],
    ...partial,
  };
}

// --- R1: plain text response -------------------------------------------

/**
 * Full lifecycle: response.created -> response.in_progress ->
 * output_item.added (message) -> content_part.added (output_text) ->
 * output_text.delta xN -> output_text.done -> content_part.done ->
 * output_item.done -> response.completed (with final usage).
 */
export const R1_PLAIN_TEXT: OpenAIResponsesFixture = {
  id: "R1",
  description: "Plain text response covering the full event lifecycle",
  request: {
    model: MODEL,
    stream: true,
    input: "Say hi.",
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R1"),
      },
    },
    {
      event: "response.in_progress",
      data: {
        type: "response.in_progress",
        sequence_number: 1,
        response: baseResponse("resp_R1"),
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 2,
        output_index: 0,
        item: {
          id: "msg_R1",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      },
    },
    {
      event: "response.content_part.added",
      data: {
        type: "response.content_part.added",
        sequence_number: 3,
        item_id: "msg_R1",
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        sequence_number: 4,
        item_id: "msg_R1",
        output_index: 0,
        content_index: 0,
        delta: "Hi",
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        sequence_number: 5,
        item_id: "msg_R1",
        output_index: 0,
        content_index: 0,
        delta: " there.",
      },
    },
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        sequence_number: 6,
        item_id: "msg_R1",
        output_index: 0,
        content_index: 0,
        text: "Hi there.",
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        sequence_number: 7,
        item_id: "msg_R1",
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "Hi there.", annotations: [] },
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 8,
        output_index: 0,
        item: {
          id: "msg_R1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: "Hi there.", annotations: [] },
          ],
        },
      },
    },
    {
      event: "response.completed",
      data: {
        type: "response.completed",
        sequence_number: 9,
        response: baseResponse("resp_R1", {
          status: "completed",
          completed_at: CREATED_AT + 1,
          output: [
            {
              id: "msg_R1",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: "Hi there.", annotations: [] },
              ],
            },
          ],
          usage: {
            input_tokens: 8,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 3,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 11,
          },
        }),
      },
    },
  ],
};

// --- R2: web search tool call -----------------------------------------

/**
 * Built-in web_search_call item with explicit in_progress -> searching
 * -> completed phase events. After the search item completes, a
 * message item carries the synthesised reply. Wall time between
 * web_search_call.in_progress and web_search_call.completed gives the
 * search latency for the timeline view.
 */
export const R2_WEB_SEARCH: OpenAIResponsesFixture = {
  id: "R2",
  description: "Built-in web_search_call with phased lifecycle, then a message",
  request: {
    model: MODEL,
    stream: true,
    input: "Who won the 2024 World Series?",
    tools: [{ type: "web_search" }],
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R2"),
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 1,
        output_index: 0,
        item: {
          id: "ws_R2",
          type: "web_search_call",
          status: "in_progress",
        },
      },
    },
    {
      event: "response.web_search_call.in_progress",
      data: {
        type: "response.web_search_call.in_progress",
        sequence_number: 2,
        item_id: "ws_R2",
        output_index: 0,
      },
    },
    {
      event: "response.web_search_call.searching",
      data: {
        type: "response.web_search_call.searching",
        sequence_number: 3,
        item_id: "ws_R2",
        output_index: 0,
      },
    },
    {
      event: "response.web_search_call.completed",
      data: {
        type: "response.web_search_call.completed",
        sequence_number: 4,
        item_id: "ws_R2",
        output_index: 0,
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 5,
        output_index: 0,
        item: {
          id: "ws_R2",
          type: "web_search_call",
          status: "completed",
          action: { type: "search", query: "2024 World Series winner" },
        },
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 6,
        output_index: 1,
        item: {
          id: "msg_R2",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      },
    },
    {
      event: "response.content_part.added",
      data: {
        type: "response.content_part.added",
        sequence_number: 7,
        item_id: "msg_R2",
        output_index: 1,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        sequence_number: 8,
        item_id: "msg_R2",
        output_index: 1,
        content_index: 0,
        delta: "The Los Angeles Dodgers.",
      },
    },
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        sequence_number: 9,
        item_id: "msg_R2",
        output_index: 1,
        content_index: 0,
        text: "The Los Angeles Dodgers.",
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        sequence_number: 10,
        item_id: "msg_R2",
        output_index: 1,
        content_index: 0,
        part: {
          type: "output_text",
          text: "The Los Angeles Dodgers.",
          annotations: [],
        },
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 11,
        output_index: 1,
        item: {
          id: "msg_R2",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "The Los Angeles Dodgers.",
              annotations: [],
            },
          ],
        },
      },
    },
    {
      event: "response.completed",
      data: {
        type: "response.completed",
        sequence_number: 12,
        response: baseResponse("resp_R2", {
          status: "completed",
          completed_at: CREATED_AT + 4,
          output: [
            {
              id: "ws_R2",
              type: "web_search_call",
              status: "completed",
              action: { type: "search", query: "2024 World Series winner" },
            },
            {
              id: "msg_R2",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "The Los Angeles Dodgers.",
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 24,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 7,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 31,
          },
        }),
      },
    },
  ],
};

// --- R3: function call ------------------------------------------------

/**
 * Custom function_call item: output_item.added carries the call_id and
 * name, function_call_arguments.delta streams the arguments JSON in
 * fragments, function_call_arguments.done emits the final string, and
 * output_item.done re-emits the assembled item. No message item is
 * produced — the model is calling the tool, not replying.
 */
export const R3_FUNCTION_CALL: OpenAIResponsesFixture = {
  id: "R3",
  description: "Custom function_call with streaming arguments deltas",
  request: {
    model: MODEL,
    stream: true,
    input: "Search for action movies.",
    tools: [
      {
        type: "function",
        name: "search_movies",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        strict: true,
      },
    ],
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R3"),
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 1,
        output_index: 0,
        item: {
          id: "fc_R3",
          type: "function_call",
          status: "in_progress",
          call_id: "call_R3",
          name: "search_movies",
          arguments: "",
        },
      },
    },
    {
      event: "response.function_call_arguments.delta",
      data: {
        type: "response.function_call_arguments.delta",
        sequence_number: 2,
        item_id: "fc_R3",
        output_index: 0,
        delta: '{"query":',
      },
    },
    {
      event: "response.function_call_arguments.delta",
      data: {
        type: "response.function_call_arguments.delta",
        sequence_number: 3,
        item_id: "fc_R3",
        output_index: 0,
        delta: '"action"}',
      },
    },
    {
      event: "response.function_call_arguments.done",
      data: {
        type: "response.function_call_arguments.done",
        sequence_number: 4,
        item_id: "fc_R3",
        output_index: 0,
        arguments: '{"query":"action"}',
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 5,
        output_index: 0,
        item: {
          id: "fc_R3",
          type: "function_call",
          status: "completed",
          call_id: "call_R3",
          name: "search_movies",
          arguments: '{"query":"action"}',
        },
      },
    },
    {
      event: "response.completed",
      data: {
        type: "response.completed",
        sequence_number: 6,
        response: baseResponse("resp_R3", {
          status: "completed",
          completed_at: CREATED_AT + 1,
          output: [
            {
              id: "fc_R3",
              type: "function_call",
              status: "completed",
              call_id: "call_R3",
              name: "search_movies",
              arguments: '{"query":"action"}',
            },
          ],
          usage: {
            input_tokens: 32,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 12,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 44,
          },
        }),
      },
    },
  ],
};

// --- R4: code interpreter ----------------------------------------------

/**
 * Built-in code_interpreter_call: in_progress -> code.delta xN ->
 * code.done -> completed. Followed by a message that incorporates the
 * computed result. Exercises both code-write streaming and the timeline
 * view's per-phase wall-time attribution.
 */
export const R4_CODE_INTERPRETER: OpenAIResponsesFixture = {
  id: "R4",
  description: "Built-in code_interpreter_call with code deltas + message",
  request: {
    model: MODEL,
    stream: true,
    input: "What is 17 * 23?",
    tools: [{ type: "code_interpreter", container: { type: "auto" } }],
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R4"),
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 1,
        output_index: 0,
        item: {
          id: "ci_R4",
          type: "code_interpreter_call",
          status: "in_progress",
        },
      },
    },
    {
      event: "response.code_interpreter_call.in_progress",
      data: {
        type: "response.code_interpreter_call.in_progress",
        sequence_number: 2,
        item_id: "ci_R4",
        output_index: 0,
      },
    },
    {
      event: "response.code_interpreter_call_code.delta",
      data: {
        type: "response.code_interpreter_call_code.delta",
        sequence_number: 3,
        item_id: "ci_R4",
        output_index: 0,
        delta: "result = 17 * 23\n",
      },
    },
    {
      event: "response.code_interpreter_call_code.delta",
      data: {
        type: "response.code_interpreter_call_code.delta",
        sequence_number: 4,
        item_id: "ci_R4",
        output_index: 0,
        delta: "print(result)\n",
      },
    },
    {
      event: "response.code_interpreter_call_code.done",
      data: {
        type: "response.code_interpreter_call_code.done",
        sequence_number: 5,
        item_id: "ci_R4",
        output_index: 0,
        code: "result = 17 * 23\nprint(result)\n",
      },
    },
    {
      event: "response.code_interpreter_call.completed",
      data: {
        type: "response.code_interpreter_call.completed",
        sequence_number: 6,
        item_id: "ci_R4",
        output_index: 0,
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 7,
        output_index: 0,
        item: {
          id: "ci_R4",
          type: "code_interpreter_call",
          status: "completed",
          code: "result = 17 * 23\nprint(result)\n",
          outputs: [{ type: "logs", logs: "391\n" }],
        },
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 8,
        output_index: 1,
        item: {
          id: "msg_R4",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      },
    },
    {
      event: "response.content_part.added",
      data: {
        type: "response.content_part.added",
        sequence_number: 9,
        item_id: "msg_R4",
        output_index: 1,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        sequence_number: 10,
        item_id: "msg_R4",
        output_index: 1,
        content_index: 0,
        delta: "17 * 23 = 391.",
      },
    },
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        sequence_number: 11,
        item_id: "msg_R4",
        output_index: 1,
        content_index: 0,
        text: "17 * 23 = 391.",
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        sequence_number: 12,
        item_id: "msg_R4",
        output_index: 1,
        content_index: 0,
        part: {
          type: "output_text",
          text: "17 * 23 = 391.",
          annotations: [],
        },
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 13,
        output_index: 1,
        item: {
          id: "msg_R4",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: "17 * 23 = 391.", annotations: [] },
          ],
        },
      },
    },
    {
      event: "response.completed",
      data: {
        type: "response.completed",
        sequence_number: 14,
        response: baseResponse("resp_R4", {
          status: "completed",
          completed_at: CREATED_AT + 3,
          output: [
            {
              id: "ci_R4",
              type: "code_interpreter_call",
              status: "completed",
              code: "result = 17 * 23\nprint(result)\n",
              outputs: [{ type: "logs", logs: "391\n" }],
            },
            {
              id: "msg_R4",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "17 * 23 = 391.",
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 14,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 18,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 32,
          },
        }),
      },
    },
  ],
};

// --- R5: reasoning summary --------------------------------------------

/**
 * Reasoning item carrying a summary content part. Summary text streams
 * via reasoning_summary_text.delta. The reasoning item precedes the
 * regular message item, and `response.usage.output_tokens_details.
 * reasoning_tokens` is non-zero on completion.
 */
export const R5_REASONING: OpenAIResponsesFixture = {
  id: "R5",
  description: "Reasoning item with streamed summary text, then a message",
  request: {
    model: MODEL,
    stream: true,
    input: "If three trains leave...",
    reasoning: { effort: "medium", summary: "concise" },
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R5"),
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 1,
        output_index: 0,
        item: {
          id: "rs_R5",
          type: "reasoning",
          status: "in_progress",
          summary: [],
        },
      },
    },
    {
      event: "response.reasoning_summary_part.added",
      data: {
        type: "response.reasoning_summary_part.added",
        sequence_number: 2,
        item_id: "rs_R5",
        output_index: 0,
        summary_index: 0,
        part: { type: "summary_text", text: "" },
      },
    },
    {
      event: "response.reasoning_summary_text.delta",
      data: {
        type: "response.reasoning_summary_text.delta",
        sequence_number: 3,
        item_id: "rs_R5",
        output_index: 0,
        summary_index: 0,
        delta: "Comparing relative speeds ",
      },
    },
    {
      event: "response.reasoning_summary_text.delta",
      data: {
        type: "response.reasoning_summary_text.delta",
        sequence_number: 4,
        item_id: "rs_R5",
        output_index: 0,
        summary_index: 0,
        delta: "and solving for the meeting time.",
      },
    },
    {
      event: "response.reasoning_summary_text.done",
      data: {
        type: "response.reasoning_summary_text.done",
        sequence_number: 5,
        item_id: "rs_R5",
        output_index: 0,
        summary_index: 0,
        text: "Comparing relative speeds and solving for the meeting time.",
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 6,
        output_index: 0,
        item: {
          id: "rs_R5",
          type: "reasoning",
          status: "completed",
          summary: [
            {
              type: "summary_text",
              text: "Comparing relative speeds and solving for the meeting time.",
            },
          ],
        },
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 7,
        output_index: 1,
        item: {
          id: "msg_R5",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      },
    },
    {
      event: "response.content_part.added",
      data: {
        type: "response.content_part.added",
        sequence_number: 8,
        item_id: "msg_R5",
        output_index: 1,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        sequence_number: 9,
        item_id: "msg_R5",
        output_index: 1,
        content_index: 0,
        delta: "They meet at 2pm.",
      },
    },
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        sequence_number: 10,
        item_id: "msg_R5",
        output_index: 1,
        content_index: 0,
        text: "They meet at 2pm.",
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        sequence_number: 11,
        item_id: "msg_R5",
        output_index: 1,
        content_index: 0,
        part: {
          type: "output_text",
          text: "They meet at 2pm.",
          annotations: [],
        },
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 12,
        output_index: 1,
        item: {
          id: "msg_R5",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: "They meet at 2pm.", annotations: [] },
          ],
        },
      },
    },
    {
      event: "response.completed",
      data: {
        type: "response.completed",
        sequence_number: 13,
        response: baseResponse("resp_R5", {
          status: "completed",
          completed_at: CREATED_AT + 5,
          output: [
            {
              id: "rs_R5",
              type: "reasoning",
              status: "completed",
              summary: [
                {
                  type: "summary_text",
                  text: "Comparing relative speeds and solving for the meeting time.",
                },
              ],
            },
            {
              id: "msg_R5",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "They meet at 2pm.",
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 36,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 9,
            output_tokens_details: { reasoning_tokens: 220 },
            total_tokens: 45,
          },
        }),
      },
    },
  ],
};

// --- R6: failed response -----------------------------------------------

/**
 * Stream lifecycle starts normally, then `response.failed` arrives
 * with an error object. The terminal response object's status is
 * "failed". Distinct from a connection drop or the message-level
 * Anthropic `error` event.
 */
export const R6_FAILED: OpenAIResponsesFixture = {
  id: "R6",
  description: "Response fails mid-stream with response.failed event",
  request: {
    model: MODEL,
    stream: true,
    input: "Hello.",
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R6"),
      },
    },
    {
      event: "response.in_progress",
      data: {
        type: "response.in_progress",
        sequence_number: 1,
        response: baseResponse("resp_R6"),
      },
    },
    {
      event: "response.failed",
      data: {
        type: "response.failed",
        sequence_number: 2,
        response: baseResponse("resp_R6", {
          status: "failed",
          error: {
            code: "server_error",
            message: "The model failed to generate a response.",
          },
        }),
      },
    },
  ],
};

// --- R7: incomplete response -------------------------------------------

/**
 * Response was cut short because max_output_tokens was reached. The
 * stream still emits `response.incomplete` (not `response.completed`),
 * and the response object carries
 * `incomplete_details.reason: "max_output_tokens"`.
 */
export const R7_INCOMPLETE: OpenAIResponsesFixture = {
  id: "R7",
  description: "Response truncated by max_output_tokens (response.incomplete)",
  request: {
    model: MODEL,
    stream: true,
    input: "Write a long essay about birds.",
    max_output_tokens: 16,
  },
  events: [
    {
      event: "response.created",
      data: {
        type: "response.created",
        sequence_number: 0,
        response: baseResponse("resp_R7"),
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        sequence_number: 1,
        output_index: 0,
        item: {
          id: "msg_R7",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      },
    },
    {
      event: "response.content_part.added",
      data: {
        type: "response.content_part.added",
        sequence_number: 2,
        item_id: "msg_R7",
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        sequence_number: 3,
        item_id: "msg_R7",
        output_index: 0,
        content_index: 0,
        delta: "Birds are warm-blooded vertebrates that have",
      },
    },
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        sequence_number: 4,
        item_id: "msg_R7",
        output_index: 0,
        content_index: 0,
        text: "Birds are warm-blooded vertebrates that have",
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        sequence_number: 5,
        item_id: "msg_R7",
        output_index: 0,
        content_index: 0,
        part: {
          type: "output_text",
          text: "Birds are warm-blooded vertebrates that have",
          annotations: [],
        },
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        sequence_number: 6,
        output_index: 0,
        item: {
          id: "msg_R7",
          type: "message",
          role: "assistant",
          status: "incomplete",
          content: [
            {
              type: "output_text",
              text: "Birds are warm-blooded vertebrates that have",
              annotations: [],
            },
          ],
        },
      },
    },
    {
      event: "response.incomplete",
      data: {
        type: "response.incomplete",
        sequence_number: 7,
        response: baseResponse("resp_R7", {
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [
            {
              id: "msg_R7",
              type: "message",
              role: "assistant",
              status: "incomplete",
              content: [
                {
                  type: "output_text",
                  text: "Birds are warm-blooded vertebrates that have",
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 12,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 16,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 28,
          },
        }),
      },
    },
  ],
};

export const OPENAI_RESPONSES_FIXTURES: readonly OpenAIResponsesFixture[] = [
  R1_PLAIN_TEXT,
  R2_WEB_SEARCH,
  R3_FUNCTION_CALL,
  R4_CODE_INTERPRETER,
  R5_REASONING,
  R6_FAILED,
  R7_INCOMPLETE,
];
