import type { Protocol } from "@bindings/Protocol";
import { isBulkOperation } from "@ui/lib/utils";

export function showPairsTab(
  protocol: Protocol | null,
  uri: string | undefined,
): boolean {
  if (protocol !== "Elasticsearch" && protocol !== "OpenSearch") return false;
  return isBulkOperation(uri);
}
