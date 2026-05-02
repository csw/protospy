<script lang="ts">
  import type { ConnectionStatus } from "@ui/api/sse";

  interface Props {
    status: ConnectionStatus;
  }

  const { status }: Props = $props();
</script>

{#if status === "connecting"}
  <span
    class="inline-block w-2 h-2 rounded-full bg-gold animate-pulse"
    title="Connecting"
  ></span>
{:else if status === "open"}
  <span
    class="inline-block w-2 h-2 rounded-full bg-green"
    title="Connected"
  ></span>
{:else}
  <span
    class="inline-block w-2 h-2 rounded-full bg-red animate-pulse"
    title="Reconnecting"
  ></span>
{/if}
