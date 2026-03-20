# Investigation: Caddy Pool-State-Dependent Behavior for Incomplete Chunked Requests

> **For agentic workers:** This is an investigation, not an implementation plan. The goal is to produce a clear written finding explaining *why* Caddy returns different status codes (200 vs 502) for the same malformed request depending on upstream connection pool state. Use subagents (Haiku where suitable) for independent research tasks. Commit findings to this file or a new file in `docs/process/`.

**Context:** See `docs/process/bug-caddy-state-pollution.md` for the full bug description.

**Summary:** When a client sends a chunked POST with no terminating zero-length chunk through Caddy, Caddy returns 200 if its upstream connection pool is cold (no prior requests to that upstream) and 502 if the pool is warm (prior requests established keep-alive connections). We need to determine *where* the behavioral difference originates — is it Caddy's handling that differs, or does aiohttp (the upstream) respond differently on a reused connection?

## Questions to answer

1. **What is actually on the wire between Caddy and aiohttp in each case?** Does Caddy send the same bytes to aiohttp regardless of pool state? Does aiohttp send the same response bytes back?

2. **Does aiohttp itself behave differently on a keep-alive connection vs a fresh connection?** If you send a well-formed request followed by an incomplete chunked request on the *same* TCP connection (no proxy), does aiohttp respond differently than if the incomplete chunked request arrives on a fresh connection?

3. **Where does the 502 originate?** Is Caddy generating it because the upstream connection failed, or because Caddy's own chunked-body handling detected the violation?

## Approach

### Step 1: Packet capture — Caddy to aiohttp, cold pool

Start GoodServer standalone. Start Caddy with `keepalive` on (the default), forwarding to GoodServer. Run a tcpdump/tshark capture on the loopback interface filtering for traffic to GoodServer's port. Send one incomplete chunked request (cold pool). Save the capture.

```bash
# Terminal 1: start GoodServer
cd conformance && uv run good-server -p 9100 --log

# Terminal 2: start Caddy (use a minimal Caddyfile)
# Caddyfile:
#   { admin off }
#   :9200 { reverse_proxy localhost:9100 }
caddy run --config /path/to/Caddyfile --adapter caddyfile

# Terminal 3: capture traffic between Caddy and GoodServer
sudo tcpdump -i lo0 -w /tmp/caddy-cold.pcap port 9100

# Terminal 4: send the incomplete chunked request to Caddy
cd conformance && uv run python -c "
from proxy_conformance.h11_client import send_incomplete_chunked_request
result = send_incomplete_chunked_request('127.0.0.1', 9200, '/echo/cold-test')
print(f'Status: {result.status if result else None}')
"
```

Stop the capture. Note the response status.

### Step 2: Packet capture — Caddy to aiohttp, warm pool

Same setup, but send a normal GET through the proxy first to warm the pool, *then* send the incomplete chunked request. Use a *separate* capture file.

```bash
# Warm the pool with a normal request
curl -s http://127.0.0.1:9200/echo/warmup > /dev/null

# Then send the incomplete chunked request (same as step 1)
cd conformance && uv run python -c "
from proxy_conformance.h11_client import send_incomplete_chunked_request
result = send_incomplete_chunked_request('127.0.0.1', 9200, '/echo/warm-test')
print(f'Status: {result.status if result else None}')
"
```

### Step 3: Compare the captures

Open both pcap files in Wireshark or use tshark to dump the HTTP streams. Answer:

- Did Caddy open a new TCP connection to aiohttp in both cases, or reuse one in the warm case?
- Are the bytes Caddy sent to aiohttp identical in both cases (request line, headers, chunk data)?
- What did aiohttp send back in each case? Same response, or different?
- In the warm case, did the TCP connection show any errors (RST, FIN at unexpected points)?
- Did Caddy read aiohttp's full response before returning 502, or did it abort?

This step is the core of the investigation. The captures will show definitively whether the behavioral difference is in Caddy's upstream request, aiohttp's response, or Caddy's interpretation of the response.

### Step 4: Direct aiohttp test — keep-alive connection reuse

Bypass Caddy entirely. Use the h11 client (or raw sockets) to send two requests to aiohttp on the same TCP connection:

1. A well-formed GET (to establish keep-alive)
2. An incomplete chunked POST (missing final chunk)

Compare aiohttp's response to request 2 against the response when the incomplete chunked POST is sent on a fresh connection (which `TestH11ClientIntegration.test_direct_to_good_server` already does).

This isolates aiohttp's behavior from Caddy's. If aiohttp responds differently on the reused connection, aiohttp is at least partly responsible for the 502.

Write this as a small standalone script (not a pytest test) so it can be run ad hoc. Place it in `conformance/scripts/` or similar. Use Haiku subagents for writing the script — it's straightforward socket work.

```python
# Pseudocode for the direct aiohttp test:
#
# 1. Fresh connection: open socket → send incomplete chunked POST → read response
# 2. Reused connection: open socket → send GET → read response → send incomplete chunked POST → read response
# 3. Compare responses from the incomplete chunked POST in both cases
```

### Step 5: Write up findings

Document:

- The raw observations (status codes, wire-level differences)
- Which component (Caddy, aiohttp, or both) is responsible for the behavioral difference
- Whether `keepalive off` in Caddy's transport config would eliminate the inconsistency (and whether that's appropriate for the conformance suite)
- Implications for the conformance suite design (see the ongoing discussion in the conformance-design-notes about fixture scoping and pool state)

Update `docs/process/bug-caddy-state-pollution.md` with a link to the findings.

## Notes for the implementer

- The GoodServer is already runnable standalone: `cd conformance && uv run good-server -p 9100 --log`
- The h11 client helper is at `conformance/src/proxy_conformance/h11_client.py` — `send_incomplete_chunked_request()` does exactly what you need for the malformed request
- On macOS, the loopback interface is `lo0` (not `lo`). You'll need `sudo` for tcpdump
- If tcpdump is too noisy, filter with `tcpdump -i lo0 port 9100 -X` for hex+ASCII dump, or use `tshark -i lo0 -f "port 9100" -O http` for parsed HTTP
- The Caddyfile for this investigation should be minimal — just `admin off` and one `reverse_proxy` directive, no `keepalive off` (we want to observe the default pooling behavior)
- `CapturedRequest` in GoodServer records what aiohttp received but not what aiohttp *responded*. The packet capture fills this gap.
