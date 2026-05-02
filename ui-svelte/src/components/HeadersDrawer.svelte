<script lang="ts">
  import type { ProxyHeaders } from "@bindings/ProxyHeaders";
  import SectionHeader from "./ui/SectionHeader.svelte";

  interface Props {
    requestHeaders?: ProxyHeaders;
    responseHeaders?: ProxyHeaders;
  }

  const { requestHeaders, responseHeaders }: Props = $props();

  let open = $state(false);

  const hasHeaders = $derived(
    (requestHeaders != null && requestHeaders.length > 0) ||
      (responseHeaders != null && responseHeaders.length > 0),
  );
</script>

{#if hasHeaders}
  <div class="border-t border-border shrink-0">
    <button
      onclick={() => {
        open = !open;
      }}
      class="w-full flex items-center gap-2 px-3 h-7 bg-bg2 hover:bg-bg3 transition-colors text-left"
      aria-expanded={open}
    >
      <SectionHeader>Headers</SectionHeader>
      <span class="text-dim text-xs">{open ? "▾" : "▸"}</span>
    </button>

    {#if open}
      <div class="px-3 py-2 bg-pane-bg overflow-auto max-h-56">
        {#if requestHeaders != null && requestHeaders.length > 0}
          <div class="mb-3">
            <div class="mb-1">
              <SectionHeader color="dim">Request</SectionHeader>
            </div>
            <table class="w-full text-xs font-family-mono">
              <tbody>
                {#each requestHeaders as h, i (i)}
                  <tr
                    class="border-b border-border last:border-0 hover:bg-hl-bg"
                  >
                    <td
                      class="py-0.5 pr-4 text-accent whitespace-nowrap align-top w-48"
                    >
                      {h.name}
                    </td>
                    <td class="py-0.5 text-ink break-all">{h.value}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        {#if responseHeaders != null && responseHeaders.length > 0}
          <div>
            <div class="mb-1">
              <SectionHeader color="dim">Response</SectionHeader>
            </div>
            <table class="w-full text-xs font-family-mono">
              <tbody>
                {#each responseHeaders as h, i (i)}
                  <tr
                    class="border-b border-border last:border-0 hover:bg-hl-bg"
                  >
                    <td
                      class="py-0.5 pr-4 text-accent whitespace-nowrap align-top w-48"
                    >
                      {h.name}
                    </td>
                    <td class="py-0.5 text-ink break-all">{h.value}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
