# Conformance test PoC review by Clayton

## Implementation requirements
- Need to be able to run tests against separately-running proxy for debugging, e.g. with a debugger attached: need fixed target server port
  - consider for h11 target server: would either need a second upstream definition for the proxy or multiple port pair support? or reuse target port in sequence?
  - what about debugging the h11 target server itself?

## Change for real implementation
- Use more structured logging vs `print("  [info] ..."); don't format messages ad hoc
- Probably use something better than text in print statements to distinguish between abnormal findings and informational messages

## Notes on what's in scope for the full suite
- Do we actually need Caddy access log capture? I think observing the client and target sides may suffice.
- Probably don't need a _full_ set of HTTP test cases, just enough to cover relevant functionality for the proxy server, plus basic smoke tests. Things like content negotiation are probably irrelevant.
- May not need curl for things like `--expect100-timeout` if we have a low-level h11 client and can satisfy ourselves that we're implementing it correctly.

## Ideas
- pass qualified test name in additional path info, to facilitate investigation if we see something weird at the proxy?
- Can we enable parallelism? It complicates correlation of target server request records with test cases; pass correlation ID in path info or something? The tests are reasonably fast now, may be unnecessary.

## Minor points

- `rfc_ref` should be `spec_ref` or similar for non-RFC items like X-Forwarded-For
- proxy URL fixture could be pre-parsed
- use Caddy JSON config?
- stop servers (echo server and Caddy) in try/finally

## Thoughts
- probably don't have to worry about OPTIONS/HEAD/etc. having bodies or not, just propagate?
