// OpenAI Chat Completions streaming fixtures (O1–O7).
//
// Source: corpus spec at
// `Applications/LLM SSE streams/LLM SSE test vector sources.md`.
// Synthesised against the OpenAI Chat Completions streaming schema
// (`chat.completion.chunk` with `choices[].delta`).

import type { Fixture } from "@ui/llm/fixtures/types";
import type {
  OpenAIChatChunk,
  OpenAIChatFixtureEvent,
  OpenAIChatRequestBody,
} from "@ui/llm/fixtures/openai-chat/events";

type OpenAIChatFixture = Fixture<OpenAIChatFixtureEvent, OpenAIChatRequestBody>;

const MODEL = "gpt-4.1-2025-04-14";
const CREATED = 1_716_000_000;

function chunk(id: string, partial: Partial<OpenAIChatChunk>): OpenAIChatChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created: CREATED,
    model: MODEL,
    choices: [],
    ...partial,
  };
}

const DONE: OpenAIChatFixtureEvent = { event: "done", data: "[DONE]" };

// --- O1: plain text response -------------------------------------------

/**
 * Baseline: role chunk, content chunks, finish_reason chunk, [DONE].
 * No usage chunk (request did not opt in via stream_options).
 */
export const O1_PLAIN_TEXT: OpenAIChatFixture = {
  id: "O1",
  description: "Plain text response (baseline)",
  request: {
    model: MODEL,
    stream: true,
    messages: [{ role: "user", content: "Say hi briefly." }],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O1", {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O1", {
        choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O1", {
        choices: [
          { index: 0, delta: { content: " there!" }, finish_reason: null },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O1", {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }),
    },
    DONE,
  ],
};

// --- O2: prompt cache hit ----------------------------------------------

/**
 * Same shape as O1 plus a final usage-only chunk where
 * prompt_tokens_details.cached_tokens > 0. Note: usage chunks are only
 * present when the request sets stream_options.include_usage: true.
 * Adapter authors are commonly confused by the absence of usage in
 * default streams — this fixture is the positive case.
 */
export const O2_CACHE_HIT: OpenAIChatFixture = {
  id: "O2",
  description: "Prompt cache hit (prompt_tokens_details.cached_tokens > 0)",
  request: {
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      {
        role: "system",
        content: "You are a movie recommender with a long cached preamble.",
      },
      { role: "user", content: "Give me one." },
    ],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O2", {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O2", {
        choices: [
          { index: 0, delta: { content: "Inception." }, finish_reason: null },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O2", {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O2", {
        choices: [],
        usage: {
          prompt_tokens: 4096,
          completion_tokens: 3,
          total_tokens: 4099,
          prompt_tokens_details: { cached_tokens: 4032 },
        },
      }),
    },
    DONE,
  ],
};

// --- O3: single tool call ----------------------------------------------

/**
 * First chunk for the tool call establishes id, type, and name; later
 * chunks are arguments-only. arguments arrives in partial JSON
 * fragments that are individually invalid; adapters concatenate per
 * index and parse on the finish_reason chunk.
 */
export const O3_SINGLE_TOOL_CALL: OpenAIChatFixture = {
  id: "O3",
  description: "Single tool call with partial JSON arguments deltas",
  request: {
    model: MODEL,
    stream: true,
    tools: [
      {
        type: "function",
        function: {
          name: "search_movies",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      },
    ],
    messages: [{ role: "user", content: "Find me an action movie." }],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O3", {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: "call_O3",
                  type: "function",
                  function: { name: "search_movies", arguments: "" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O3", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"query":' } }],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O3", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"action"}' } }],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O3", {
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      }),
    },
    DONE,
  ],
};

// --- O4: parallel tool calls -------------------------------------------

/**
 * Two tool calls in flight at once. Argument deltas for index 0 and
 * index 1 interleave in the stream. Tests that adapters key on
 * tool_calls[*].index to reconstruct two separate argument strings.
 */
export const O4_PARALLEL_TOOL_CALLS: OpenAIChatFixture = {
  id: "O4",
  description: "Parallel tool calls with interleaved argument deltas",
  request: {
    model: MODEL,
    stream: true,
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ],
    messages: [{ role: "user", content: "Weather in Tokyo and Paris?" }],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: "call_O4A",
                  type: "function",
                  function: { name: "get_weather", arguments: "" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: "call_O4B",
                  type: "function",
                  function: { name: "get_weather", arguments: "" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"city":' } }],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 1, function: { arguments: '{"city":' } }],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"Tokyo"}' } }],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 1, function: { arguments: '"Paris"}' } }],
            },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O4", {
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      }),
    },
    DONE,
  ],
};

// --- O5: refusal -------------------------------------------------------

/**
 * choices[0].delta.refusal populated instead of content. finish_reason
 * is "stop" (refusal is not a distinct finish_reason for chat
 * completions). The refusal text streams in chunks just like content.
 */
export const O5_REFUSAL: OpenAIChatFixture = {
  id: "O5",
  description: "Model refusal: delta.refusal populated, finish_reason 'stop'",
  request: {
    model: MODEL,
    stream: true,
    messages: [
      { role: "user", content: "Tell me something I shouldn't know." },
    ],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O5", {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", refusal: "" },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O5", {
        choices: [
          { index: 0, delta: { refusal: "I'm sorry, " }, finish_reason: null },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O5", {
        choices: [
          {
            index: 0,
            delta: { refusal: "I can't help with that." },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O5", {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }),
    },
    DONE,
  ],
};

// --- O6: content filter ------------------------------------------------

/**
 * Stream is cut short by a moderation filter; finish_reason is
 * "content_filter" and the content is truncated. Drives the filter
 * badge path.
 */
export const O6_CONTENT_FILTER: OpenAIChatFixture = {
  id: "O6",
  description: "Content filter cutoff (finish_reason 'content_filter')",
  request: {
    model: MODEL,
    stream: true,
    messages: [{ role: "user", content: "Continue this story..." }],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O6", {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O6", {
        choices: [
          {
            index: 0,
            delta: { content: "Once upon a time" },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O6", {
        choices: [{ index: 0, delta: {}, finish_reason: "content_filter" }],
      }),
    },
    DONE,
  ],
};

// --- O7: trailing usage chunk -----------------------------------------

/**
 * Stream where the final chunk before [DONE] is a zero-choice chunk
 * carrying only `usage`. Only present when stream_options.include_usage
 * is true. Tests that the adapter parses usage from a chunk with
 * empty `choices` rather than ignoring it.
 */
export const O7_USAGE_CHUNK: OpenAIChatFixture = {
  id: "O7",
  description: "Final zero-choice chunk carrying usage totals",
  request: {
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "user", content: "Briefly." }],
  },
  events: [
    {
      event: "message",
      data: chunk("chatcmpl-O7", {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O7", {
        choices: [
          { index: 0, delta: { content: "Done." }, finish_reason: null },
        ],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O7", {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }),
    },
    {
      event: "message",
      data: chunk("chatcmpl-O7", {
        choices: [],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 2,
          total_tokens: 14,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      }),
    },
    DONE,
  ],
};

export const OPENAI_CHAT_FIXTURES: readonly OpenAIChatFixture[] = [
  O1_PLAIN_TEXT,
  O2_CACHE_HIT,
  O3_SINGLE_TOOL_CALL,
  O4_PARALLEL_TOOL_CALLS,
  O5_REFUSAL,
  O6_CONTENT_FILTER,
  O7_USAGE_CHUNK,
];
