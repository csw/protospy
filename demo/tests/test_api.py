from unittest.mock import AsyncMock, patch

from elastic_transport import ApiResponseMeta, HttpHeaders, NodeConfig
from elasticsearch import NotFoundError
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Mock ES response shapes
# ---------------------------------------------------------------------------

MOCK_MSEARCH_RESPONSE = {
    "responses": [
        {
            "hits": {
                "hits": [
                    {
                        "_id": "16642",
                        "_source": {
                            "title": "Days of Heaven",
                            "overview": "A farmhand, his lover, and his sister travel to the Texas Panhandle, where he schemes to inherit a dying farmer's land.",
                            "vote_average": 7.9,
                            "genres": ["Drama"],
                            "director": "Terrence Malick",
                            "release_date": "1978-09-13",
                        },
                    }
                ]
            }
        },
        {"aggregations": {"genres": {"buckets": [{"key": "Drama", "doc_count": 1}]}}},
    ]
}

MOCK_GET_RESPONSE = {
    "_id": "16642",
    "_source": {
        "title": "Days of Heaven",
        "overview": "A farmhand, his lover, and his sister travel to the Texas Panhandle, where he schemes to inherit a dying farmer's land.",
        "vote_average": 7.9,
    },
}

MOCK_SUGGEST_RESPONSE = {
    "hits": {
        "hits": [
            {"_id": "16642", "_source": {"title": "Days of Heaven"}},
            {"_id": "2119", "_source": {"title": "Days of Thunder"}},
        ]
    }
}

MOCK_STATS_RESPONSE = {
    "aggregations": {
        "genres": {"buckets": [{"key": "Drama", "doc_count": 100}]},
        "vote_histogram": {"buckets": [{"key": 8.0, "doc_count": 50}]},
    }
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _not_found_error():
    meta = ApiResponseMeta(
        status=404,
        http_version="1.1",
        headers=HttpHeaders(),
        duration=0.1,
        node=NodeConfig(scheme="http", host="localhost", port=9200),
    )
    return NotFoundError(message="not found", meta=meta, body={"found": False})


def make_mock_es(
    search_response=None,
    msearch_response=None,
    get_response=None,
    raise_not_found=False,
):
    mock_es = AsyncMock()
    if msearch_response is not None:
        mock_es.msearch.return_value = msearch_response
    if search_response is not None:
        mock_es.search.return_value = search_response
    if raise_not_found:
        mock_es.get.side_effect = _not_found_error()
    elif get_response is not None:
        mock_es.get.return_value = get_response
    mock_es.close = AsyncMock()
    return mock_es


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


def _make_client(mock_es):
    with (
        patch("main.AsyncElasticsearch", return_value=mock_es),
        patch("main.FastAPIInstrumentor"),
        patch("main.trace"),
    ):
        import main  # noqa: PLC0415

        with TestClient(main.app) as client:
            yield client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_search_returns_json():
    mock_es = make_mock_es(msearch_response=MOCK_MSEARCH_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/search?q=heaven")
        assert response.status_code == 200
        body = response.json()
        assert "results" in body
        assert "query" in body
        assert "genres" in body
        assert body["query"] == "heaven"
        assert len(body["results"]) == 1
        assert body["genres"][0]["key"] == "Drama"


def test_search_htmx_returns_html():
    mock_es = make_mock_es(msearch_response=MOCK_MSEARCH_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/search?q=heaven", headers={"HX-Request": "true"})
        assert response.status_code == 200
        assert "Days of Heaven" in response.text
        assert "Drama" in response.text


def test_search_empty_q():
    mock_es = make_mock_es()
    for client in _make_client(mock_es):
        response = client.get("/search?q=")
        assert response.status_code == 200
        body = response.json()
        assert body["results"] == []


def test_item_found():
    mock_es = make_mock_es(get_response=MOCK_GET_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/item/16642")
        assert response.status_code == 200
        body = response.json()
        assert "title" in body
        assert body["title"] == "Days of Heaven"


def test_item_not_found():
    mock_es = make_mock_es(raise_not_found=True)
    for client in _make_client(mock_es):
        response = client.get("/item/missing")
        assert response.status_code == 404


def test_suggest_returns_json():
    mock_es = make_mock_es(search_response=MOCK_SUGGEST_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/suggest?q=days")
        assert response.status_code == 200
        body = response.json()
        assert "suggestions" in body
        assert isinstance(body["suggestions"], list)
        assert "Days of Heaven" in body["suggestions"]


def test_suggest_empty_q_skips_es():
    mock_es = make_mock_es()
    for client in _make_client(mock_es):
        response = client.get("/suggest?q=")
        assert response.status_code == 200
        assert response.json() == {"suggestions": []}
        mock_es.search.assert_not_called()


def test_stats_returns_json():
    mock_es = make_mock_es(search_response=MOCK_STATS_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/stats")
        assert response.status_code == 200
        body = response.json()
        assert "genres" in body
        assert "vote_histogram" in body
