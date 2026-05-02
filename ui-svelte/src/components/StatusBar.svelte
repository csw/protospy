<script lang="ts">
  import type { ConnectionStatus } from "@ui/api/sse";
  import ConnectionIndicator from "./ConnectionIndicator.svelte";

  interface Props {
    connection: ConnectionStatus;
    service: string | null;
    exchangeCount: number;
  }

  const { connection, service, exchangeCount }: Props = $props();
</script>

<div
  class="flex items-center h-5 bg-ink px-2 gap-2 shrink-0 border-t border-border-strong"
>
  <ConnectionIndicator status={connection} />
  {#if service != null}
    <span class="font-family-mono text-xs text-dim">{service}</span>
  {/if}
  <span class="font-family-ui text-xs text-dim uppercase tracking-widest">
    {exchangeCount} exchange{exchangeCount !== 1 ? "s" : ""}
  </span>
  <div class="flex-1"></div>
  <span
    class="font-family-ui text-xs text-dim uppercase tracking-[0.2em] select-none"
  >
    protospy
  </span>
</div>
