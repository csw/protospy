<script lang="ts">
  import type { BodyState } from "@ui/state/reducer";
  import { decodeBody, type DecodeResult } from "@ui/body/decode";
  import { formatSize } from "@ui/lib/utils";
  import CopyButton from "./CopyButton.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import SectionHeader from "./ui/SectionHeader.svelte";
  import JsonViewer from "./JsonViewer.svelte";

  interface Props {
    title: string;
    body: BodyState | undefined;
  }

  const { title, body }: Props = $props();

  let loading = $state(false);
  let result = $state<DecodeResult | null>(null);

  $effect(() => {
    if (body == null || !body.atEnd) {
      loading = false;
      result = null;
      return;
    }

    loading = true;
    result = null;
    let cancelled = false;

    decodeBody(body)
      .then((r) => {
        if (!cancelled) {
          result = r;
          loading = false;
        }
      })
      .catch(() => {
        if (!cancelled) {
          result = null;
          loading = false;
        }
      });

    return () => {
      cancelled = true;
    };
  });

  const decodeFailed = $derived(
    !loading && body != null && body.atEnd && result == null,
  );
</script>

<div class="flex flex-col border border-border h-full overflow-hidden">
  <div
    class="flex items-center gap-3 px-3 h-7 shrink-0 bg-bg2 border-b border-border"
  >
    <SectionHeader>{title}</SectionHeader>
    {#if result != null}
      <span class="font-family-mono text-xs text-dim">{result.mediaType}</span>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      {#if result != null}
        <span class="font-family-mono text-xs text-dim">
          {formatSize(result.size)}
        </span>
      {/if}
      {#if body != null}
        <CopyButton text={result?.text} />
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-auto bg-pane-bg">
    {#if loading}
      <EmptyState>Decoding…</EmptyState>
    {:else if body != null && !body.atEnd}
      <EmptyState>Streaming… ({formatSize(body.totalBytes)} received)</EmptyState>
    {:else if body == null}
      <EmptyState>No body</EmptyState>
    {:else if decodeFailed}
      <EmptyState>Decode failed</EmptyState>
    {:else if result != null && (result.kind === "json" || result.kind === "jsonl") && result.text != null}
      <JsonViewer text={result.text} />
    {:else if result != null && result.kind === "text" && result.text != null}
      <pre class="font-family-mono text-xs text-ink p-3 whitespace-pre-wrap"
        >{result.text}</pre
      >
    {:else if result != null && result.kind === "binary"}
      <EmptyState>Binary data · {formatSize(result.size)}</EmptyState>
    {/if}
  </div>
</div>
