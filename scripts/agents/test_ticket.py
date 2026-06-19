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
    def test_branch_version_appends_suffix(self) -> None:
        branch = "pro-136_give_agents_instructions_on_where_to_put_worktrees"
        self.assertEqual(
            ticket.branch_with_suffix(branch, "2"),
            "pro-136_give_agents_instructions_on_where_to_put_worktrees_2",
        )

    def test_branch_version_slugifies_suffix(self) -> None:
        self.assertEqual(
            ticket.branch_with_suffix("pro-7_fix_bug", "Retry Run!"),
            "pro-7_fix_bug_retry-run",
        )

    def test_worktree_path_preserves_underscored_slug(self) -> None:
        self.assertEqual(
            ticket.path_slug("pro-136_give_agents_instructions"),
            "pro-136_give_agents_instructions",
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

    def test_wrapper_directions_empty_for_default_run(self) -> None:
        args = ticket.parse_args(["PRO-136"])
        directions = ticket.build_wrapper_directions(args)
        self.assertEqual(directions, [])

    def test_wrapper_directions_versioned_branch(self) -> None:
        args = ticket.parse_args(["PRO-136", "-v", "3"])
        directions = ticket.build_wrapper_directions(args)
        self.assertEqual(len(directions), 1)
        self.assertIn("versioned-branch", directions[0])
        self.assertIn("version 3", directions[0])

    def test_wrapper_directions_explicit_branch(self) -> None:
        args = ticket.parse_args(["PRO-136", "--branch", "my-branch"])
        directions = ticket.build_wrapper_directions(args)
        self.assertEqual(len(directions), 1)
        self.assertIn("explicit-branch", directions[0])

    def test_wrapper_directions_explicit_worktree(self) -> None:
        args = ticket.parse_args(["PRO-136", "--worktree", "/tmp/wt"])
        directions = ticket.build_wrapper_directions(args)
        self.assertEqual(len(directions), 1)
        self.assertIn("explicit-worktree", directions[0])


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

    def test_effort_for_claude_harness(self) -> None:
        args = ticket.parse_args(["--harness", "claude", "PRO-136", "--effort", "high"])
        self.assertEqual(ticket.harness_cli_args(args), ["--effort", "high"])

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

    def test_plan_flag_adds_permission_mode_for_claude(self) -> None:
        args = ticket.parse_args(["--harness", "claude", "PRO-136", "--plan"])
        self.assertEqual(ticket.harness_cli_args(args), ["--permission-mode", "plan"])

    def test_plan_flag_errors_for_codex(self) -> None:
        args = ticket.parse_args(["PRO-136", "--plan"])
        with self.assertRaises(SystemExit):
            ticket.harness_cli_args(args)

    def test_plan_flag_combines_with_model_for_claude(self) -> None:
        args = ticket.parse_args(
            ["--harness", "claude", "PRO-136", "--plan", "--model", "opus"]
        )
        self.assertEqual(
            ticket.harness_cli_args(args),
            ["--permission-mode", "plan", "--model", "opus"],
        )

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
