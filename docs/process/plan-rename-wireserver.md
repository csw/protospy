# Plan: Rename BadServer to WireServer

> **For agentic workers:** This is a mechanical rename. Use Haiku subagents
> for the file-level changes — each step is independent and can run in
> parallel. Steps use checkbox syntax for tracking.

**Goal:** Rename `BadServer` to `WireServer` throughout the codebase to
reflect its expanded role: not just a server that deliberately misbehaves,
but a protocol-transparent h11-based server that gives full wire-level
visibility into request/response handling. It serves both roles —
well-behaved echo handler for observability, and programmable misbehavior
handlers for error testing.

**Context:** The conformance suite has two target servers:

- **GoodServer** (aiohttp): well-behaved, used for happy-path tests. Opaque
  at the protocol level — aiohttp handles HTTP parsing internally.
- **BadServer** (h11/raw sockets): programmable, used for upstream
  misbehavior tests. Full protocol visibility because we control every byte.

The "bad" name reflects only one of its uses. As the suite grows, the h11
server will also serve as a protocol-transparent target for tests where we
need to observe exactly what the proxy sends (protocol-error tests, body
framing tests, etc.). "WireServer" better describes this dual purpose.

---

## Scope of changes

### Source file

- `conformance/src/proxy_conformance/bad_server.py`
  → `conformance/src/proxy_conformance/wire_server.py`

### Class and references

| Old | New |
|-----|-----|
| `BadServer` | `WireServer` |
| `bad_server` (fixture name) | `wire_server` |
| `bad-server` (CLI entry point) | `wire-server` |
| `_check_bad_server` (autouse fixture) | `_check_wire_server` |
| `--bad-target-port` (CLI option) | `--wire-target-port` |
| `bad_url` / `bad_host` / `bad_port` (ProxyUrls fields) | `wire_url` / `wire_host` / `wire_port` |
| `bad_upstream` (Caddyfile/HAProxy config variable) | `wire_upstream` |
| `bad_proxy_port` (parameter name) | `wire_proxy_port` |

### Test file

- `conformance/tests/test_bad_server.py`
  → `conformance/tests/test_wire_server.py`

### Documentation strings and comments

Update docstrings, module docstrings, and comments to say "WireServer"
instead of "BadServer" / "bad server". Preserve the explanation that
WireServer is h11-based and programmable.

---

## Steps

### Step 1: Rename source file

- [ ] `git mv conformance/src/proxy_conformance/bad_server.py conformance/src/proxy_conformance/wire_server.py`
- [ ] Update module docstring: "WireServer: a programmable h11 target server..."
- [ ] Rename class `BadServer` → `WireServer`
- [ ] Update all internal references: error messages, log labels
  (`label="bad-server"` → `label="wire-server"`), docstring examples
- [ ] Update CLI `main()` print statements

### Step 2: Rename test file

- [ ] `git mv conformance/tests/test_bad_server.py conformance/tests/test_wire_server.py`
- [ ] Update module docstring and standalone debugging instructions
  (`uv run bad-server` → `uv run wire-server`)
- [ ] Update imports

### Step 3: Update pyproject.toml

- [ ] Change CLI entry point: `bad-server = ...` → `wire-server = "proxy_conformance.wire_server:_cli"`

### Step 4: Update conftest.py

- [ ] Update imports: `from proxy_conformance.bad_server import` →
      `from proxy_conformance.wire_server import`
- [ ] Rename `BadServer` → `WireServer` in type annotations
- [ ] Rename fixture `bad_server` → `wire_server`
- [ ] Rename fixture `_check_bad_server` → `_check_wire_server`
- [ ] Rename CLI option `--bad-target-port` → `--wire-target-port`
  and update help text
- [ ] Rename `ProxyUrls` fields: `bad_url` → `wire_url`,
  `bad_host` → `wire_host`, `bad_port` → `wire_port`
- [ ] Update variable names in `proxy` fixture: `bad_upstream` →
  `wire_upstream`, `bad_proxy_port` → `wire_proxy_port`, etc.
- [ ] Update `_start_caddy` and `_start_haproxy` parameter names and
  config template variable names

### Step 5: Update all test files that reference the old names

- [ ] `test_wire_server.py` (formerly test_bad_server.py): update fixture
  references (`proxy.bad_url` → `proxy.wire_url`, etc.)
- [ ] `test_chunked_errors.py`: no changes expected (uses good_server, not
  bad_server)
- [ ] `test_basic_proxy.py`: no changes expected
- [ ] `test_good_server.py`: no changes expected
- [ ] `test_assertions.py`: no changes expected

### Step 6: Update documentation

- [ ] `docs/process/conformance-design-notes.md`: update references to
  BadServer. Note: the design notes define the naming convention — update
  the "Target server naming" section to describe WireServer
- [ ] Any other docs in `docs/process/` that mention BadServer
- [ ] `conformance/src/proxy_conformance/request_logging.py`: update the
  module docstring if it mentions "bad server"

### Step 7: Verify

- [ ] `uv run ruff check .` clean
- [ ] `uv run ruff format --check .` clean
- [ ] `uv run pyright .` clean
- [ ] `uv run pytest` passes for `--proxy caddy`
- [ ] `uv run pytest` passes for `--proxy haproxy`
- [ ] `uv run wire-server -p 8515 --log` starts and responds to requests
- [ ] No remaining references to `bad_server`, `BadServer`, or `bad-server`
  in the conformance directory (check with grep)
