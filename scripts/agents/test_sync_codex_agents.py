#!/usr/bin/env python3
"""Unit tests for scripts/agents/sync-codex-agents."""

from __future__ import annotations

import importlib.util
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-codex-agents")
LOADER = SourceFileLoader("sync_codex_agents", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("sync_codex_agents", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
sync_codex_agents = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync_codex_agents)


class CodexAgentGenerationTests(unittest.TestCase):
    def test_claude_model_mapping(self) -> None:
        source_path = Path(".claude/agents/example.md")

        self.assertEqual(
            sync_codex_agents.map_claude_model_to_codex_model("sonnet", source_path),
            "gpt-5.4-mini",
        )
        self.assertEqual(
            sync_codex_agents.map_claude_model_to_codex_model("opus", source_path),
            "gpt-5.5",
        )
        self.assertEqual(
            sync_codex_agents.map_claude_model_to_codex_model("claude-opus-4-1", source_path),
            "gpt-5.5",
        )

    def test_sonnet_agents_pin_codex_mini_model(self) -> None:
        generated = sync_codex_agents.generate_agent("convention-review")

        self.assertIn('model = "gpt-5.4-mini"', generated)
        self.assertNotIn('model = "sonnet"', generated)

    def test_all_implementer_agents_generate_with_codex_model_names(self) -> None:
        for name in sync_codex_agents.IMPLEMENTER_AGENT_NAMES:
            with self.subTest(name=name):
                generated = sync_codex_agents.generate_agent(name)

                self.assertIn('model = "gpt-5.4-mini"', generated)
                self.assertNotIn('model = "sonnet"', generated)


if __name__ == "__main__":
    unittest.main()
