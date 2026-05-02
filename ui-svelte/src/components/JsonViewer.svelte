<script module lang="ts">
  interface Span {
    cls: string;
    text: string;
  }

  export type Token = Span | string;

  export function tokenizeLine(line: string): Token[] {
    const tokens: Token[] = [];
    let rest = line;

    while (rest.length > 0) {
      const wsMatch = /^(\s+)/.exec(rest);
      if (wsMatch) {
        tokens.push(wsMatch[1]);
        rest = rest.slice(wsMatch[1].length);
        continue;
      }

      const keyMatch = /^("(?:[^"\\]|\\.)*"\s*:)/.exec(rest);
      if (keyMatch) {
        const full = keyMatch[1];
        const colonIdx = full.lastIndexOf(":");
        tokens.push({ cls: "text-j-key", text: full.slice(0, colonIdx) });
        tokens.push({ cls: "text-j-punct", text: ":" });
        rest = rest.slice(full.length);
        continue;
      }

      const strMatch = /^("(?:[^"\\]|\\.)*")/.exec(rest);
      if (strMatch) {
        tokens.push({ cls: "text-j-str", text: strMatch[1] });
        rest = rest.slice(strMatch[1].length);
        continue;
      }

      const numMatch = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
      if (numMatch) {
        tokens.push({ cls: "text-j-num", text: numMatch[1] });
        rest = rest.slice(numMatch[1].length);
        continue;
      }

      const boolMatch = /^(true|false|null)/.exec(rest);
      if (boolMatch) {
        tokens.push({ cls: "text-j-bool", text: boolMatch[1] });
        rest = rest.slice(boolMatch[1].length);
        continue;
      }

      const punctMatch = /^([{}[\],])/.exec(rest);
      if (punctMatch) {
        tokens.push({ cls: "text-j-punct", text: punctMatch[1] });
        rest = rest.slice(punctMatch[1].length);
        continue;
      }

      tokens.push(rest[0]);
      rest = rest.slice(1);
    }

    return tokens;
  }
</script>

<script lang="ts">
  interface Props {
    text: string;
  }

  const { text }: Props = $props();

  const lines = $derived(text.split("\n"));
</script>

<div
  class="font-family-mono text-xs leading-5 overflow-auto w-full h-full"
  aria-label="JSON viewer"
>
  {#each lines as line, i (i)}
    {@const lineNum = i + 1}
    {@const tokens = tokenizeLine(line)}
    <div class="flex hover:bg-hl-bg">
      <span class="select-none w-10 shrink-0 text-right pr-3 text-j-ln">
        {lineNum}
      </span>
      <span class="flex-1 whitespace-pre">
        {#each tokens as tok, ti (ti)}
          {#if typeof tok === "string"}
            {tok}
          {:else}
            <span class={tok.cls}>{tok.text}</span>
          {/if}
        {/each}
      </span>
    </div>
  {/each}
</div>
