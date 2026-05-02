<script lang="ts">
  import { methodBadgeClass } from "@ui/lib/utils";

  interface Props {
    method: string;
    size?: "sm" | "md";
  }

  const { method, size = "sm" }: Props = $props();

  const textSize = $derived(size === "sm" ? "text-xs" : "text-sm");
  const padding = $derived(size === "sm" ? "px-1.5 py-0" : "px-2 py-0.5");
</script>

<span
  class={`font-family-ui ${textSize} font-black uppercase tracking-widest ${padding} shrink-0 ${methodBadgeClass(method)}`}
>
  {method}
</span>
