<script lang="ts">
  import type { Exchange } from "@ui/state/reducer";
  import { formatSize, statusTextClass } from "@ui/lib/utils";
  import MethodBadge from "./ui/MethodBadge.svelte";

  interface Props {
    exchange: Exchange;
    selected: boolean;
    onSelect: () => void;
  }

  const { exchange, selected, onSelect }: Props = $props();

  function formatTime(timestamp: string): string {
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "";
    }
  }

  function pathOnly(uri: string): string {
    const q = uri.indexOf("?");
    return q === -1 ? uri : uri.slice(0, q);
  }

  const method = $derived(exchange.method ?? "?");
  const uri = $derived(exchange.uri ?? "/");
  const isError = $derived(
    exchange.status != null && parseInt(exchange.status, 10) >= 400,
  );
  const reqSize = $derived(exchange.requestBody?.totalBytes ?? 0);
  const resSize = $derived(exchange.responseBody?.totalBytes ?? 0);
</script>

<button
  onclick={onSelect}
  class={[
    "w-full text-left px-2 py-1.5 border-b border-border",
    "flex flex-col gap-0.5 cursor-pointer transition-colors",
    selected ? "bg-ink text-bg" : "bg-pane-bg hover:bg-hl-bg text-ink",
    isError && !selected ? "border-l-2 border-l-red" : "",
  ]
    .filter(Boolean)
    .join(" ")}
  aria-selected={selected}
>
  <div class="flex items-center gap-1.5">
    <MethodBadge {method} size="sm" />

    {#if exchange.status != null}
      <span
        class={`font-family-mono text-sm font-bold ${selected ? "text-bg" : statusTextClass(exchange.status)}`}
      >
        {exchange.status}
      </span>
    {/if}

    <span
      class={`font-family-mono text-xs ml-auto shrink-0 ${selected ? "text-mid" : "text-dim"}`}
    >
      {formatTime(exchange.timestamp)}
    </span>
  </div>

  <div
    class={`font-family-mono text-sm truncate ${selected ? "text-bg" : "text-ink"}`}
    title={uri}
  >
    {pathOnly(uri)}
  </div>

  <div
    class={`flex gap-2 font-family-mono text-xs ${selected ? "text-mid" : "text-dim"}`}
  >
    {#if exchange.elapsedMs != null}
      <span>{exchange.elapsedMs}ms</span>
    {/if}
    <span>req {formatSize(reqSize)} / res {formatSize(resSize)}</span>
  </div>
</button>
