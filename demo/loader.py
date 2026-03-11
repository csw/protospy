#!/usr/bin/env python3
"""Load TMDB movie data into Elasticsearch."""

import csv
import gzip
import json
import os
import sys
from pathlib import Path

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

# --- config ---
ES_URL = os.environ.get("ELASTICSEARCH_URL", "http://localhost:9200")
try:
    from config import settings

    ES_URL = settings.elasticsearch_url
    INDEX = settings.elasticsearch_index
except ImportError:
    INDEX = os.environ.get("ELASTICSEARCH_INDEX", "movies")

DATA_DIR = Path(__file__).parent / "data"
MOVIES_CSV = DATA_DIR / "tmdb_5000_movies.csv.gz"
CREDITS_CSV = DATA_DIR / "tmdb_5000_credits.csv.gz"

MAPPINGS = {
    "mappings": {
        "properties": {
            "title": {
                "type": "text",
                "fields": {
                    "keyword": {"type": "keyword"},
                    "suggest": {"type": "completion"},
                },
            },
            "overview": {"type": "text"},
            "tagline": {"type": "text"},
            "release_date": {"type": "date"},
            "genres": {"type": "keyword"},
            "director": {"type": "keyword"},
            "cast": {"type": "keyword"},
            "vote_average": {"type": "float"},
            "vote_count": {"type": "integer"},
            "popularity": {"type": "float"},
            "budget": {"type": "long"},
            "revenue": {"type": "long"},
            "runtime": {"type": "float"},
        }
    }
}


def check_data_files():
    missing = [f for f in [MOVIES_CSV, CREDITS_CSV] if not f.exists()]
    if missing:
        print("Missing data files. Download from Kaggle:")
        print()
        print("  https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata")
        print()
        print("Place these files in demo/data/:")
        print("  - tmdb_5000_movies.csv.gz")
        print("  - tmdb_5000_credits.csv.gz")
        print()
        print("Then re-run: uv run python loader.py")
        sys.exit(1)


def parse_json_field(value, default=None):
    """Safely parse a JSON string field."""
    try:
        return json.loads(value) if value else default
    except json.JSONDecodeError, TypeError:
        return default


def load_directors():
    """Return dict of movie_id -> director name."""
    directors = {}
    with gzip.open(CREDITS_CSV, "rt", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            crew = parse_json_field(row.get("crew"), [])
            for member in crew:
                if member.get("job") == "Director":
                    directors[row["movie_id"]] = member["name"]
                    break
    return directors


def generate_docs(directors):
    """Yield ES action dicts for bulk indexing."""
    with gzip.open(MOVIES_CSV, "rt", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            movie_id = row.get("id", "")
            genres_raw = parse_json_field(row.get("genres"), [])
            genres = [g["name"] for g in genres_raw if "name" in g]

            doc = {
                "title": row.get("title") or None,
                "overview": row.get("overview") or None,
                "tagline": row.get("tagline") or None,
                "release_date": row.get("release_date") or None,
                "genres": genres or None,
                "director": directors.get(movie_id),
                "vote_average": float(row["vote_average"])
                if row.get("vote_average")
                else None,
                "vote_count": int(row["vote_count"]) if row.get("vote_count") else None,
                "popularity": float(row["popularity"])
                if row.get("popularity")
                else None,
                "budget": int(row["budget"]) if row.get("budget") else None,
                "revenue": int(row["revenue"]) if row.get("revenue") else None,
                "runtime": float(row["runtime"]) if row.get("runtime") else None,
            }
            # Remove None values
            doc = {k: v for k, v in doc.items() if v is not None}

            yield {"_index": INDEX, "_id": movie_id, "_source": doc}


def main():
    check_data_files()

    es = Elasticsearch(ES_URL)

    # Delete and recreate index
    if es.indices.exists(index=INDEX):
        print(f"Deleting existing index '{INDEX}'...")
        es.indices.delete(index=INDEX)

    print(f"Creating index '{INDEX}'...")
    es.indices.create(index=INDEX, body=MAPPINGS)

    # Load directors
    print("Loading credits...")
    directors = load_directors()
    print(f"  Found {len(directors)} directors")

    # Bulk index
    print("Indexing movies...")
    total = 0

    def doc_iterator():
        nonlocal total
        for doc in generate_docs(directors):
            total += 1
            if total % 500 == 0:
                print(f"  Indexed {total} documents...")
            yield doc

    success, failed = bulk(es, doc_iterator())
    print(f"Done! Indexed {success} movies ({failed} failed).")


if __name__ == "__main__":
    main()
