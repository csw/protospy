#!/usr/bin/env python3
"""Unit tests for scripts/agents/codex-ticket."""

from __future__ import annotations

import importlib.util
import io
import unittest
from contextlib import redirect_stderr
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

    def test_branch_version_appends_suffix_and_preserves_limit(self) -> None:
        branch = "feature/pro-136-give-agents-instructions-on-where-to-put-worktrees"
        versioned = codex_ticket.branch_with_suffix(branch, "PRO-136", "2")
        self.assertLessEqual(len(versioned), 50)
        self.assertEqual(
            versioned,
            "feature/pro-136-give-agents-instructions-on-2",
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

    def test_instructions_are_combined_before_positional_directions(self) -> None:
        self.assertEqual(
            codex_ticket.build_directions(
                ["skip the visual review", "  "],
                ["follow", "comment", "2"],
            ),
            ["skip the visual review", "follow", "comment", "2"],
        )

    def test_effort_after_ticket_expands_to_codex_config(self) -> None:
        args = codex_ticket.parse_args(["PRO-136", "--effort", "xhigh"])
        self.assertEqual(args.ticket, "PRO-136")
        self.assertEqual(args.directions, [])
        self.assertEqual(
            codex_ticket.codex_args(args),
            ["-c", 'model_reasoning_effort="xhigh"'],
        )

    def test_short_effort_after_ticket_expands_to_codex_config(self) -> None:
        args = codex_ticket.parse_args(["PRO-136", "-e", "high"])
        self.assertEqual(args.ticket, "PRO-136")
        self.assertEqual(args.directions, [])
        self.assertEqual(
            codex_ticket.codex_args(args),
            ["-c", 'model_reasoning_effort="high"'],
        )

    def test_delimiter_passes_remaining_args_to_codex(self) -> None:
        args = codex_ticket.parse_args(
            ["PRO-136", "use", "comment", "2", "--", "-c", "xyz=123"]
        )
        self.assertEqual(args.ticket, "PRO-136")
        self.assertEqual(args.directions, ["use", "comment", "2"])
        self.assertEqual(codex_ticket.codex_args(args), ["-c", "xyz=123"])

    def test_instructions_flag_does_not_enter_positional_directions(self) -> None:
        args = codex_ticket.parse_args(
            ["PRO-136", "-i", "skip the visual review", "follow", "comment", "2"]
        )
        self.assertEqual(args.instructions, ["skip the visual review"])
        self.assertEqual(args.directions, ["follow", "comment", "2"])

    def test_branch_version_flag_is_wrapper_option(self) -> None:
        args = codex_ticket.parse_args(["PRO-136", "--version", "2", "retry it"])
        self.assertEqual(args.branch_version, "2")
        self.assertEqual(args.directions, ["retry it"])

    def test_short_branch_version_flag_is_wrapper_option(self) -> None:
        args = codex_ticket.parse_args(["PRO-136", "-v", "3"])
        self.assertEqual(args.branch_version, "3")

    def test_explicit_branch_is_wrapper_option(self) -> None:
        args = codex_ticket.parse_args(
            ["PRO-136", "--branch", "codex/pro-136-manual-alt"]
        )
        self.assertEqual(args.branch, "codex/pro-136-manual-alt")

    def test_branch_and_branch_version_are_mutually_exclusive(self) -> None:
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            codex_ticket.parse_args(
                ["PRO-136", "--branch=codex/pro-136-a", "--version", "2"]
            )

    def test_ui_install_command_uses_root_just_recipe(self) -> None:
        self.assertEqual(codex_ticket.ui_install_command(), ["just", "ui::install"])


if __name__ == "__main__":
    unittest.main()
