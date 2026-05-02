<script lang="ts">
  import { store, applyEvent, setConnection, setService } from "@ui/state/store.svelte";
  import type { Exchange } from "@ui/state/store.svelte";
  import { fetchInfo } from "@ui/api/info";
  import { subscribeToEvents } from "@ui/api/sse";
  import TopBar from "./TopBar.svelte";
  import ExchangeList from "./ExchangeList.svelte";
  import Inspector from "./Inspector.svelte";
  import StatusBar from "./StatusBar.svelte";

  let selectedId = $state<number | null>(null);

  $effect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    fetchInfo()
      .then((info) => {
        if (cancelled) return;
        const svc = info.services[0];
        if (svc == null) return;

        setService(svc.name);

        cleanup = subscribeToEvents(
          svc.name,
          (msg) => applyEvent(msg),
          (status) => setConnection(status),
        );
      })
      .catch(() => {
        // /info failed — stay in "connecting" state, will retry on page refresh
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  });

  const exchangeList = $derived(
    store.ids
      .map((id) => store.exchanges.get(id))
      .filter((ex): ex is Exchange => ex != null),
  );

  const effectiveId = $derived(selectedId ?? store.ids[0] ?? null);
  const selectedExchange = $derived(
    effectiveId != null ? (store.exchanges.get(effectiveId) ?? null) : null,
  );
</script>

<div class="flex flex-col h-dvh overflow-hidden bg-bg">
  <TopBar service={store.service} />
  <div class="flex flex-1 overflow-hidden">
    <div class="w-[260px] shrink-0 overflow-hidden">
      <ExchangeList
        exchanges={exchangeList}
        selectedId={effectiveId}
        onSelect={(id) => {
          selectedId = id;
        }}
      />
    </div>
    <Inspector exchange={selectedExchange} />
  </div>
  <StatusBar
    connection={store.connection}
    service={store.service}
    exchangeCount={store.ids.length}
  />
</div>
