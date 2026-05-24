# Debugging CI failures

Reference for investigating failed `flix-ci` GitHub Actions runs.

## Finding runs

```bash
gh run list --workflow=flix-ci.yml --limit=5
gh run view <run-id> --log-failed          # failed steps only (fastest)
gh run view <run-id> --log 2>&1 | grep "^test\t"  # filter to test job lines
```

## Jobs

| Job | What it does |
|---|---|
| `lint` | ruff format check + ruff lint (with GitHub PR annotations) |
| `typecheck` | pyright |
| `test` | unit tests, then Elasticsearch + Playwright e2e tests |
| `docker-build` | builds the flix Dockerfile, no push |

## Artifacts

| Name | Contents | Uploaded |
|---|---|---|
| `test-results` | `unit-results.xml`, `e2e-results.xml` (JUnit) | Always |
| `playwright-results` | screenshots, videos, traces | On failure only |

```bash
gh run download <run-id> -n test-results
gh run download <run-id> -n playwright-results
```

## Test job order

1. Unit tests (`pytest -v -m "not e2e"`) — no Elasticsearch needed
2. Elasticsearch starts via `hoverkraft-tech/compose-action` with `--wait` (relies on `healthcheck` in `docker-compose.yaml`)
3. Playwright browsers installed
4. Data loaded via `loader.py` (`ELASTICSEARCH_URL=http://localhost:9200`)
5. E2e tests (`pytest -m e2e`)
6. `dorny/test-reporter@v2` renders both JUnit XMLs as a single Actions Summary

## Common failure modes

**`dorny/test-reporter` → `Resource not accessible by integration`**
The job needs `permissions: checks: write`.

**Elasticsearch not ready when e2e tests start**
The `compose-action --wait` flag relies on the `healthcheck` defined in `docker-compose.yaml`. If the healthcheck is missing or wrong, the job proceeds before ES is up.

**test-reporter fails with no test results found**
Default `fail-on-empty: true` means if an earlier step failed before producing the XML, the reporter step also fails. Check the step that runs pytest — it likely failed first.
