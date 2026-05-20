import type { SSEEvent } from "@ui/body/sse";

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
