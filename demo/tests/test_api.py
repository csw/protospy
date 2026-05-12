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

MOCK_SIMILAR_RESPONSE = {
    "hits": {
        "hits": [
            {
                "_id": "11",
                "_source": {
                    "title": "Star Wars",
                    "release_date": "1977-05-25",
                    "genres": ["Action"],
                    "vote_average": 8.2,
                },
            },
            {
                "_id": "1891",
                "_source": {
                    "title": "The Empire Strikes Back",
                    "release_date": "1980-05-17",
                    "genres": ["Action"],
                    "vote_average": 8.4,
                },
            },
        ]
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
    search_side_effect=None,
):
    mock_es = AsyncMock()
    if msearch_response is not None:
        mock_es.msearch.return_value = msearch_response
    if search_response is not None:
        mock_es.search.return_value = search_response
    if search_side_effect is not None:
        mock_es.search.side_effect = search_side_effect
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
        patch("elasticflix.main.AsyncElasticsearch", return_value=mock_es),
        patch("elasticflix.main.FastAPIInstrumentor"),
        patch("elasticflix.main.trace"),
    ):
        import elasticflix.main  # noqa: PLC0415

        with TestClient(elasticflix.main.app) as client:
            yield client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_health():
    mock_es = make_mock_es()
    for client in _make_client(mock_es):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_index_renders_home():
    mock_es = make_mock_es()
    for client in _make_client(mock_es):
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Movie Search" in response.text
        assert 'class="movie-card' not in response.text
        assert 'class="detail-panel' not in response.text


def test_search_renders_results_inline():
    mock_es = make_mock_es(msearch_response=MOCK_MSEARCH_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/search?q=heaven")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Movie Search" in response.text
        assert 'value="heaven"' in response.text
        assert "Days of Heaven" in response.text
        assert "Drama" in response.text


def test_search_pre_populates_q():
    mock_es = make_mock_es(msearch_response=MOCK_MSEARCH_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/search?q=terminator")
        assert response.status_code == 200
        assert 'value="terminator"' in response.text


def test_search_empty_q():
    mock_es = make_mock_es()
    for client in _make_client(mock_es):
        response = client.get("/search?q=")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Movie Search" in response.text
        assert 'class="movie-card' not in response.text


def test_movie_renders_detail():
    mock_es = make_mock_es(
        get_response=MOCK_GET_RESPONSE,
        search_response=MOCK_SIMILAR_RESPONSE,
    )
    for client in _make_client(mock_es):
        response = client.get("/movie/16642")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Days of Heaven" in response.text
        assert "More Like This" in response.text
        assert "Star Wars" in response.text


def test_movie_not_found():
    mock_es = make_mock_es(
        raise_not_found=True,
        search_response={"hits": {"hits": []}},
    )
    for client in _make_client(mock_es):
        response = client.get("/movie/missing")
        assert response.status_code == 404


def test_movie_with_q_renders_results_and_detail():
    mock_es = make_mock_es(
        msearch_response=MOCK_MSEARCH_RESPONSE,
        get_response=MOCK_GET_RESPONSE,
        search_response=MOCK_SIMILAR_RESPONSE,
    )
    for client in _make_client(mock_es):
        response = client.get("/movie/16642?q=heaven")
        assert response.status_code == 200
        assert 'value="heaven"' in response.text
        assert "movie-card" in response.text
        assert "detail-panel" in response.text
        assert "Days of Heaven" in response.text
        assert "More Like This" in response.text


def test_movie_similar_failure_is_silent():
    mock_es = make_mock_es(
        get_response=MOCK_GET_RESPONSE,
        search_side_effect=Exception("boom"),
    )
    for client in _make_client(mock_es):
        response = client.get("/movie/16642")
        assert response.status_code == 200
        assert "Days of Heaven" in response.text
        assert "More Like This" not in response.text


def test_suggest_returns_json():
    mock_es = make_mock_es(search_response=MOCK_SUGGEST_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/suggest?q=days")
        assert response.status_code == 200
        body = response.json()
        assert "suggestions" in body
        assert isinstance(body["suggestions"], list)
        assert "Days of Heaven" in body["suggestions"]


def test_suggest_htmx_returns_html():
    mock_es = make_mock_es(search_response=MOCK_SUGGEST_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/suggest?q=days", headers={"HX-Request": "true"})
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Days of Heaven" in response.text


def test_suggest_empty_q_skips_es():
    mock_es = make_mock_es()
    for client in _make_client(mock_es):
        response = client.get("/suggest?q=")
        assert response.status_code == 200
        assert response.json() == {"suggestions": []}
        mock_es.search.assert_not_called()


def test_stats_renders_html():
    mock_es = make_mock_es(search_response=MOCK_STATS_RESPONSE)
    for client in _make_client(mock_es):
        response = client.get("/stats")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Drama" in response.text
        assert "Top Genres" in response.text
