<script lang="ts">
  import type { Exchange } from "@ui/state/reducer";
  import { statusChipClass } from "@ui/lib/utils";
  import MethodBadge from "./ui/MethodBadge.svelte";

  interface Props {
    exchange: Exchange;
  }

  const { exchange }: Props = $props();

  const method = $derived(exchange.method ?? "?");
  const uri = $derived(exchange.uri ?? "/");
  const pathOnly = $derived(
    uri.includes("?") ? uri.slice(0, uri.indexOf("?")) : uri,
  );
</script>

<div
  class="flex items-center gap-2 px-3 h-9 bg-ink border-b-2 border-red shrink-0 overflow-hidden"
>
  <MethodBadge {method} size="md" />

  <span class="font-family-mono text-xs text-bg flex-1 truncate">
    {pathOnly}
  </span>

  {#if exchange.status != null}
    <span
      class={`font-family-mono text-sm border px-2 py-0.5 shrink-0 ${statusChipClass(exchange.status)}`}
    >
      {exchange.status}
    </span>
  {/if}

  {#if exchange.elapsedMs != null}
    <span
      class="font-family-mono text-sm text-dim border border-border px-2 py-0.5 shrink-0"
    >
      {exchange.elapsedMs}ms
    </span>
  {/if}
</div>
