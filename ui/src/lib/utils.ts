export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-ink text-bg";
    case "POST":
      return "bg-accent text-bg";
    case "PUT":
      return "bg-gold text-bg";
    case "DELETE":
      return "bg-red text-bg";
    case "PATCH":
      return "bg-green text-bg";
    default:
      return "bg-mid text-bg";
  }
}

function parseStatusCode(status: string): number {
  return parseInt(status, 10);
}

export function statusTextClass(
  status: string,
): "text-green" | "text-gold" | "text-red" {
  const code = parseStatusCode(status);
  if (code >= 200 && code < 300) return "text-green";
  if (code >= 300 && code < 400) return "text-gold";
  return "text-red";
}

export function statusChipClass(
  status: string,
): "border-green text-green" | "border-gold text-gold" | "border-red text-red" {
  const code = parseStatusCode(status);
  if (code >= 200 && code < 300) return "border-green text-green";
  if (code >= 300 && code < 400) return "border-gold text-gold";
  return "border-red text-red";
}
