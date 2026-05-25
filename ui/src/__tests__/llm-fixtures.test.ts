import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_FIXTURES,
  LLM_SSE_FIXTURE_CORPUS,
  OPENAI_CHAT_FIXTURES,
  OPENAI_RESPONSES_FIXTURES,
} from "@ui/llm/fixtures";

const EXPECTED_ANTHROPIC_IDS = [
  "A1",
  "A2",
  "A2b",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
];

const EXPECTED_OPENAI_CHAT_IDS = ["O1", "O2", "O3", "O4", "O5", "O6", "O7"];

const EXPECTED_OPENAI_RESPONSES_IDS = [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
  "R7",
];

describe("LLM SSE fixture corpus", () => {
  it("covers every named scenario from the corpus spec", () => {
    expect(ANTHROPIC_FIXTURES.map((f) => f.id)).toEqual(EXPECTED_ANTHROPIC_IDS);
    expect(OPENAI_CHAT_FIXTURES.map((f) => f.id)).toEqual(
      EXPECTED_OPENAI_CHAT_IDS,
    );
    expect(OPENAI_RESPONSES_FIXTURES.map((f) => f.id)).toEqual(
      EXPECTED_OPENAI_RESPONSES_IDS,
    );
  });

  it("includes all 23 corpus-spec scenarios in the aggregate", () => {
    const expected =
      EXPECTED_ANTHROPIC_IDS.filter((id) => /^A\d+$/.test(id)).length +
      EXPECTED_OPENAI_CHAT_IDS.length +
      EXPECTED_OPENAI_RESPONSES_IDS.length;
    expect(expected).toBe(23);

    const corpusIds = LLM_SSE_FIXTURE_CORPUS.map((entry) => entry.fixture.id);
    for (const id of [
      ...EXPECTED_ANTHROPIC_IDS,
      ...EXPECTED_OPENAI_CHAT_IDS,
      ...EXPECTED_OPENAI_RESPONSES_IDS,
    ]) {
      expect(corpusIds).toContain(id);
    }
  });

  it("each fixture has id, description, request, and at least one event", () => {
    for (const { fixture } of LLM_SSE_FIXTURE_CORPUS) {
      expect(fixture.id).toMatch(/^[A-Z]\d+[a-z]?$/);
      expect(fixture.description.length).toBeGreaterThan(0);
      expect(fixture.request).not.toBeNull();
      expect(fixture.events.length).toBeGreaterThan(0);
    }
  });

  it("each fixture event carries a non-empty event name and a defined data field", () => {
    for (const { fixture } of LLM_SSE_FIXTURE_CORPUS) {
      for (const event of fixture.events) {
        expect(typeof event.event).toBe("string");
        expect(event.event.length).toBeGreaterThan(0);
        expect(event.data).toBeDefined();
      }
    }
  });

  it("Anthropic event names always match the data.type discriminator", () => {
    for (const fixture of ANTHROPIC_FIXTURES) {
      for (const event of fixture.events) {
        expect(event.event).toBe(event.data.type);
      }
    }
  });

  it("OpenAI Responses event names always match the data.type discriminator", () => {
    for (const fixture of OPENAI_RESPONSES_FIXTURES) {
      for (const event of fixture.events) {
        expect(event.event).toBe(event.data.type);
      }
    }
  });

  it("every OpenAI Chat fixture terminates with [DONE]", () => {
    for (const fixture of OPENAI_CHAT_FIXTURES) {
      const last = fixture.events[fixture.events.length - 1];
      expect(last.event).toBe("done");
      expect(last.data).toBe("[DONE]");
    }
  });

  it("fixture IDs are unique within the corpus", () => {
    const ids = LLM_SSE_FIXTURE_CORPUS.map((entry) => entry.fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("OpenAI Responses sequence_number values are strictly increasing", () => {
    for (const fixture of OPENAI_RESPONSES_FIXTURES) {
      const seqs = fixture.events.map((e) => e.data.sequence_number);
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }
    }
  });

  it("Anthropic non-error fixtures terminate with message_stop", () => {
    for (const fixture of ANTHROPIC_FIXTURES) {
      const last = fixture.events[fixture.events.length - 1];
      const hasError = fixture.events.some((e) => e.event === "error");
      if (hasError) {
        // A8 truncates mid-stream with `error` and no message_stop.
        expect(last.event).toBe("error");
      } else {
        expect(last.event).toBe("message_stop");
      }
    }
  });

  it("OpenAI Responses fixtures terminate with a response-final event", () => {
    const terminal = new Set([
      "response.completed",
      "response.failed",
      "response.incomplete",
    ]);
    for (const fixture of OPENAI_RESPONSES_FIXTURES) {
      const last = fixture.events[fixture.events.length - 1];
      expect(terminal.has(last.event)).toBe(true);
    }
  });
});
