<script lang="ts">
  interface Props {
    uri: string;
  }

  const { uri }: Props = $props();

  const params = $derived.by(() => {
    const queryIndex = uri.indexOf("?");
    if (queryIndex === -1) return null;

    const queryString = uri.slice(queryIndex + 1);
    const result: Array<{ key: string; value: string }> = [];

    try {
      const usp = new URLSearchParams(queryString);
      usp.forEach((value, key) => {
        result.push({ key, value });
      });
    } catch {
      return null;
    }

    return result.length === 0 ? null : result;
  });
</script>

{#if params != null}
  <div
    class="flex flex-wrap gap-x-4 gap-y-1 px-3 py-1 bg-bg2 border-b border-border shrink-0"
  >
    {#each params as { key, value }, i (i)}
      <span class="font-family-mono text-sm whitespace-nowrap">
        <span class="text-accent">{key}</span>
        <span class="text-dim">=</span>
        <span class="text-ink">{value}</span>
      </span>
    {/each}
  </div>
{/if}
