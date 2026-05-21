import type { BodyChunk } from "@bindings/BodyChunk";
import type { BodyState } from "@ui/state/reducer";

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

export function chunksToText(body: BodyState): string {
  const arrays = body.chunks.map((chunk: BodyChunk) => {
    if ("text" in chunk) {
      return new TextEncoder().encode(chunk.text);
    } else {
      const raw = atob(chunk.binary);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
      return bytes;
    }
  });

  const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    combined.set(arr, offset);
    offset += arr.byteLength;
  }
  return new TextDecoder().decode(combined);
}
