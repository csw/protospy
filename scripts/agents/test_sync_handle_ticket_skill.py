#!/usr/bin/env python3
"""Unit tests for scripts/agents/sync-handle-ticket-skill.

Tests verify structural invariants and cross-contamination guards for
the generated handle-ticket skills — properties that matter regardless of
how the prose is worded.  Exact-phrase assertions are reserved for
load-bearing directives (fail-closed on review startup, stop-and-wait
after triage) where the wording itself is the mechanism.
"""

from __future__ import annotations

import importlib.util
import re
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-handle-ticket-skill")
LOADER = SourceFileLoader("sync_handle_ticket_skill", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("sync_handle_ticket_skill", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
sync_handle_ticket_skill = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync_handle_ticket_skill)

# Model names that must never cross harness boundaries.
CLAUDE_MODELS = {"sonnet", "opus", "haiku"}
CODEX_MODELS = {"gpt-5.5", "gpt-5.4-mini"}


class StructuralTests(unittest.TestCase):
    """Template renders correctly and on-disk files stay in sync."""

    def test_claude_skill_renders_without_jinja2_tags(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        for tag in ("{%", "%}", "{{", "}}"):
            self.assertNotIn(tag, generated)

    def test_codex_skill_renders_without_jinja2_tags(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        for tag in ("{%", "%}", "{{", "}}"):
            self.assertNotIn(tag, generated)

    def test_skill_name_is_handle_ticket(self) -> None:
        for generated in (
            sync_handle_ticket_skill.generate_claude_skill(),
            sync_handle_ticket_skill.generate_codex_skill(),
        ):
            self.assertIn("name: handle-ticket\n", generated)
            self.assertNotIn("handle-ticket-inner", generated)

    def test_check_passes_against_on_disk_files(self) -> None:
        self.assertTrue(sync_handle_ticket_skill.check())

    def test_script_has_no_hardcoded_prose_constants(self) -> None:
        script_text = SCRIPT.read_text()
        self.assertNotIn("Handle Linear ticket", script_text)
        self.assertNotIn("Verify the worktree and branch", script_text)


class CrossContaminationTests(unittest.TestCase):
    """Each harness's skill mentions only its own model names and launcher."""

    def test_claude_skill_uses_claude_launcher(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        self.assertIn("claude-ticket", generated)
        self.assertNotIn("codex-ticket", generated)

    def test_codex_skill_uses_codex_launcher(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        self.assertIn("codex-ticket", generated)
        self.assertNotIn("claude-ticket", generated)

    def test_claude_skill_has_no_codex_model_names(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        for model in CODEX_MODELS:
            self.assertNotIn(model, generated, f"Codex model {model!r} leaked into Claude skill")

    def test_codex_skill_does_not_select_claude_models(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        # Claude model names may appear in "never use these" instructions.
        # The invariant: they must never appear as a model *selection*.
        for model in CLAUDE_MODELS:
            self.assertNotIn(
                f"model: {model}",
                generated,
                f"Codex skill selects Claude model {model!r}",
            )
            self.assertNotIn(
                f"model: `{model}`",
                generated,
                f"Codex skill selects Claude model `{model}`",
            )

    def test_codex_skill_mentions_codex_models(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        for model in CODEX_MODELS:
            self.assertIn(model, generated, f"Expected Codex model {model!r} not found")

    def test_claude_skill_uses_qa_explorer_for_visual_verify(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        self.assertIn("qa-explorer", generated)

    def test_codex_skill_uses_general_purpose_for_visual_verify(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        # Codex can't use typed subagents like qa-explorer.
        self.assertNotIn("qa-explorer", generated)

    def test_claude_skill_has_claude_agent_header(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        self.assertIn("**Claude agent (handle-ticket)**", generated)

    def test_codex_skill_has_codex_agent_header(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        self.assertIn("**Codex agent (handle-ticket)**", generated)


class BehavioralInvariantTests(unittest.TestCase):
    """Load-bearing directives that must survive any rewrite."""

    def test_neither_skill_references_enterworktree(self) -> None:
        for generated in (
            sync_handle_ticket_skill.generate_claude_skill(),
            sync_handle_ticket_skill.generate_codex_skill(),
        ):
            self.assertNotIn("EnterWorktree", generated)
            self.assertNotIn("ExitWorktree", generated)

    def test_review_startup_failures_fail_closed(self) -> None:
        """Both skills must tell agents to stop on reviewer startup failure,
        not substitute a fallback agent."""
        for label, generated in [
            ("claude", sync_handle_ticket_skill.generate_claude_skill()),
            ("codex", sync_handle_ticket_skill.generate_codex_skill()),
        ]:
            normalized = " ".join(generated.split())
            self.assertIn(
                "**stop**",
                normalized,
                f"{label} skill missing fail-closed stop directive",
            )
            self.assertRegex(
                normalized,
                re.compile(r"do not substitute", re.IGNORECASE),
                f"{label} skill missing no-substitute directive",
            )

    def test_triage_stop_and_wait_directive(self) -> None:
        """The review-triage step must tell the agent to stop and wait for
        user direction — this is the directive agents have been observed
        skipping."""
        for label, generated in [
            ("claude", sync_handle_ticket_skill.generate_claude_skill()),
            ("codex", sync_handle_ticket_skill.generate_codex_skill()),
        ]:
            normalized = " ".join(generated.split())
            self.assertRegex(
                normalized,
                re.compile(r"stop here and wait", re.IGNORECASE),
                f"{label} skill missing stop-and-wait directive after triage",
            )
            self.assertRegex(
                normalized,
                re.compile(r"do not enter step 10", re.IGNORECASE),
                f"{label} skill missing explicit 'do not enter step 10'",
            )

    def test_matrix_manifest_in_both_skills(self) -> None:
        """Both skills must instruct the agent to record the shot matrix to
        scratch/matrix.txt before taking before screenshots."""
        for label, generated in [
            ("claude", sync_handle_ticket_skill.generate_claude_skill()),
            ("codex", sync_handle_ticket_skill.generate_codex_skill()),
        ]:
            self.assertIn(
                "scratch/matrix.txt",
                generated,
                f"{label} skill missing scratch/matrix.txt manifest reference",
            )

    def test_screenshot_diff_in_both_skills(self) -> None:
        """Both skills must reference screenshot-diff for the pixel self-check."""
        for label, generated in [
            ("claude", sync_handle_ticket_skill.generate_claude_skill()),
            ("codex", sync_handle_ticket_skill.generate_codex_skill()),
        ]:
            self.assertIn(
                "screenshot-diff",
                generated,
                f"{label} skill missing screenshot-diff reference",
            )

    def test_selfcheck_stop_before_pushing(self) -> None:
        """Both skills must tell agents to stop before pushing when the pixel
        self-check detects unexpected differences."""
        for label, generated in [
            ("claude", sync_handle_ticket_skill.generate_claude_skill()),
            ("codex", sync_handle_ticket_skill.generate_codex_skill()),
        ]:
            normalized = " ".join(generated.split())
            self.assertRegex(
                normalized,
                re.compile(r"stop before pushing", re.IGNORECASE),
                f"{label} skill missing 'stop before pushing' directive for self-check",
            )


if __name__ == "__main__":
    unittest.main()
