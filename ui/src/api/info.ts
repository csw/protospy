export type { Service } from "@bindings/Service";
import type { Service } from "@bindings/Service";

export interface Info {
  started_at: string;
  services: Service[];
}

export async function fetchInfo(): Promise<Info> {
  const res = await fetch("/info");
  if (!res.ok) {
    throw new Error(`/info returned ${res.status}`);
  }
  try {
    return (await res.json()) as Info;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`/info returned invalid JSON: ${msg}`);
  }
}
