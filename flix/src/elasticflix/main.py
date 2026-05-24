import asyncio
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


async def _run_search(
    es: AsyncElasticsearch, q: str, size: int
) -> tuple[list[dict], list[dict]]:
    query = {
        "multi_match": {
            "query": q,
            "fields": ["title^2", "overview"],
        }
    }
    response = await es.msearch(
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
        {"_id": h["_id"], "_source": h["_source"]} for h in hits_resp["hits"]["hits"]
    ]
    genres = facets_resp.get("aggregations", {}).get("genres", {}).get("buckets", [])
    return hits, genres


@app.get("/search")
async def search(request: Request, q: str = "", size: int = 20):
    ctx: dict = {"q": q}
    if q:
        hits, genres = await _run_search(request.app.state.es, q, size)
        ctx["results"] = hits
        ctx["genres"] = genres
    return templates.TemplateResponse(request, "index.html", ctx)


async def _get_movie(es: AsyncElasticsearch, id: str):
    try:
        return await es.get(index=settings.elasticsearch_index, id=id)
    except NotFoundError:
        return None


async def _get_similar(es: AsyncElasticsearch, id: str) -> list[dict]:
    try:
        body = {
            "query": {
                "more_like_this": {
                    "fields": ["title", "overview", "tagline"],
                    "like": [{"_index": settings.elasticsearch_index, "_id": id}],
                    "min_term_freq": 1,
                    "min_doc_freq": 2,
                }
            },
            "_source": ["title", "release_date", "genres", "vote_average"],
            "size": 6,
        }
        response = await es.search(index=settings.elasticsearch_index, body=body)
        return [
            {"_id": h["_id"], "_source": h["_source"]} for h in response["hits"]["hits"]
        ]
    except Exception:  # noqa: BLE001
        return []


@app.get("/movie/{id}")
async def movie(request: Request, id: str, q: str = "", size: int = 20):
    es = request.app.state.es
    if q:
        movie_resp, similar, search_result = await asyncio.gather(
            _get_movie(es, id),
            _get_similar(es, id),
            _run_search(es, q, size),
        )
        hits, genres = search_result
    else:
        movie_resp, similar = await asyncio.gather(
            _get_movie(es, id),
            _get_similar(es, id),
        )
        hits, genres = [], []

    if movie_resp is None:
        raise HTTPException(status_code=404, detail="Movie not found")

    ctx: dict = {
        "q": q,
        "movie": movie_resp["_source"],
        "similar": similar,
        "current_movie_id": id,
    }
    if q:
        ctx["results"] = hits
        ctx["genres"] = genres
    return templates.TemplateResponse(request, "index.html", ctx)


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
    return templates.TemplateResponse(
        request,
        "stats.html",
        {"genres": genres, "vote_histogram": vote_histogram},
    )


if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port)
