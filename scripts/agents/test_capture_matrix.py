#!/usr/bin/env python3
"""Unit tests for scripts/agents/capture-matrix."""

from __future__ import annotations

import importlib.util
import io
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("capture-matrix")
LOADER = SourceFileLoader("capture_matrix", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("capture_matrix", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
capture_matrix = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(capture_matrix)


class ParseCellTests(unittest.TestCase):
    def test_three_fields_parse(self) -> None:
        cell = capture_matrix.parse_cell("exchanges-active 1280 dark")
        self.assertEqual(
            cell,
            {"scene": "exchanges-active", "width": "1280", "theme": "dark"},
        )

    def test_blank_and_comment_lines_are_none(self) -> None:
        self.assertIsNone(capture_matrix.parse_cell(""))
        self.assertIsNone(capture_matrix.parse_cell("   "))
        self.assertIsNone(capture_matrix.parse_cell("# a comment"))

    def test_too_few_fields_raises(self) -> None:
        with self.assertRaises(capture_matrix.SpecError):
            capture_matrix.parse_cell("scene 1280")

    def test_too_many_fields_raises(self) -> None:
        # Presence is derived now — a fourth token (e.g. a stale `after-only`, or
        # an inline comment) is a hard error, not an annotation.
        with self.assertRaises(capture_matrix.SpecError):
            capture_matrix.parse_cell("scene 1280 dark after-only")

    def test_non_numeric_width_raises(self) -> None:
        with self.assertRaises(capture_matrix.SpecError):
            capture_matrix.parse_cell("scene wide dark")

    def test_bad_theme_raises(self) -> None:
        with self.assertRaises(capture_matrix.SpecError):
            capture_matrix.parse_cell("scene 1280 purple")


class ParseSpecTests(unittest.TestCase):
    def test_parses_multiple_cells_ignoring_noise(self) -> None:
        text = (
            "# header\n"
            "exchanges 1280 dark\n"
            "\n"
            "timeline 1280 dark\n"
        )
        cells = capture_matrix.parse_spec(text)
        self.assertEqual([c["scene"] for c in cells], ["exchanges", "timeline"])

    def test_error_reports_line_number(self) -> None:
        text = "good 1280 dark\nbad line here oops\n"
        with self.assertRaises(capture_matrix.SpecError) as ctx:
            capture_matrix.parse_spec(text)
        self.assertIn("line 2", str(ctx.exception))


class MainTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.out = self.tmp_path / "out"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _write_spec(self, text: str) -> Path:
        spec = self.tmp_path / "matrix.txt"
        spec.write_text(text)
        return spec

    def _run(self, *args: str):
        out, err = io.StringIO(), io.StringIO()
        with patch("sys.stdout", out), patch("sys.stderr", err):
            code = capture_matrix.main(list(args))
        return code, out.getvalue(), err.getvalue()

    @staticmethod
    def _fake_run_factory(returncodes: dict[str, int], calls: list[str]):
        """Build a subprocess.run stub keyed by scene, recording call order.

        returncodes maps a scene id to the exit code capture-shot should report;
        a scene absent from the map succeeds (0).
        """

        def fake_run(cmd, capture_output, text):  # noqa: ANN001
            scene = cmd[cmd.index("--scene") + 1]
            calls.append(scene)
            rc = returncodes.get(scene, 0)

            class R:
                returncode = rc
                stdout = f"{scene}-1280-dark.png\n" if rc == 0 else ""
                stderr = "" if rc == 0 else f"capture-shot: scene {scene} failed\n"

            return R()

        return fake_run

    def test_missing_spec_exits_two(self) -> None:
        code, _, err = self._run(
            "--spec", str(self.tmp_path / "nope.txt"), "--out", str(self.out)
        )
        self.assertEqual(code, 2)
        self.assertIn("not found", err)

    def test_malformed_spec_exits_one(self) -> None:
        spec = self._write_spec("totally broken line\n")
        code, _, err = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 1)
        self.assertIn("malformed spec", err)

    def test_empty_spec_exits_one(self) -> None:
        spec = self._write_spec("# only a comment\n")
        code, _, err = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 1)
        self.assertIn("no cells", err)

    def test_captures_every_cell(self) -> None:
        spec = self._write_spec("a 1280 dark\nb 1280 dark\n")
        calls: list[str] = []
        with patch.object(
            capture_matrix.subprocess, "run", self._fake_run_factory({}, calls)
        ):
            code, out, _ = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 0)
        self.assertEqual(sorted(calls), ["a", "b"])
        self.assertIn("a-1280-dark.png", out)
        self.assertIn("b-1280-dark.png", out)

    def test_unknown_scene_is_skipped_not_aborted(self) -> None:
        # capture-shot exit 3 = scene unknown to this app version → skip, keep going.
        spec = self._write_spec("present 1280 dark\nabsent 1280 dark\n")
        calls: list[str] = []
        fake = self._fake_run_factory(
            {"absent": capture_matrix.UNKNOWN_SCENE_EXIT}, calls
        )
        with patch.object(capture_matrix.subprocess, "run", fake):
            code, out, err = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 0)
        self.assertEqual(sorted(calls), ["absent", "present"])
        self.assertIn("present-1280-dark.png", out)
        self.assertNotIn("absent-1280-dark.png", out)
        self.assertIn("skipped", err)
        self.assertIn("absent", err)

    def test_all_scenes_absent_is_empty_not_error(self) -> None:
        # A pure new-view ticket's before pass: the base app has none of the
        # scenes, so all skip and the dir is left empty — still success.
        spec = self._write_spec("newview 1280 dark\n")
        calls: list[str] = []
        fake = self._fake_run_factory(
            {"newview": capture_matrix.UNKNOWN_SCENE_EXIT}, calls
        )
        with patch.object(capture_matrix.subprocess, "run", fake):
            code, out, _ = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 0)
        self.assertEqual(out, "")
        self.assertTrue(self.out.is_dir())
        self.assertEqual(list(self.out.iterdir()), [])

    def test_cleans_stale_artifacts(self) -> None:
        spec = self._write_spec("a 1280 dark\n")
        self.out.mkdir(parents=True)
        (self.out / "stale.png").write_bytes(b"")
        calls: list[str] = []
        with patch.object(
            capture_matrix.subprocess, "run", self._fake_run_factory({}, calls)
        ):
            code, _, _ = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 0)
        # capture-shot is stubbed (writes no file), so the only proof the dir was
        # cleaned is that the stale artifact is gone.
        self.assertFalse((self.out / "stale.png").exists())

    def test_other_capture_shot_failure_aborts(self) -> None:
        # A non-3 failure (e.g. theme didn't activate) aborts the whole run.
        spec = self._write_spec("a 1280 dark\nb 1280 dark\n")
        calls: list[str] = []
        with patch.object(
            capture_matrix.subprocess, "run", self._fake_run_factory({"a": 1}, calls)
        ):
            code, _, err = self._run("--spec", str(spec), "--out", str(self.out))
        self.assertEqual(code, 1)
        self.assertIn("capture-shot failed", err)
        # Aborted on the first cell — second never attempted.
        self.assertEqual(calls, ["a"])


class FullSetTests(unittest.TestCase):
    """No --spec: capture every scene the running app exposes (via scene-list) at
    the default width/theme — the normal full-set mode."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.out = self.tmp_path / "out"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _run(self, *args: str):
        out, err = io.StringIO(), io.StringIO()
        with patch("sys.stdout", out), patch("sys.stderr", err):
            code = capture_matrix.main(list(args))
        return code, out.getvalue(), err.getvalue()

    @staticmethod
    def _fake_run(app_scenes: set[str], calls: list[tuple], scene_list_rc: int = 0):
        """Stub both subprocess users: the scene-list helper and capture-shot."""

        def fake_run(cmd, capture_output, text):  # noqa: ANN001
            if cmd[0].endswith("scene-list"):
                class R:
                    returncode = scene_list_rc
                    stdout = (
                        "\n".join(sorted(app_scenes)) + "\n"
                        if scene_list_rc == 0
                        else ""
                    )
                    stderr = ""

                return R()

            scene = cmd[cmd.index("--scene") + 1]
            width = cmd[cmd.index("--width") + 1]
            theme = cmd[cmd.index("--theme") + 1]
            calls.append((scene, width, theme))

            class R:
                returncode = 0
                stdout = f"{scene}-{width}-{theme}.png\n"
                stderr = ""

            return R()

        return fake_run

    def test_no_spec_captures_every_scene_at_default(self) -> None:
        calls: list[tuple] = []
        with patch.object(
            capture_matrix.subprocess, "run", self._fake_run({"a", "b", "c"}, calls)
        ):
            code, out, err = self._run("--out", str(self.out))
        self.assertEqual(code, 0, err)
        self.assertEqual(
            sorted(calls),
            [("a", "1280", "dark"), ("b", "1280", "dark"), ("c", "1280", "dark")],
        )
        self.assertIn("a-1280-dark.png", out)
        self.assertIn("c-1280-dark.png", out)

    def test_no_spec_harness_unavailable_exits_one(self) -> None:
        calls: list[tuple] = []
        with patch.object(
            capture_matrix.subprocess,
            "run",
            self._fake_run({"a"}, calls, scene_list_rc=1),
        ):
            code, _, err = self._run("--out", str(self.out))
        self.assertEqual(code, 1)
        self.assertIn("scene harness", err)
        self.assertEqual(calls, [])  # never reached capture-shot

    def test_no_spec_no_scenes_exits_one(self) -> None:
        calls: list[tuple] = []
        with patch.object(
            capture_matrix.subprocess, "run", self._fake_run(set(), calls)
        ):
            code, _, err = self._run("--out", str(self.out))
        self.assertEqual(code, 1)
        self.assertIn("no scenes", err)


if __name__ == "__main__":
    unittest.main()
