# CLAUDE.md — protospy demo site

## What this is

A static demo wrapper (one HTML file) that embeds Elasticflix and protospy in side-by-side iframes,
with a guided tour. No build step — all CSS, HTML, and JS are inline in `content/index.html`.

## Running

```bash
just run           # from demo/, serves on http://localhost:8080
just run port=N    # custom port
```

Or from the repo root: `just demo run`.

## File layout

```
demo/
  content/
    index.html   # everything: CSS + HTML + JS, all inline
  serve.py       # stateless static file server (avoids Python 3.12+ dir-FD caching)
  justfile       # run/format recipes
  README.md
  CLAUDE.md      # this file
```

## Local dev URL defaults

- protospy UI: `http://localhost:3100`
- Elasticflix: `http://localhost:5173`

Override with `?spy=<url>&app=<url>` query params.

## No dependencies

Served with `serve.py` (stdlib only). No npm, no uv, no build step.
