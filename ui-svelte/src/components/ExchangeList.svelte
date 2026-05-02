<script lang="ts">
  import type { Exchange } from "@ui/state/reducer";
  import EmptyState from "./ui/EmptyState.svelte";
  import SectionHeader from "./ui/SectionHeader.svelte";
  import ExchangeListItem from "./ExchangeListItem.svelte";

  interface Props {
    exchanges: Exchange[];
    selectedId: number | null;
    onSelect: (id: number) => void;
  }

  const { exchanges, selectedId, onSelect }: Props = $props();
</script>

<div class="flex flex-col h-full overflow-hidden border-r border-border">
  <div
    class="flex items-center px-3 h-7 shrink-0 bg-bg2 border-b border-border-strong"
  >
    <SectionHeader>
      {exchanges.length} exchange{exchanges.length !== 1 ? "s" : ""}
    </SectionHeader>
  </div>

  <div class="flex-1 overflow-y-auto overflow-x-hidden bg-pane-bg">
    {#if exchanges.length === 0}
      <EmptyState>No exchanges</EmptyState>
    {:else}
      {#each exchanges as ex (ex.id)}
        <ExchangeListItem
          exchange={ex}
          selected={ex.id === selectedId}
          onSelect={() => onSelect(ex.id)}
        />
      {/each}
    {/if}
  </div>
</div>
