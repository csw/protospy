#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "Pillow>=11,<13",
#   "numpy>=1,<3",
# ]
# ///
"""Unit tests for scripts/agents/screenshot-diff."""

from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("screenshot-diff")
LOADER = SourceFileLoader("screenshot_diff", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("screenshot_diff", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
screenshot_diff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(screenshot_diff)


def _make_png(path: Path, color: tuple[int, int, int], size: tuple[int, int] = (100, 100)) -> None:
    from PIL import Image

    Image.new("RGB", size, color=color).save(path)


def _make_png_1px_diff(path_before: Path, path_after: Path) -> None:
    """Write a before/after pair that differ in exactly one pixel."""
    import numpy as np
    from PIL import Image

    img = Image.new("RGB", (100, 100), color=(128, 64, 32))
    img.save(path_before)
    arr = np.array(img, dtype=np.uint8)
    arr[0, 0, 0] = arr[0, 0, 0] + 10  # change first pixel
    Image.fromarray(arr).save(path_after)


class ComparePairTests(unittest.TestCase):
    def test_identical_images_returns_zero_percent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            b = p / "before.png"
            a = p / "after.png"
            _make_png(b, (200, 100, 50))
            _make_png(a, (200, 100, 50))
            result = screenshot_diff.compare_pair(b, a, pixel_tolerance=0)
            self.assertTrue(result["ok"])
            self.assertIsNone(result["error"])
            self.assertEqual(result["percent"], 0.0)

    def test_completely_different_images_returns_100_percent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            b = p / "before.png"
            a = p / "after.png"
            _make_png(b, (0, 0, 0))
            _make_png(a, (255, 255, 255))
            result = screenshot_diff.compare_pair(b, a, pixel_tolerance=0)
            self.assertTrue(result["ok"])
            self.assertAlmostEqual(result["percent"], 100.0)

    def test_size_mismatch_returns_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            b = p / "before.png"
            a = p / "after.png"
            _make_png(b, (0, 0, 0), size=(100, 100))
            _make_png(a, (0, 0, 0), size=(200, 100))
            result = screenshot_diff.compare_pair(b, a, pixel_tolerance=0)
            self.assertFalse(result["ok"])
            self.assertIn("size mismatch", result["error"])

    def test_pixel_tolerance_suppresses_small_differences(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            b = p / "before.png"
            a = p / "after.png"
            _make_png_1px_diff(b, a)
            # tolerance=0: should detect the difference
            r0 = screenshot_diff.compare_pair(b, a, pixel_tolerance=0)
            self.assertTrue(r0["ok"])
            self.assertGreater(r0["percent"], 0.0)
            # tolerance=15: a 10-unit difference is within tolerance, so 0%
            r15 = screenshot_diff.compare_pair(b, a, pixel_tolerance=15)
            self.assertTrue(r15["ok"])
            self.assertEqual(r15["percent"], 0.0)


class MainTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.before_dir = self.tmp_path / "before"
        self.after_dir = self.tmp_path / "after"
        self.before_dir.mkdir()
        self.after_dir.mkdir()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _run(self, *extra_args: str) -> tuple[int, str, str]:
        """Run main() and return (exit_code, stdout, stderr)."""
        argv = [str(self.before_dir), str(self.after_dir), *extra_args]
        out = io.StringIO()
        err = io.StringIO()
        with patch("sys.stdout", out), patch("sys.stderr", err):
            code = screenshot_diff.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_identical_pair_exits_zero(self) -> None:
        _make_png(self.before_dir / "shot-1280-dark.png", (128, 64, 32))
        _make_png(self.after_dir / "shot-1280-dark.png", (128, 64, 32))
        code, out, _ = self._run()
        self.assertEqual(code, 0)
        self.assertIn("identical", out)
        self.assertIn("1/1", out)

    def test_different_pair_exits_one(self) -> None:
        _make_png(self.before_dir / "shot-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "shot-1280-dark.png", (255, 255, 255))
        code, out, _ = self._run()
        self.assertEqual(code, 1)
        self.assertIn("differ", out)
        self.assertIn("shot-1280-dark.png", out)

    def test_summary_shows_percentage(self) -> None:
        _make_png(self.before_dir / "shot-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "shot-1280-dark.png", (255, 255, 255))
        _, out, _ = self._run()
        self.assertRegex(out, r"\d+\.\d+% changed")

    def test_multiple_pairs_all_identical(self) -> None:
        for name in ["a-1280-dark.png", "b-1280-dark.png", "c-1280-dark.png"]:
            _make_png(self.before_dir / name, (50, 100, 150))
            _make_png(self.after_dir / name, (50, 100, 150))
        code, out, _ = self._run()
        self.assertEqual(code, 0)
        self.assertIn("3/3 identical", out)

    def test_mixed_pairs_counts_correctly(self) -> None:
        _make_png(self.before_dir / "a-1280-dark.png", (50, 100, 150))
        _make_png(self.after_dir / "a-1280-dark.png", (50, 100, 150))
        _make_png(self.before_dir / "b-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "b-1280-dark.png", (255, 255, 255))
        code, out, _ = self._run()
        self.assertEqual(code, 1)
        self.assertIn("1/2 differ", out)

    def test_before_only_reported_as_removed(self) -> None:
        _make_png(self.before_dir / "paired-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "paired-1280-dark.png", (0, 0, 0))
        _make_png(self.before_dir / "orphan-1280-dark.png", (1, 2, 3))
        code, out, _ = self._run()
        # A before-only file is an expected "removed" scene, not a failure.
        self.assertEqual(code, 0)
        self.assertIn("1/1 identical", out)
        self.assertIn("1 removed: orphan-1280-dark.png", out)

    def test_after_only_reported_as_new(self) -> None:
        _make_png(self.before_dir / "paired-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "paired-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "fresh-1280-dark.png", (1, 2, 3))
        code, out, _ = self._run()
        # An after-only file is an expected "new" scene, not a failure.
        self.assertEqual(code, 0)
        self.assertIn("1/1 identical", out)
        self.assertIn("1 new: fresh-1280-dark.png", out)

    def test_pure_new_view_empty_before(self) -> None:
        # A ticket whose only scene is after-only leaves before/ empty.
        _make_png(self.after_dir / "timeline-1280-dark.png", (1, 2, 3))
        _make_png(self.after_dir / "timeline-1440-dark.png", (1, 2, 3))
        code, out, _ = self._run()
        self.assertEqual(code, 0)
        self.assertIn("0 paired", out)
        self.assertIn("2 new:", out)

    def test_paired_diff_still_fails_with_new_and_removed(self) -> None:
        _make_png(self.before_dir / "p-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "p-1280-dark.png", (255, 255, 255))
        _make_png(self.after_dir / "new-1280-dark.png", (1, 2, 3))
        _make_png(self.before_dir / "gone-1280-dark.png", (4, 5, 6))
        code, out, _ = self._run()
        self.assertEqual(code, 1)
        self.assertIn("1/1 differ", out)
        self.assertIn("1 new: new-1280-dark.png", out)
        self.assertIn("1 removed: gone-1280-dark.png", out)

    def test_within_threshold_exits_zero(self) -> None:
        _make_png_1px_diff(
            self.before_dir / "shot-1280-dark.png",
            self.after_dir / "shot-1280-dark.png",
        )
        # 1 pixel different out of 10000 = 0.0001 fraction changed.
        # --threshold 0.01 is a 1% fraction threshold — well above 0.0001, passes.
        code, out, _ = self._run("--threshold", "0.01")
        self.assertEqual(code, 0)
        # Within-threshold pairs report as "identical" (no visual regression)
        self.assertIn("identical", out)

    def test_exceeds_threshold_exits_one(self) -> None:
        _make_png_1px_diff(
            self.before_dir / "shot-1280-dark.png",
            self.after_dir / "shot-1280-dark.png",
        )
        # 1 pixel different out of 10000 = 0.01%; threshold 0.00001 should fail
        code, _, _ = self._run("--threshold", "0.00001")
        self.assertEqual(code, 1)

    def test_both_dirs_empty_exits_two(self) -> None:
        code, _, err = self._run()
        self.assertEqual(code, 2)
        self.assertIn("no images found", err)

    def test_no_paired_images_reports_new_and_removed(self) -> None:
        _make_png(self.before_dir / "shot-1280-dark.png", (0, 0, 0))
        # after/ has a different file — one removed, one new, nothing paired.
        _make_png(self.after_dir / "other-1280-dark.png", (0, 0, 0))
        code, out, _ = self._run()
        self.assertEqual(code, 0)
        self.assertIn("0 paired", out)
        self.assertIn("1 new: other-1280-dark.png", out)
        self.assertIn("1 removed: shot-1280-dark.png", out)

    def test_invalid_threshold_exits_two(self) -> None:
        _make_png(self.before_dir / "shot-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "shot-1280-dark.png", (0, 0, 0))
        code, _, err = self._run("--threshold", "1.5")
        self.assertEqual(code, 2)
        self.assertIn("threshold", err)

    def test_before_dir_missing_exits_two(self) -> None:
        argv = [str(self.tmp_path / "nonexistent"), str(self.after_dir)]
        out, err = io.StringIO(), io.StringIO()
        with patch("sys.stdout", out), patch("sys.stderr", err):
            code = screenshot_diff.main(argv)
        self.assertEqual(code, 2)
        self.assertIn("does not exist", err.getvalue())


class JsonOutputTests(unittest.TestCase):
    """--json: machine-readable classification for compare-screenshots to act on."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.before_dir = self.tmp_path / "before"
        self.after_dir = self.tmp_path / "after"
        self.before_dir.mkdir()
        self.after_dir.mkdir()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _run_json(self, *extra_args: str) -> tuple[int, dict]:
        argv = [str(self.before_dir), str(self.after_dir), "--json", *extra_args]
        out, err = io.StringIO(), io.StringIO()
        with patch("sys.stdout", out), patch("sys.stderr", err):
            code = screenshot_diff.main(argv)
        return code, json.loads(out.getvalue())

    def test_classifies_changed_new_removed_identical(self) -> None:
        # identical pair
        _make_png(self.before_dir / "same-1280-dark.png", (10, 20, 30))
        _make_png(self.after_dir / "same-1280-dark.png", (10, 20, 30))
        # changed pair
        _make_png(self.before_dir / "diff-1280-dark.png", (0, 0, 0))
        _make_png(self.after_dir / "diff-1280-dark.png", (255, 255, 255))
        # new (after only) and removed (before only)
        _make_png(self.after_dir / "added-1280-dark.png", (1, 2, 3))
        _make_png(self.before_dir / "gone-1280-dark.png", (4, 5, 6))

        code, data = self._run_json()
        self.assertEqual(code, 1)  # a paired diff flips the exit code
        self.assertEqual(data["identical"], ["same-1280-dark.png"])
        self.assertEqual([c["name"] for c in data["changed"]], ["diff-1280-dark.png"])
        self.assertIsInstance(data["changed"][0]["percent"], (int, float))
        self.assertEqual(data["new"], ["added-1280-dark.png"])
        self.assertEqual(data["removed"], ["gone-1280-dark.png"])
        self.assertEqual(data["errors"], [])

    def test_all_identical_exits_zero(self) -> None:
        _make_png(self.before_dir / "a-1280-dark.png", (9, 9, 9))
        _make_png(self.after_dir / "a-1280-dark.png", (9, 9, 9))
        code, data = self._run_json()
        self.assertEqual(code, 0)
        self.assertEqual(data["changed"], [])
        self.assertEqual(data["identical"], ["a-1280-dark.png"])

    def test_new_and_removed_alone_exit_zero(self) -> None:
        # No paired diff → exit 0 even though there are new/removed scenes.
        _make_png(self.after_dir / "added-1280-dark.png", (1, 2, 3))
        _make_png(self.before_dir / "gone-1280-dark.png", (4, 5, 6))
        code, data = self._run_json()
        self.assertEqual(code, 0)
        self.assertEqual(data["new"], ["added-1280-dark.png"])
        self.assertEqual(data["removed"], ["gone-1280-dark.png"])


class CollectImagesTests(unittest.TestCase):
    def test_returns_sorted_png_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / "b.png").touch()
            (p / "a.png").touch()
            (p / "c.jpg").touch()
            (p / "not_image.txt").touch()
            images = screenshot_diff.collect_images(p)
            self.assertEqual([i.name for i in images], ["a.png", "b.png", "c.jpg"])

    def test_ignores_non_image_extensions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / "shot.txt").touch()
            (p / "shot.json").touch()
            images = screenshot_diff.collect_images(p)
            self.assertEqual(images, [])


class FormatSummaryTests(unittest.TestCase):
    @staticmethod
    def _ok(name: str, percent: float = 0.0) -> dict:
        return {"ok": True, "error": None, "percent": percent, "name": name}

    def test_all_identical(self) -> None:
        ok = [self._ok("a"), self._ok("b")]
        self.assertEqual(screenshot_diff.format_summary(ok, [], [], []), "2/2 identical")

    def test_failing_pairs(self) -> None:
        ok = [self._ok("a"), self._ok("b", 1.2)]
        failing = [self._ok("b", 1.2)]
        self.assertEqual(
            screenshot_diff.format_summary(ok, failing, [], []),
            "1/2 differ: b (1.2% changed)",
        )

    def test_new_and_removed_appended(self) -> None:
        ok = [self._ok("a")]
        summary = screenshot_diff.format_summary(ok, [], ["new.png"], ["gone.png"])
        self.assertEqual(
            summary, "1/1 identical; 1 new: new.png; 1 removed: gone.png"
        )

    def test_no_pairs_only_new(self) -> None:
        summary = screenshot_diff.format_summary([], [], ["x.png", "y.png"], [])
        self.assertEqual(summary, "0 paired; 2 new: x.png, y.png")


if __name__ == "__main__":
    unittest.main()
