# protospy demo site

A static wrapper page that embeds Elasticflix and protospy side-by-side in iframes, with a
guided tour explaining what you're seeing.

## Running locally

From the repo root:

```bash
just demo run            # serves on http://localhost:8080
just demo run port=1234  # custom port
```

From this directory:

```bash
just run
just run port=1234
```

## URL configuration

Default iframe URLs depend on where the page is served:

| Hostname          | protospy                        | Elasticflix                     |
|-------------------|---------------------------------|---------------------------------|
| `*.protospy.io`   | `https://spy.demo.protospy.io`  | `https://app.demo.protospy.io`  |
| anything else     | `http://localhost:3100`         | `http://localhost:5173`         |

Override with query params:

```
http://localhost:8080/?spy=http://localhost:3100&app=http://localhost:5173
```

## How it works

1. Both iframes load immediately. Elasticflix loads with `?demo=1` and shows a "connecting" overlay.
2. When the protospy UI's SSE connection opens, it emits a `proxy_connected` postMessage to its parent.
3. The demo page receives this, switches the status pill to green, and forwards `'proxy_connected'`
   to the Elasticflix iframe.
4. Elasticflix removes its overlay and fires an initial top-movies request through the proxy,
   generating traffic visible in the protospy inspector.

## Dependencies

None. Served with `serve.py`, a minimal stdlib-only static file server.
