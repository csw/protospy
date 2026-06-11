#!/usr/bin/env python3
"""Unit tests for scripts/agents/ticket."""

from __future__ import annotations

import importlib.util
import io
import unittest
from contextlib import redirect_stderr
from importlib.machinery import SourceFileLoader
from pathlib import Path


SCRIPT = Path(__file__).with_name("ticket")
LOADER = SourceFileLoader("ticket", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("ticket", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
ticket = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ticket)


class BranchNameTests(unittest.TestCase):
    def test_short_branch_is_unchanged(self) -> None:
        branch = "feature/pro-136-short-title"
        self.assertEqual(
            ticket.truncate_branch_name(branch, "PRO-136"),
            branch,
        )

    def test_truncates_slug_at_word_boundary(self) -> None:
        branch = "feature/pro-136-give-agents-instructions-on-where-to-put-worktrees"
        truncated = ticket.truncate_branch_name(branch, "PRO-136")
        self.assertLessEqual(len(truncated), 50)
        self.assertEqual(
            truncated,
            "feature/pro-136-give-agents-instructions-on-where",
        )

    def test_branch_version_appends_suffix_and_preserves_limit(self) -> None:
        branch = "feature/pro-136-give-agents-instructions-on-where-to-put-worktrees"
        versioned = ticket.branch_with_suffix(branch, "PRO-136", "2")
        self.assertLessEqual(len(versioned), 50)
        self.assertEqual(
            versioned,
            "feature/pro-136-give-agents-instructions-on-2",
        )

    def test_keeps_issue_prefix_when_truncating(self) -> None:
        branch = "fix/pro-999-a-very-long-branch-name-that-keeps-going"
        truncated = ticket.truncate_branch_name(branch, "PRO-999")
        self.assertTrue(truncated.startswith("fix/pro-999-"))
        self.assertLessEqual(len(truncated), 50)
        self.assertNotEqual(truncated[-1], "-")

    def test_fallback_branch_slugifies_title_per_harness(self) -> None:
        self.assertEqual(
            ticket.fallback_branch_name("PRO-7", "Fix: one odd UI bug!", "codex"),
            "codex/pro-7-fix-one-odd-ui-bug",
        )
        self.assertEqual(
            ticket.fallback_branch_name("PRO-7", "Fix: one odd UI bug!", "claude"),
            "claude/pro-7-fix-one-odd-ui-bug",
        )

    def test_worktree_path_replaces_branch_slashes(self) -> None:
        self.assertEqual(
            ticket.path_slug("feature/pro-136-short-title"),
            "feature-pro-136-short-title",
        )


class PromptTests(unittest.TestCase):
    def test_build_prompt_codex_uses_dollar_prefix(self) -> None:
        self.assertEqual(
            ticket.build_prompt("PRO-136", ["follow", "comment", "2"], "codex"),
            "$handle-ticket PRO-136 follow comment 2",
        )

    def test_build_prompt_claude_uses_slash_prefix(self) -> None:
        self.assertEqual(
            ticket.build_prompt("PRO-136", ["follow", "comment", "2"], "claude"),
            "/handle-ticket PRO-136 follow comment 2",
        )

    def test_build_prompt_without_directions(self) -> None:
        self.assertEqual(
            ticket.build_prompt("PRO-136", [], "claude"),
            "/handle-ticket PRO-136",
        )

    def test_instructions_are_combined_before_positional_directions(self) -> None:
        self.assertEqual(
            ticket.build_directions(
                ["wrapper note"],
                ["skip the visual review", "  "],
                ["follow", "comment", "2"],
            ),
            ["wrapper note", "skip the visual review", "follow", "comment", "2"],
        )

    def test_wrapper_directions_pin_branch_and_version(self) -> None:
        args = ticket.parse_args(["PRO-136", "-v", "3"])
        directions = ticket.build_wrapper_directions(
            "feature/pro-136-example-3",
            Path("/tmp/pro-136-example-3"),
            args,
        )
        joined = " ".join(directions)
        self.assertIn("feature/pro-136-example-3", joined)
        self.assertIn("ticket launcher selected branch", joined)
        self.assertIn("authoritative", joined)
        self.assertIn("existing PR handling to this branch only", joined)
        self.assertIn("do not inspect or use", joined)
        self.assertIn("ticket-linked PRs from other branches", joined)
        self.assertIn("If the user says to start fresh", joined)
        self.assertIn("ignoring prior branches and PRs", joined)
        self.assertNotIn("background context", joined)
        self.assertIn("intentional alternate branch/worktree run", joined)
        self.assertIn("Do not drop the version suffix", joined)
        self.assertIn("Do not continue or repair PRs from older", joined)


class HarnessArgsTests(unittest.TestCase):
    def test_default_harness_is_codex(self) -> None:
        args = ticket.parse_args(["PRO-136"])
        self.assertEqual(args.harness, "codex")
        self.assertEqual(args.harness_bin, "codex")

    def test_claude_harness_sets_default_bin(self) -> None:
        args = ticket.parse_args(["--harness", "claude", "PRO-136"])
        self.assertEqual(args.harness, "claude")
        self.assertEqual(args.harness_bin, "claude")

    def test_effort_after_ticket_expands_to_codex_config(self) -> None:
        args = ticket.parse_args(["PRO-136", "--effort", "xhigh"])
        self.assertEqual(args.ticket, "PRO-136")
        self.assertEqual(args.directions, [])
        self.assertEqual(
            ticket.harness_cli_args(args),
            ["-c", 'model_reasoning_effort="xhigh"'],
        )

    def test_short_effort_after_ticket_expands_to_codex_config(self) -> None:
        args = ticket.parse_args(["PRO-136", "-e", "high"])
        self.assertEqual(
            ticket.harness_cli_args(args),
            ["-c", 'model_reasoning_effort="high"'],
        )

    def test_effort_is_codex_only(self) -> None:
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            ticket.parse_args(["--harness", "claude", "PRO-136", "-e", "high"])

    def test_model_is_shared_across_harnesses(self) -> None:
        args = ticket.parse_args(["--harness", "claude", "PRO-136", "--model", "opus"])
        self.assertEqual(ticket.harness_cli_args(args), ["--model", "opus"])

    def test_delimiter_passes_remaining_args_to_harness(self) -> None:
        args = ticket.parse_args(
            ["PRO-136", "use", "comment", "2", "--", "-c", "xyz=123"]
        )
        self.assertEqual(args.ticket, "PRO-136")
        self.assertEqual(args.directions, ["use", "comment", "2"])
        self.assertEqual(ticket.harness_cli_args(args), ["-c", "xyz=123"])

    def test_harness_arg_passthrough(self) -> None:
        args = ticket.parse_args(
            [
                "--harness",
                "claude",
                "PRO-136",
                "--harness-arg=--dangerously-skip-permissions",
            ]
        )
        self.assertEqual(
            ticket.harness_cli_args(args),
            ["--dangerously-skip-permissions"],
        )

    def test_codex_arg_alias_still_works(self) -> None:
        args = ticket.parse_args(["PRO-136", "--codex-arg=--foo"])
        self.assertEqual(ticket.harness_cli_args(args), ["--foo"])

    def test_instructions_flag_does_not_enter_positional_directions(self) -> None:
        args = ticket.parse_args(
            ["PRO-136", "-i", "skip the visual review", "follow", "comment", "2"]
        )
        self.assertEqual(args.instructions, ["skip the visual review"])
        self.assertEqual(args.directions, ["follow", "comment", "2"])

    def test_branch_version_flag_is_wrapper_option(self) -> None:
        args = ticket.parse_args(["PRO-136", "--version", "2", "retry it"])
        self.assertEqual(args.branch_version, "2")
        self.assertEqual(args.directions, ["retry it"])

    def test_short_branch_version_flag_is_wrapper_option(self) -> None:
        args = ticket.parse_args(["PRO-136", "-v", "3"])
        self.assertEqual(args.branch_version, "3")

    def test_explicit_branch_is_wrapper_option(self) -> None:
        args = ticket.parse_args(["PRO-136", "--branch", "codex/pro-136-manual-alt"])
        self.assertEqual(args.branch, "codex/pro-136-manual-alt")

    def test_branch_and_branch_version_are_mutually_exclusive(self) -> None:
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            ticket.parse_args(["PRO-136", "--branch=codex/pro-136-a", "--version", "2"])

    def test_ui_install_command_uses_root_just_recipe(self) -> None:
        self.assertEqual(ticket.ui_install_command(), ["just", "ui::install"])


class LaunchCommandTests(unittest.TestCase):
    def test_codex_launch_uses_dash_c(self) -> None:
        args = ticket.parse_args(["PRO-136"])
        cmd = ticket.launch_command(args, Path("/wt/pro-136"), "$handle-ticket PRO-136")
        self.assertEqual(
            cmd,
            ["codex", "-C", "/wt/pro-136", "$handle-ticket PRO-136"],
        )

    def test_claude_launch_has_no_dash_c(self) -> None:
        args = ticket.parse_args(["--harness", "claude", "PRO-136"])
        cmd = ticket.launch_command(args, Path("/wt/pro-136"), "/handle-ticket PRO-136")
        self.assertEqual(cmd, ["claude", "/handle-ticket PRO-136"])
        self.assertNotIn("-C", cmd)


if __name__ == "__main__":
    unittest.main()
