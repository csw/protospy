#!/usr/bin/env python3
"""Bulk-archive Done/Canceled Linear issues to free up free-tier slots.

Usage:
    python scripts/linear-archive-done.py [--min-age-days N] [--dry-run]

Requires LINEAR_API_KEY in the environment.

By default, archives issues completed or canceled more than 14 days ago.
Use --dry-run to see what would be archived without making changes.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

API_URL = "https://api.linear.app/graphql"


def graphql(query: str, variables: dict | None = None) -> dict:
    key = os.environ.get("LINEAR_API_KEY")
    if not key:
        print("ERROR: LINEAR_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = Request(
        API_URL,
        data=body,
        headers={
            "Authorization": key,
            "Content-Type": "application/json",
        },
    )
    with urlopen(req) as resp:
        result = json.loads(resp.read())

    if "errors" in result:
        print(f"GraphQL errors: {json.dumps(result['errors'], indent=2)}", file=sys.stderr)
        sys.exit(1)

    return result["data"]


ISSUES_QUERY = """
query ArchivedCandidates($cursor: String) {
  issues(
    filter: {
      state: { type: { in: ["completed", "cancelled"] } }
    }
    first: 100
    after: $cursor
    orderBy: updatedAt
  ) {
    nodes {
      id
      identifier
      title
      state { name type }
      completedAt
      canceledAt
      archivedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""

ARCHIVE_MUTATION = """
mutation ArchiveIssue($id: String!) {
  issueArchive(id: $id) {
    success
  }
}
"""


def fetch_candidates() -> list[dict]:
    """Fetch all completed/canceled, non-archived issues."""
    all_issues = []
    cursor = None

    while True:
        data = graphql(ISSUES_QUERY, {"cursor": cursor})
        issues = data["issues"]

        for node in issues["nodes"]:
            if node["archivedAt"] is None:
                all_issues.append(node)

        if not issues["pageInfo"]["hasNextPage"]:
            break
        cursor = issues["pageInfo"]["endCursor"]

    return all_issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--min-age-days",
        type=int,
        default=14,
        help="Only archive issues completed/canceled more than N days ago (default: 14)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be archived without making changes",
    )
    args = parser.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.min_age_days)

    print(f"Fetching completed/canceled issues...")
    candidates = fetch_candidates()
    print(f"Found {len(candidates)} non-archived completed/canceled issues")

    to_archive = []
    for issue in candidates:
        # Use completedAt or canceledAt, whichever exists
        date_str = issue["completedAt"] or issue["canceledAt"]
        if not date_str:
            continue
        finished_at = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if finished_at < cutoff:
            to_archive.append(issue)

    to_archive.sort(key=lambda i: i["completedAt"] or i["canceledAt"])

    print(f"\n{len(to_archive)} issues older than {args.min_age_days} days:")
    for issue in to_archive:
        date_str = issue["completedAt"] or issue["canceledAt"]
        date_short = date_str[:10] if date_str else "?"
        state = issue["state"]["name"]
        print(f"  {issue['identifier']:>8}  {state:<10}  {date_short}  {issue['title']}")

    if not to_archive:
        print("\nNothing to archive.")
        return

    if args.dry_run:
        print(f"\n[dry-run] Would archive {len(to_archive)} issues.")
        return

    print(f"\nArchiving {len(to_archive)} issues...")
    archived = 0
    failed = 0
    for issue in to_archive:
        try:
            result = graphql(ARCHIVE_MUTATION, {"id": issue["id"]})
            if result["issueArchive"]["success"]:
                archived += 1
            else:
                print(f"  WARN: {issue['identifier']} archive returned success=false", file=sys.stderr)
                failed += 1
        except Exception as e:
            print(f"  ERROR archiving {issue['identifier']}: {e}", file=sys.stderr)
            failed += 1

    print(f"\nDone: {archived} archived, {failed} failed.")
    print(f"Free-tier slots recovered: ~{archived}")


if __name__ == "__main__":
    main()
