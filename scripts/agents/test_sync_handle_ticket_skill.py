#!/usr/bin/env python3
"""Unit tests for scripts/agents/sync-handle-ticket-skill."""

from __future__ import annotations

import importlib.util
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


class GenerationTests(unittest.TestCase):
    def test_codex_review_failures_fail_closed(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        normalized = " ".join(generated.split())

        self.assertIn(
            "If it still fails, **stop**",
            normalized,
        )
        self.assertIn("Do not substitute a default agent", normalized)

    def test_codex_light_visual_guidance_uses_only_codex_model_names(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()

        self.assertIn(
            "Spawn a **`general-purpose`** subagent",
            generated,
        )
        self.assertIn("use `model: gpt-5.4-mini`", generated)

    def test_claude_skill_renders_without_jinja2_tags(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        self.assertNotIn("{%", generated)
        self.assertNotIn("%}", generated)
        self.assertNotIn("{{", generated)
        self.assertNotIn("}}", generated)

    def test_codex_skill_renders_without_jinja2_tags(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        self.assertNotIn("{%", generated)
        self.assertNotIn("%}", generated)
        self.assertNotIn("{{", generated)
        self.assertNotIn("}}", generated)

    def test_skill_name_is_handle_ticket(self) -> None:
        for generated in (
            sync_handle_ticket_skill.generate_claude_skill(),
            sync_handle_ticket_skill.generate_codex_skill(),
        ):
            self.assertIn("name: handle-ticket\n", generated)
            self.assertNotIn("handle-ticket-inner", generated)

    def test_claude_skill_contains_claude_specific_content(self) -> None:
        generated = sync_handle_ticket_skill.generate_claude_skill()
        self.assertIn("Use the Opus model at high effort", generated)
        self.assertIn("qa-explorer", generated)
        self.assertIn("just claude-ticket", generated)
        self.assertIn("**Claude agent (handle-ticket)**", generated)

    def test_codex_skill_contains_codex_specific_content(self) -> None:
        generated = sync_handle_ticket_skill.generate_codex_skill()
        self.assertIn("gpt-5.5", generated)
        self.assertIn("gpt-5.4-mini", generated)
        self.assertIn("just codex-ticket", generated)
        self.assertIn("**Codex agent (handle-ticket)**", generated)

    def test_neither_skill_references_enterworktree(self) -> None:
        for generated in (
            sync_handle_ticket_skill.generate_claude_skill(),
            sync_handle_ticket_skill.generate_codex_skill(),
        ):
            self.assertNotIn("EnterWorktree", generated)
            self.assertNotIn("ExitWorktree", generated)

    def test_check_passes_against_on_disk_files(self) -> None:
        # Exercises both check() itself and the real production files agents read.
        self.assertTrue(sync_handle_ticket_skill.check())

    def test_script_has_no_hardcoded_prose_constants(self) -> None:
        script_text = SCRIPT.read_text()
        # The skill body lives in the template, not the script.
        self.assertNotIn("Handle Linear ticket", script_text)
        self.assertNotIn("Verify the worktree and branch", script_text)


if __name__ == "__main__":
    unittest.main()
