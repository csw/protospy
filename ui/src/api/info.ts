export interface Service {
  name: string;
  addr: string;
  target: string;
  subscribers: number;
}

export interface Info {
  started_at: string;
  services: Service[];
}

export async function fetchInfo(): Promise<Info> {
  const res = await fetch("/info");
  if (!res.ok) {
    throw new Error(`/info returned ${res.status}`);
  }
  return res.json() as Promise<Info>;
}
