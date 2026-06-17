#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "boto3>=1.43,<2",
# ]
# ///
"""Unit tests for scripts/agents/visual-diff-report."""

from __future__ import annotations

import importlib.util
import io
import subprocess
import sys
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import MagicMock, call, patch


SCRIPT = Path(__file__).with_name("visual-diff-report")
LOADER = SourceFileLoader("visual_diff_report", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("visual_diff_report", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
vdr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(vdr)


class BranchSlugTests(unittest.TestCase):
    def test_plain_branch(self) -> None:
        self.assertEqual(vdr.branch_slug("main"), "main")

    def test_slash_becomes_dash(self) -> None:
        self.assertEqual(
            vdr.branch_slug("feature/pro-425-my-change"),
            "feature-pro-425-my-change",
        )

    def test_multiple_special_chars_collapsed(self) -> None:
        self.assertEqual(vdr.branch_slug("feat//pro--425"), "feat-pro--425")

    def test_empty_falls_back(self) -> None:
        self.assertEqual(vdr.branch_slug(""), "unknown")

    def test_leading_trailing_dashes_stripped(self) -> None:
        self.assertEqual(vdr.branch_slug("-foo-"), "foo")


class S3UrlTests(unittest.TestCase):
    def test_url_format(self) -> None:
        url = vdr.s3_url("protospy-dev-data", "screenshots/pr-foo/index.html")
        self.assertEqual(
            url,
            "https://protospy-dev-data.s3.amazonaws.com/screenshots/pr-foo/index.html",
        )


class RunRegCliTests(unittest.TestCase):
    def test_calls_reg_cli_with_correct_args(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            # Create a fake reg-cli binary
            fake_reg_cli = tmp / "ui" / "node_modules" / ".bin" / "reg-cli"
            fake_reg_cli.parent.mkdir(parents=True)
            fake_reg_cli.touch()
            fake_reg_cli.chmod(0o755)

            after = tmp / "after"
            before = tmp / "before"
            diff = tmp / "diff"
            report = tmp / "index.html"
            after.mkdir()
            before.mkdir()
            diff.mkdir()

            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0, stderr="")
                vdr.run_reg_cli(tmp, after, before, diff, report)

            call_args = mock_run.call_args
            args = call_args[0][0]
            kwargs = call_args[1] if call_args[1] else call_args.kwargs
            # Runs via relative path from repo root
            self.assertEqual(args[0], "ui/node_modules/.bin/reg-cli")
            # after is first (actual), before is second (expected)
            self.assertIn("after", args[1])
            self.assertIn("before", args[2])
            self.assertEqual(args[3], "diff")
            self.assertEqual(args[4], "-R")
            self.assertIn("index.html", args[5])
            self.assertIn("-I", args)
            # Must run from repo root so reg-cli Wasm can use relative paths
            self.assertEqual(kwargs.get("cwd"), str(tmp.resolve()))

    def test_missing_reg_cli_exits(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            with self.assertRaises(SystemExit) as ctx:
                vdr.run_reg_cli(tmp, tmp, tmp, tmp, tmp / "index.html")
            self.assertIn("reg-cli not found", str(ctx.exception))

    def test_non_zero_exit_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            fake_reg_cli = tmp / "ui" / "node_modules" / ".bin" / "reg-cli"
            fake_reg_cli.parent.mkdir(parents=True)
            fake_reg_cli.touch()

            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=1, stderr="some error")
                with self.assertRaises(SystemExit):
                    vdr.run_reg_cli(tmp, tmp, tmp, tmp, tmp / "index.html")


class UploadReportTests(unittest.TestCase):
    def _make_mock_s3(self) -> MagicMock:
        mock = MagicMock()
        mock.upload_file = MagicMock()
        return mock

    def test_uploads_index_and_returns_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir)
            (report_dir / "index.html").write_text("<html></html>")

            mock_s3 = self._make_mock_s3()
            url = vdr.upload_report(mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report")

            self.assertIn("index.html", url)
            self.assertIn("protospy-dev-data", url)
            mock_s3.upload_file.assert_called_once()
            upload_args = mock_s3.upload_file.call_args
            self.assertEqual(
                upload_args[1]["ExtraArgs"]["ContentType"], "text/html; charset=utf-8"
            )

    def test_uploads_diff_images_with_correct_content_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir)
            (report_dir / "index.html").write_text("<html></html>")
            diff_dir = report_dir / "diff"
            diff_dir.mkdir()
            (diff_dir / "shot.webp").write_bytes(b"\x00")
            (diff_dir / "shot.png").write_bytes(b"\x00")

            mock_s3 = self._make_mock_s3()
            vdr.upload_report(mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report")

            calls = {
                Path(c[0][2]).name: c[1]["ExtraArgs"]["ContentType"]
                for c in mock_s3.upload_file.call_args_list
            }
            self.assertEqual(calls.get("shot.webp"), "image/webp")
            self.assertEqual(calls.get("shot.png"), "image/png")

    def test_keys_preserve_relative_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir)
            (report_dir / "index.html").write_text("<html></html>")
            diff_dir = report_dir / "diff"
            diff_dir.mkdir()
            (diff_dir / "img.webp").write_bytes(b"\x00")

            mock_s3 = self._make_mock_s3()
            prefix = "screenshots/pr-my-branch/visual-diff-report"
            vdr.upload_report(mock_s3, report_dir, prefix)

            keys = {c[0][2] for c in mock_s3.upload_file.call_args_list}
            self.assertIn(f"{prefix}/index.html", keys)
            self.assertIn(f"{prefix}/diff/img.webp", keys)

    def test_missing_index_html_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir)
            mock_s3 = self._make_mock_s3()
            with self.assertRaises(SystemExit) as ctx:
                vdr.upload_report(mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report")
            self.assertIn("index.html", str(ctx.exception))

    def test_unknown_extension_uses_octet_stream(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir)
            (report_dir / "index.html").write_text("<html></html>")
            (report_dir / "data.bin").write_bytes(b"\x00")

            mock_s3 = self._make_mock_s3()
            vdr.upload_report(mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report")

            calls = {
                Path(c[0][2]).name: c[1]["ExtraArgs"]["ContentType"]
                for c in mock_s3.upload_file.call_args_list
            }
            self.assertEqual(calls.get("data.bin"), "application/octet-stream")


class MainTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._tmp = Path(self._tmpdir.name)

        self._before = self._tmp / "before"
        self._after = self._tmp / "after"
        self._before.mkdir()
        self._after.mkdir()
        (self._before / "shot-1280-dark.png").write_bytes(b"\x00")
        (self._after / "shot-1280-dark.png").write_bytes(b"\x00")

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _run(self, *extra_args: str) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch("sys.stdout", stdout), patch("sys.stderr", stderr):
            try:
                code = vdr.main(
                    [str(self._before), str(self._after), "--branch", "my-branch"]
                    + list(extra_args)
                )
            except SystemExit as e:
                code = int(str(e)) if str(e).isdigit() else 1
        return code, stdout.getvalue(), stderr.getvalue()

    def test_missing_before_dir_exits_one(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch("sys.stdout", stdout), patch("sys.stderr", stderr):
            code = vdr.main(["/nonexistent/before", str(self._after), "--branch", "b"])
        self.assertEqual(code, 1)
        self.assertIn("before-dir", stderr.getvalue())

    def test_missing_after_dir_exits_one(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch("sys.stdout", stdout), patch("sys.stderr", stderr):
            code = vdr.main([str(self._before), "/nonexistent/after", "--branch", "b"])
        self.assertEqual(code, 1)
        self.assertIn("after-dir", stderr.getvalue())

    def test_prints_report_url(self) -> None:
        output_dir = self._tmp / "report"

        def fake_run_reg_cli(
            repo_root, after_dir, before_dir, diff_dir, report_html
        ) -> None:
            report_html.parent.mkdir(parents=True, exist_ok=True)
            (report_html.parent / "diff").mkdir(exist_ok=True)
            report_html.write_text("<html></html>")

        mock_s3 = MagicMock()
        mock_s3.upload_file = MagicMock()

        stdout = io.StringIO()
        with (
            patch.object(vdr, "run_reg_cli", fake_run_reg_cli),
            patch("boto3.client", return_value=mock_s3),
            patch("sys.stdout", stdout),
        ):
            code = vdr.main(
                [
                    str(self._before),
                    str(self._after),
                    "--branch",
                    "pro-425-my-branch",
                    "--output-dir",
                    str(output_dir),
                ]
            )

        self.assertEqual(code, 0)
        output = stdout.getvalue()
        self.assertIn("Report:", output)
        self.assertIn("pro-425-my-branch", output)
        self.assertIn("index.html", output)

    def test_s3_prefix_uses_branch_slug(self) -> None:
        output_dir = self._tmp / "report"

        def fake_run_reg_cli(
            repo_root, after_dir, before_dir, diff_dir, report_html
        ) -> None:
            report_html.parent.mkdir(parents=True, exist_ok=True)
            (report_html.parent / "diff").mkdir(exist_ok=True)
            report_html.write_text("<html></html>")

        mock_s3 = MagicMock()
        mock_s3.upload_file = MagicMock()

        with (
            patch.object(vdr, "run_reg_cli", fake_run_reg_cli),
            patch("boto3.client", return_value=mock_s3),
            patch("sys.stdout", io.StringIO()),
        ):
            vdr.main(
                [
                    str(self._before),
                    str(self._after),
                    "--branch",
                    "feature/pro-425-my/change",
                    "--output-dir",
                    str(output_dir),
                ]
            )

        keys = {c[0][2] for c in mock_s3.upload_file.call_args_list}
        self.assertTrue(
            any("feature-pro-425-my-change" in k for k in keys),
            f"Expected branch slug in key, got: {keys}",
        )


if __name__ == "__main__":
    unittest.main()
