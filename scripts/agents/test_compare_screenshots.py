#!/usr/bin/env python3
"""Unit tests for compare-screenshots.

The full-set flow has no spec to typo-check, so these cover the paths that need
neither S3 nor reg-cli: usage validation, and the "no visual change" path (where
compare-screenshots runs the real screenshot-diff but, finding nothing changed,
skips the report and uploads entirely). The changed path (report + embeds) needs
live S3 and is exercised by the end-to-end live validation, not here.
"""

from __future__ import annotations

import base64
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("compare-screenshots")

# A minimal valid 1×1 PNG — enough for screenshot-diff (Pillow) to open and
# compare. Two copies are byte-identical, so they pair as "identical".
_PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class CompareScreenshotsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.before = self.root / "before"
        self.after = self.root / "after"
        self.before.mkdir()
        self.after.mkdir()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _png(self, where: Path, name: str) -> None:
        (where / name).write_bytes(_PNG_1X1)

    def _run(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [str(SCRIPT), str(self.before), str(self.after), *args],
            capture_output=True,
            text=True,
        )

    def test_missing_branch_is_usage_error(self) -> None:
        result = self._run()
        self.assertEqual(result.returncode, 2)
        self.assertIn("usage", result.stderr)

    def test_bad_expected_is_usage_error(self) -> None:
        result = self._run("--branch", "b", "--expected", "maybe")
        self.assertEqual(result.returncode, 2)

    def test_identical_emits_section_no_report(self) -> None:
        # Same shot in both passes → identical → no visual change → no report,
        # no uploads, just the summary. Exit 0.
        self._png(self.before, "shot-1280-dark.png")
        self._png(self.after, "shot-1280-dark.png")
        result = self._run("--branch", "test-branch")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("## Visual diff", result.stdout)
        self.assertIn("1/1 identical", result.stdout)
        self.assertNotIn("Visual diff report", result.stdout)
        self.assertNotIn("Changed scenes", result.stdout)

    def test_expected_changed_on_identical_cautions_and_exits_three(self) -> None:
        self._png(self.before, "shot-1280-dark.png")
        self._png(self.after, "shot-1280-dark.png")
        result = self._run("--branch", "test-branch", "--expected", "changed")
        self.assertEqual(result.returncode, 3, result.stderr)
        self.assertIn("[!CAUTION]", result.stdout)
        self.assertIn("none were detected", result.stdout)


if __name__ == "__main__":
    unittest.main()
