<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    color?: "mid" | "dim";
  }

  const { children, color = "mid" }: Props = $props();
</script>

<span
  class={`font-family-ui text-xs font-black uppercase tracking-widest ${color === "mid" ? "text-mid" : "text-dim"}`}
>
  {@render children()}
</span>
