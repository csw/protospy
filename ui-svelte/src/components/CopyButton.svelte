<script lang="ts">
  interface Props {
    text?: string;
  }

  const { text }: Props = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function handleClick() {
    if (text == null) return;
    void navigator.clipboard.writeText(text);
    copied = true;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      copied = false;
    }, 2000);
  }

  $effect(() => {
    return () => {
      if (timer != null) clearTimeout(timer);
    };
  });
</script>

<button
  onclick={handleClick}
  disabled={!text}
  class="font-family-mono text-xs text-accent hover:text-ink transition-colors cursor-pointer disabled:text-dim disabled:cursor-not-allowed disabled:opacity-50"
>
  {copied ? "Copied!" : "Copy"}
</button>
