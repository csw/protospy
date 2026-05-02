<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    textSize?: "xs" | "sm";
  }

  const { children, textSize = "xs" }: Props = $props();
</script>

<div class="flex items-center justify-center h-full">
  <span
    class={`text-dim font-family-ui uppercase tracking-widest ${textSize === "xs" ? "text-xs" : "text-sm"}`}
  >
    {@render children()}
  </span>
</div>
