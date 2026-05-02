<script lang="ts">
  import ThemeToggle from "./ThemeToggle.svelte";

  interface Props {
    service: string | null;
  }

  const { service }: Props = $props();
</script>

<div
  class="flex items-center h-[38px] bg-ink border-b-2 border-red px-3 gap-3 shrink-0"
>
  <span
    class="font-family-ui font-black text-lg tracking-tight select-none"
  >
    <span class="text-bg">proto</span><span class="text-red">spy</span>
  </span>

  {#if service != null}
    <span class="font-family-mono text-xs text-dim flex items-center gap-1">
      <span class="text-mid">→</span>
      <span>{service}</span>
    </span>
  {/if}

  <div class="flex-1"></div>

  <ThemeToggle />
</div>
