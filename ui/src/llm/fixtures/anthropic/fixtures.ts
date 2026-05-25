// Anthropic Messages streaming fixtures (A1–A9).
//
// Source: corpus spec at
// `Applications/LLM SSE streams/LLM SSE test vector sources.md`.
// Event sequences are synthesised against the SDK type definitions
// (`anthropic.types.RawMessageStreamEvent` and `Message`) and the public
// streaming reference. Models named `claude-opus-4-5` are stand-ins;
// adapter logic must not depend on the specific model string.

import type { Fixture } from "@ui/llm/fixtures/types";
import type {
  AnthropicFixtureEvent,
  AnthropicRequestBody,
} from "@ui/llm/fixtures/anthropic/events";

type AnthropicFixture = Fixture<AnthropicFixtureEvent, AnthropicRequestBody>;

const MODEL = "claude-opus-4-5";

// --- A1: plain text response -------------------------------------------

/**
 * Baseline single-block text response. Exercises message_start ->
 * content_block_start (text) -> content_block_delta (text_delta) x N ->
 * content_block_stop -> message_delta (end_turn) -> message_stop.
 * Includes the optional `ping` event the API emits between events.
 */
export const A1_PLAIN_TEXT: AnthropicFixture = {
  id: "A1",
  description: "Plain text response (baseline for text reconstruction)",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    messages: [
      {
        role: "user",
        content: "What's the answer to life, the universe, and everything?",
      },
    ],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_01PlainText",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 25,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    { event: "ping", data: { type: "ping" } },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "The" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: " answer is 42." },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 4 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A2: prompt cache hit ----------------------------------------------

/**
 * Same structure as A1 but message_start.usage has non-zero
 * cache_read_input_tokens. Verifies that adapters surface the cache
 * read count for the "is my prompt cache working?" view.
 */
export const A2_CACHE_HIT: AnthropicFixture = {
  id: "A2",
  description: "Prompt cache hit (cache_read_input_tokens > 0)",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    system:
      "You are a helpful assistant with a long preamble of cached context.",
    messages: [{ role: "user", content: "Continue." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_02CacheHit",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 12,
            output_tokens: 0,
            cache_read_input_tokens: 4800,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "OK." },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

/**
 * Companion to A2: prompt cache write (cache_creation_input_tokens > 0,
 * the more expensive case the user should be aware of).
 */
export const A2B_CACHE_WRITE: AnthropicFixture = {
  id: "A2b",
  description: "Prompt cache write (cache_creation_input_tokens > 0)",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    system:
      "You are a helpful assistant with a long preamble being cached for the first time.",
    messages: [{ role: "user", content: "Hello." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_02bCacheWrite",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 12,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 4800,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hi!" },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A3: single tool call ----------------------------------------------

/**
 * Single tool_use block. input_json_delta arrives in arbitrary chunks
 * that are NOT individually valid JSON — adapters must concatenate
 * partial_json across deltas and only attempt to parse on
 * content_block_stop. Chunking here is deliberately ragged to exercise
 * that path.
 */
export const A3_SINGLE_TOOL_CALL: AnthropicFixture = {
  id: "A3",
  description: "Single tool call with ragged input_json_delta chunking",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    tools: [
      {
        name: "search_movies",
        description: "Search the movies index.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string" },
            size: { type: "integer" },
          },
          required: ["query"],
        },
      },
    ],
    messages: [{ role: "user", content: "Find me ten action movies." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_03Tool",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 120,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_01SearchMovies",
          name: "search_movies",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"query":' },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '"action movies",' },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '"size":10}' },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 22 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A4: text + tool call ----------------------------------------------

/**
 * Mixed content: a text block ("Let me search for that.") followed by a
 * tool_use block in the same response. Tests that adapters correctly
 * sequence interleaved block types and that the tool view doesn't drop
 * the preamble text.
 */
export const A4_TEXT_AND_TOOL_CALL: AnthropicFixture = {
  id: "A4",
  description: "Text block followed by tool_use in the same response",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    tools: [
      {
        name: "search_movies",
        input_schema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ],
    messages: [{ role: "user", content: "Find me some sci-fi movies." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_04TextTool",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 112,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Let me search" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: " for that." },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_04SciFi",
          name: "search_movies",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"query":"sci-fi"}' },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 1 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 35 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A5: parallel tool calls -------------------------------------------

/**
 * Three tool_use content blocks (indexes 0, 1, 2) emitted sequentially.
 * stop_reason is still tool_use; the request body declared multiple
 * tools. Tests that the tool view renders all three calls, not just the
 * first.
 */
export const A5_PARALLEL_TOOL_CALLS: AnthropicFixture = {
  id: "A5",
  description: "Three parallel tool_use blocks in one response",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    tools: [
      {
        name: "get_weather",
        input_schema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
      {
        name: "get_time",
        input_schema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: "What's the weather and local time in Tokyo, Paris, and NYC?",
      },
    ],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_05Parallel",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 145,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_05A",
          name: "get_weather",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"city":"Tokyo"}' },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_05B",
          name: "get_weather",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"city":"Paris"}' },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 1 },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "tool_use",
          id: "toolu_05C",
          name: "get_time",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: '{"city":"NYC"}' },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 2 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 58 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A6: extended thinking ---------------------------------------------

/**
 * Thinking block (index 0) using thinking_delta, terminated by a
 * signature_delta, followed by a text block (index 1). The thinking
 * text is multi-delta so adapter assembly is non-trivial. The
 * `request.thinking` config opts the request into extended thinking.
 */
export const A6_EXTENDED_THINKING: AnthropicFixture = {
  id: "A6",
  description: "Extended thinking block followed by a text block",
  request: {
    model: MODEL,
    max_tokens: 4096,
    stream: true,
    thinking: { type: "enabled", budget_tokens: 2048 },
    messages: [
      {
        role: "user",
        content: "If a train leaves Chicago at 3pm doing 60mph...",
      },
    ],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_06Thinking",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 38,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "Let me work through this carefully. ",
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "The train's speed is 60 mph. ",
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "If we want distance after t hours, distance = 60 * t.",
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "signature_delta",
          signature: "EuYBCkQIAxgCIkBOIQ==",
        },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 1,
        delta: {
          type: "text_delta",
          text: "After 2 hours, the train is 120 miles from Chicago.",
        },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 1 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 64 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A7: extended thinking + tool call ---------------------------------

/**
 * Three blocks: thinking (index 0), brief text (index 1), tool_use
 * (index 2). The most complex Anthropic assembly case: adapters must
 * preserve block ordering, attribute the signature to the right block,
 * and handle thinking_delta and input_json_delta in the same stream.
 */
export const A7_THINKING_AND_TOOL_CALL: AnthropicFixture = {
  id: "A7",
  description: "Thinking + brief text + tool_use (mixed block assembly)",
  request: {
    model: MODEL,
    max_tokens: 4096,
    stream: true,
    thinking: { type: "enabled", budget_tokens: 2048 },
    tools: [
      {
        name: "search_movies",
        input_schema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ],
    messages: [{ role: "user", content: "I want a movie about time travel." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_07ThinkTool",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 130,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking:
            "The user wants a time-travel movie. I should call search_movies with that query.",
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "EuYBCkQIAxgCIkB7Ig==" },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 1,
        delta: {
          type: "text_delta",
          text: "Searching for time-travel movies.",
        },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 1 },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "tool_use",
          id: "toolu_07Time",
          name: "search_movies",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: '{"query":' },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: '"time travel"}' },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 2 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 78 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

// --- A8: mid-stream error ----------------------------------------------

/**
 * message_start and a partial content_block_delta, then an `error`
 * event with type "overloaded_error". No message_stop is emitted.
 * Adapters must surface the error and avoid rendering a broken partial
 * reconstruction as if it had completed normally.
 */
export const A8_MID_STREAM_ERROR: AnthropicFixture = {
  id: "A8",
  description: "Mid-stream error event (overloaded_error), no message_stop",
  request: {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    messages: [{ role: "user", content: "Tell me a long story." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_08Error",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 18,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Once upon a time, in a" },
      },
    },
    {
      event: "error",
      data: {
        type: "error",
        error: { type: "overloaded_error", message: "Overloaded" },
      },
    },
  ],
};

// --- A9: max tokens cutoff ---------------------------------------------

/**
 * Complete stream but message_delta.stop_reason is "max_tokens". The
 * text block ends mid-sentence. Drives the "got cut off" badge in the
 * UI.
 */
export const A9_MAX_TOKENS: AnthropicFixture = {
  id: "A9",
  description: "Response truncated by max_tokens (stop_reason: max_tokens)",
  request: {
    model: MODEL,
    max_tokens: 16,
    stream: true,
    messages: [{ role: "user", content: "Write a long essay about birds." }],
  },
  events: [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_09MaxTokens",
          type: "message",
          role: "assistant",
          content: [],
          model: MODEL,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 20,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Birds are a remarkable group of " },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: "warm-blooded vertebrates that have evolved",
        },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "max_tokens", stop_sequence: null },
        usage: { output_tokens: 16 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ],
};

export const ANTHROPIC_FIXTURES: readonly AnthropicFixture[] = [
  A1_PLAIN_TEXT,
  A2_CACHE_HIT,
  A2B_CACHE_WRITE,
  A3_SINGLE_TOOL_CALL,
  A4_TEXT_AND_TOOL_CALL,
  A5_PARALLEL_TOOL_CALLS,
  A6_EXTENDED_THINKING,
  A7_THINKING_AND_TOOL_CALL,
  A8_MID_STREAM_ERROR,
  A9_MAX_TOKENS,
];
