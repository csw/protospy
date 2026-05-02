<script lang="ts">
  import type { Exchange } from "@ui/state/reducer";
  import EmptyState from "./ui/EmptyState.svelte";
  import ContextBar from "./ContextBar.svelte";
  import QueryParamsStrip from "./QueryParamsStrip.svelte";
  import BodyPane from "./BodyPane.svelte";
  import HeadersDrawer from "./HeadersDrawer.svelte";

  interface Props {
    exchange: Exchange | null;
  }

  const { exchange }: Props = $props();
</script>

{#if exchange == null}
  <div class="flex-1 bg-pane-bg overflow-hidden">
    <EmptyState textSize="sm">Select an exchange</EmptyState>
  </div>
{:else}
  <div class="flex flex-col flex-1 overflow-hidden bg-pane-bg">
    <ContextBar {exchange} />

    {#if exchange.uri != null}
      <QueryParamsStrip uri={exchange.uri} />
    {/if}

    <div class="flex flex-1 overflow-hidden gap-0.5 p-1 bg-bg2">
      <div class="flex-1 overflow-hidden">
        <BodyPane title="Request Body" body={exchange.requestBody} />
      </div>
      <div class="flex-1 overflow-hidden">
        <BodyPane title="Response Body" body={exchange.responseBody} />
      </div>
    </div>

    <HeadersDrawer
      requestHeaders={exchange.requestHeaders}
      responseHeaders={exchange.responseHeaders}
    />
  </div>
{/if}
