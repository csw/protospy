#!/usr/bin/env python3
"""Unit tests for scripts/agents/codex-ticket."""

from __future__ import annotations

import importlib.util
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path


SCRIPT = Path(__file__).with_name("codex-ticket")
LOADER = SourceFileLoader("codex_ticket", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("codex_ticket", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
codex_ticket = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(codex_ticket)


class BranchNameTests(unittest.TestCase):
    def test_short_branch_is_unchanged(self) -> None:
        branch = "feature/pro-136-short-title"
        self.assertEqual(
            codex_ticket.truncate_branch_name(branch, "PRO-136"),
            branch,
        )

    def test_truncates_slug_at_word_boundary(self) -> None:
        branch = "feature/pro-136-give-agents-instructions-on-where-to-put-worktrees"
        truncated = codex_ticket.truncate_branch_name(branch, "PRO-136")
        self.assertLessEqual(len(truncated), 50)
        self.assertEqual(
            truncated,
            "feature/pro-136-give-agents-instructions-on-where",
        )

    def test_keeps_issue_prefix_when_truncating(self) -> None:
        branch = "fix/pro-999-a-very-long-branch-name-that-keeps-going"
        truncated = codex_ticket.truncate_branch_name(branch, "PRO-999")
        self.assertTrue(truncated.startswith("fix/pro-999-"))
        self.assertLessEqual(len(truncated), 50)
        self.assertNotEqual(truncated[-1], "-")

    def test_fallback_branch_slugifies_title(self) -> None:
        self.assertEqual(
            codex_ticket.fallback_branch_name("PRO-7", "Fix: one odd UI bug!"),
            "codex/pro-7-fix-one-odd-ui-bug",
        )

    def test_worktree_path_replaces_branch_slashes(self) -> None:
        self.assertEqual(
            codex_ticket.path_slug("feature/pro-136-short-title"),
            "feature-pro-136-short-title",
        )

    def test_build_prompt_includes_extra_directions(self) -> None:
        self.assertEqual(
            codex_ticket.build_prompt("PRO-136", ["follow", "comment", "2"]),
            "$handle-ticket-inner PRO-136 follow comment 2",
        )


if __name__ == "__main__":
    unittest.main()
