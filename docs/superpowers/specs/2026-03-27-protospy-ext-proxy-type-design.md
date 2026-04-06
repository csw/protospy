# protospy-ext proxy type — design spec

**Date:** 2026-03-27

## Context

The conformance test suite can already run against a protospy instance it spawns itself
(`--proxy protospy`).  During active protospy development it is useful to point the tests
at an *already-running* protospy process whose binary, configuration, and logging can be
controlled by the developer outside the test harness.

This requires:
1. The target servers (GoodServer, WireServer) to start on *fixed* ports so the developer
   can pre-configure protospy to forward to them.
2. The test suite to connect to protospy's *known* frontend ports rather than allocating
   ephemeral ones.
3. This mode to be opt-in and never activated automatically via `--proxy all`.

## Design

### New proxy type: `protospy-ext`

A new proxy type string `"protospy-ext"` is added.  It represents an external,
pre-running protospy instance.  Unlike `caddy`, `haproxy`, and `protospy`, it is **never
spawned** by the test suite and **must not appear** in the `--proxy all` expansion.

### List split in `proxies.py`

The single `ALL_PROXIES` list is replaced by two:

```python
# Proxies the test suite can start automatically.
# --proxy all expands to this list.
MANAGED_PROXIES: list[str] = ["caddy", "haproxy", "protospy"]

# All valid proxy type strings, including external ones that must be
# selected explicitly and cannot be auto-started.
ALL_PROXIES: list[str] = [*MANAGED_PROXIES, "protospy-ext"]
```

`start_proxy()` validates against `MANAGED_PROXIES` (it has no code path for
`protospy-ext`).  `_get_proxy_list()` expands `"all"` to `MANAGED_PROXIES`.  The `proxy`
fixture validates the incoming `proxy_type` against `ALL_PROXIES`.

### New CLI options in `conftest.py`

Four options added to `pytest_addoption()`:

| Option | Type | Default | Description |
|---|---|---|---|
| `--protospy-ext-host` | `str` | `"127.0.0.1"` | Host where pre-running protospy listens |
| `--protospy-ext-good-port` | `int` | `7400` | Protospy frontend port for the good channel |
| `--protospy-ext-wire-port` | `int` | `7401` | Protospy frontend port for the wire channel |
| `--protospy-ext-dead-port` | `int` | `7402` | Protospy frontend port for the dead channel |

All three port options have defaults, so `--proxy protospy-ext` requires no additional
flags for ordinary usage.

The existing `--good-target-port` and `--wire-target-port` options get new defaults of
`7300` and `7301` respectively (previously `None`, which caused random allocation).  This
means `--proxy protospy-ext` works out of the box: the test suite starts GoodServer on
7300 and WireServer on 7301, matching the conventional protospy configuration shown in the
workflow below.  The fixed defaults also benefit other proxy types (caddy, haproxy,
protospy) by making target server ports predictable across runs.

### `proxy` fixture logic

```
proxy_type == "protospy-ext"?
  └─ yes → read --protospy-ext-* options (all have defaults)
            yield ProxyUrls(...) and return (no subprocess)
  └─ no  → existing path: start_proxy(proxy_type, ...)
```

`ProxyUrls` is constructed as:

```python
ProxyUrls(
    good_url=f"http://{host}:{good_port}",
    wire_url=f"http://{host}:{wire_port}",
    good_host=host, good_port=good_port,
    wire_host=host, wire_port=wire_port,
    dead_url=f"http://{host}:{dead_port}",
    dead_host=host, dead_port=dead_port,
)
```

grpc and h2c are left at their zero-value defaults (not yet supported by protospy).

### Validation change in `conftest.py` `_get_proxy_list()`

```python
def _get_proxy_list(config: pytest.Config) -> list[str]:
    raw = str(config.getoption("--proxy"))
    if raw == "all":
        return list(MANAGED_PROXIES)          # protospy-ext excluded
    return [p.strip() for p in raw.split(",") if p.strip()]
```

The `from .proxies import` line is updated to also import `MANAGED_PROXIES`.

### Files changed

| File | Change |
|---|---|
| `conformance/tests/proxies.py` | Add `MANAGED_PROXIES`, keep `ALL_PROXIES = [*MANAGED_PROXIES, "protospy-ext"]`, update `start_proxy()` validation |
| `conformance/tests/conftest.py` | Add four `addoption` calls; change `--good-target-port` default to `7300` and `--wire-target-port` default to `7301`; add `protospy-ext` branch in `proxy` fixture; update `_get_proxy_list()`; simplify `GoodServer()`/`WireServer()` construction now that port is never `None` |

No other files need changes.

## Typical developer workflow

Default ports (no overrides needed for ordinary use):

| Channel | Target server port | Protospy frontend port |
|---|---|---|
| good | 7300 | 7400 |
| wire | 7301 | 7401 |
| dead | *(not managed by test suite)* | 7402 |

```bash
# Terminal 1 — start protospy with the conventional default ports
cargo run -- \
  --proxy=name=good,port=7400,target=127.0.0.1:7300 \
  --proxy=name=wire,port=7401,target=127.0.0.1:7301 \
  --proxy=name=dead,port=7402,target=127.0.0.1:7399

# Terminal 2 — run conformance tests (no extra flags needed)
cd conformance
uv run pytest --proxy protospy-ext
```

Override any port if the defaults are occupied:

```bash
uv run pytest --proxy protospy-ext \
  --good-target-port 8300 \
  --wire-target-port 8301 \
  --protospy-ext-good-port 8400 \
  --protospy-ext-wire-port 8401 \
  --protospy-ext-dead-port 8402
```

## Verification

1. Start protospy with default ports (`good=7400→7300`, `wire=7401→7301`, `dead=7402→anything`), then run `uv run pytest --proxy protospy-ext -q` — tests run without the harness spawning any proxy subprocess.
2. `uv run pytest --proxy all -q` — `protospy-ext` must NOT appear in the collected tests.
3. `uv run ruff check . && uv run ruff format . && uv run pyright .` — all clean.
