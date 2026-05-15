export interface SSEEvent {
  type: string; // from "event:" field, default "message"
  data: string; // from "data:" field(s), concatenated
  id?: string; // from "id:" field
  parsedData?: unknown; // JSON.parse(data) if valid JSON, else undefined
  index: number; // sequential index (0-based)
}

export function parseSSEBody(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = text.split(/\n\n+/);
  let index = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let type = "message";
    const dataLines: string[] = [];
    let id: string | undefined;

    for (const line of trimmed.split("\n")) {
      if (line.startsWith(":")) continue; // comment
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const field = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trimStart();

      if (field === "event") type = value;
      else if (field === "data") dataLines.push(value);
      else if (field === "id") id = value;
    }

    if (dataLines.length === 0) continue;

    const data = dataLines.join("\n");
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(data);
    } catch {
      /* not JSON */
    }

    events.push({ type, data, id, parsedData, index });
    index++;
  }

  return events;
}

export function extractAnthropicTranscript(events: SSEEvent[]): {
  text: string;
  model?: string;
  messageId?: string;
  stopReason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  isComplete: boolean;
} {
  let text = "";
  let model: string | undefined;
  let messageId: string | undefined;
  let stopReason: string | undefined;
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;
  let isComplete = false;

  for (const event of events) {
    if (!event.parsedData || typeof event.parsedData !== "object") continue;
    const d = event.parsedData as Record<string, unknown>;

    if (event.type === "message_start") {
      const msg = d.message as Record<string, unknown> | undefined;
      if (msg) {
        model = msg.model as string | undefined;
        messageId = msg.id as string | undefined;
      }
    } else if (event.type === "content_block_delta") {
      const delta = d.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        text += (delta.text as string) ?? "";
      }
    } else if (event.type === "message_delta") {
      const delta = d.delta as Record<string, unknown> | undefined;
      if (delta?.stop_reason) {
        stopReason = delta.stop_reason as string;
      }
      const u = d.usage as Record<string, unknown> | undefined;
      if (u) {
        usage = {
          input_tokens: u.input_tokens as number | undefined,
          output_tokens: u.output_tokens as number | undefined,
        };
      }
    } else if (event.type === "message_stop") {
      isComplete = true;
    }
  }

  return { text, model, messageId, stopReason, usage, isComplete };
}
