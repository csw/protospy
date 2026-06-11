#!/usr/bin/env python3
"""Unit tests for scripts/agents/sync-handle-ticket-inner-skill."""

from __future__ import annotations

import importlib.util
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-handle-ticket-inner-skill")
LOADER = SourceFileLoader("sync_handle_ticket_inner_skill", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("sync_handle_ticket_inner_skill", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
sync_handle_ticket_inner_skill = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync_handle_ticket_inner_skill)


class CodexGenerationTests(unittest.TestCase):
    def test_codex_review_failures_fail_closed(self) -> None:
        generated = sync_handle_ticket_inner_skill.generate_codex_skill()
        normalized = " ".join(generated.split())

        self.assertIn(
            "If the typed reviewer still fails for a tool-level reason, stop",
            normalized,
        )
        self.assertIn("Do not substitute a default/general-purpose subagent", normalized)
        self.assertNotIn(
            "try once to spawn a default/general-purpose subagent",
            generated,
        )

    def test_codex_light_visual_guidance_uses_only_codex_model_names(self) -> None:
        generated = sync_handle_ticket_inner_skill.generate_codex_skill()
        normalized = " ".join(generated.split())

        self.assertIn(
            "Spawn a `general-purpose` subagent for a lightweight visual check",
            generated,
        )
        self.assertIn(
            "use `model: gpt-5.4-mini` with medium reasoning",
            generated,
        )
        self.assertNotIn(
            "does not advertise Fast/priority service tiers",
            generated,
        )
        self.assertNotIn(
            "Claude Code, use Sonnet (`model: sonnet`). In Codex",
            generated,
        )
        self.assertNotIn("do not use `gpt-5.4-mini`", normalized.lower())

    def test_claude_skill_renders_without_jinja2_tags(self) -> None:
        generated = sync_handle_ticket_inner_skill.generate_claude_skill()
        self.assertNotIn("{%", generated)
        self.assertNotIn("%}", generated)
        self.assertNotIn("{{", generated)
        self.assertNotIn("}}", generated)

    def test_codex_skill_renders_without_jinja2_tags(self) -> None:
        generated = sync_handle_ticket_inner_skill.generate_codex_skill()
        self.assertNotIn("{%", generated)
        self.assertNotIn("%}", generated)
        self.assertNotIn("{{", generated)
        self.assertNotIn("}}", generated)

    def test_claude_skill_contains_claude_specific_content(self) -> None:
        generated = sync_handle_ticket_inner_skill.generate_claude_skill()
        self.assertIn("already-entered Claude Code", generated)
        self.assertIn("Call `ExitWorktree`", generated)
        self.assertIn("Opus model, high effort", generated)

    def test_codex_skill_contains_codex_specific_content(self) -> None:
        generated = sync_handle_ticket_inner_skill.generate_codex_skill()
        self.assertIn("already-isolated worktree", generated)
        self.assertIn("No checkout-exit step is needed in Codex", generated)
        self.assertIn("gpt-5.5", generated)

    def test_script_has_no_hardcoded_prose_constants(self) -> None:
        script_text = SCRIPT.read_text()
        # The script should no longer contain multi-line prose from the skill
        self.assertNotIn("already-entered Claude Code", script_text)
        self.assertNotIn("already-isolated worktree", script_text)
        self.assertNotIn("branch-name truncation rule", script_text)
        self.assertNotIn("worktree-backed checkout", script_text)


if __name__ == "__main__":
    unittest.main()
