# CLAUDE.md — elasticflix demo

## Browser testing

To inspect network traffic during Chrome browser tests, use `read_network_requests` (the MCP tool) rather than injecting JavaScript event listeners. Clear the log with `clear: true` immediately before an action, then read it after to see exactly which requests fired and whether they were XHR or document loads.
