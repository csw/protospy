// Common shape for the LLM SSE test fixture corpus.
//
// Fixtures are stored as parsed SSE event sequences (event name + parsed
// JSON data). Adapter tests can import them directly; a helper to
// re-serialise an event list into raw SSE bytes can be added alongside
// the SSE parser tests when needed (the format is regular enough that
// `event: <name>\ndata: <JSON.stringify(data)>\n\n` reproduces the wire
// representation for fixtures that do not depend on `id:` or comment
// lines, which none of these do).

export interface FixtureEvent<TData = unknown> {
  /** SSE event name (the value of the `event:` field). */
  event: string;
  /** Parsed JSON payload from the `data:` field. */
  data: TData;
}

export interface Fixture<
  TEvent extends FixtureEvent = FixtureEvent,
  TRequest = unknown,
> {
  /** Scenario ID from the corpus spec, e.g. "A1", "O3", "R7". */
  id: string;
  /** One-line description of what the fixture covers. */
  description: string;
  /** Parsed request body that would have produced this stream. */
  request: TRequest;
  /** Parsed SSE event sequence, in API emit order. */
  events: TEvent[];
}
