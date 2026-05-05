from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from elasticsearch import AsyncElasticsearch, NotFoundError
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor


from elasticflix.config import settings

TEMPLATES_DIR = Path(__file__).parent / "templates"  # templates live inside the package
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def _init_telemetry(app: FastAPI):
    resource = Resource(attributes={"service.name": settings.service_name})
    provider = TracerProvider(resource=resource)

    if settings.otlp_endpoint:
        otlp_exporter = OTLPSpanExporter(
            endpoint=settings.otlp_endpoint.rstrip("/") + "/v1/traces"
        )
        provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

    if settings.debug:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)

    AioHttpClientInstrumentor().instrument()

    # N.B. the Elasticsearch client automatically uses the OpenTelemetry installation configured here


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    _init_telemetry(app)

    app.state.es = AsyncElasticsearch(settings.elasticsearch_url)

    yield

    # --- shutdown ---
    await app.state.es.close()


# needs to happen here, outside of lifespan, for some reason
app = FastAPI(title="elasticflix", lifespan=lifespan)

FastAPIInstrumentor().instrument_app(app)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/search")
async def search(request: Request, q: str = "", size: int = 20):
    if not q:
        hits: list[dict] = []
        genres: list[dict] = []
    else:
        query = {
            "multi_match": {
                "query": q,
                "fields": ["title^2", "overview"],
            }
        }
        response = await request.app.state.es.msearch(
            body=[
                {"index": settings.elasticsearch_index},
                {"query": query, "size": size},
                {"index": settings.elasticsearch_index},
                {
                    "query": query,
                    "size": 0,
                    "aggs": {"genres": {"terms": {"field": "genres", "size": 10}}},
                },
            ]
        )
        hits_resp, facets_resp = response["responses"]
        hits = [
            {"_id": h["_id"], "_source": h["_source"]}
            for h in hits_resp["hits"]["hits"]
        ]
        genres = (
            facets_resp.get("aggregations", {}).get("genres", {}).get("buckets", [])
        )

    if request.headers.get("HX-Request"):
        return templates.TemplateResponse(
            request, "search.html", {"results": hits, "query": q, "genres": genres}
        )
    return JSONResponse({"results": hits, "query": q, "genres": genres})


@app.get("/item/{id}")
async def item(request: Request, id: str):
    try:
        response = await request.app.state.es.get(
            index=settings.elasticsearch_index, id=id
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Movie not found")

    movie = response["_source"]

    if request.headers.get("HX-Request"):
        return templates.TemplateResponse(request, "item.html", {"movie": movie})
    return JSONResponse(movie)


@app.get("/suggest")
async def suggest(request: Request, q: str = ""):
    if not q:
        suggestions: list[str] = []
    else:
        body = {
            "query": {
                "match_bool_prefix": {
                    "title": {"query": q, "operator": "and"},
                }
            },
            "_source": ["title"],
            "size": 5,
        }
        response = await request.app.state.es.search(
            index=settings.elasticsearch_index, body=body
        )
        suggestions = [h["_source"]["title"] for h in response["hits"]["hits"]]

    if request.headers.get("HX-Request"):
        if not suggestions:
            return HTMLResponse("")
        items_html = "".join(f'<li role="option">{s}</li>' for s in suggestions)
        return HTMLResponse(f'<ul role="listbox">{items_html}</ul>')
    return JSONResponse({"suggestions": suggestions})


@app.get("/stats")
async def stats(request: Request):
    body = {
        "size": 0,
        "aggs": {
            "genres": {"terms": {"field": "genres", "size": 20}},
            "vote_histogram": {"histogram": {"field": "vote_average", "interval": 1}},
        },
    }
    response = await request.app.state.es.search(
        index=settings.elasticsearch_index, body=body
    )
    genres = response["aggregations"]["genres"]["buckets"]
    vote_histogram = response["aggregations"]["vote_histogram"]["buckets"]

    if request.headers.get("HX-Request"):
        return templates.TemplateResponse(
            request, "stats.html", {"genres": genres, "vote_histogram": vote_histogram}
        )
    return JSONResponse({"genres": genres, "vote_histogram": vote_histogram})


if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port)
