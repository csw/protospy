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
import struct
import tempfile
import unittest
import zlib
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import MagicMock, patch


SCRIPT = Path(__file__).with_name("visual-diff-report")
LOADER = SourceFileLoader("visual_diff_report", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("visual_diff_report", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
vdr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(vdr)


def _make_png(path: Path, r: int, g: int, b: int) -> None:
    """Write a valid 1×1 RGB PNG to path."""
    path.parent.mkdir(parents=True, exist_ok=True)

    def chunk(name: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", crc)

    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00" + bytes([r, g, b])))
    iend = chunk(b"IEND", b"")
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + ihdr + idat + iend)


class BranchSlugTests(unittest.TestCase):
    def test_plain_branch(self) -> None:
        self.assertEqual(vdr.branch_slug("main"), "main")

    def test_slash_becomes_dash(self) -> None:
        self.assertEqual(
            vdr.branch_slug("feature/pro-425-my-change"),
            "feature-pro-425-my-change",
        )

    def test_double_slash_collapses_to_single_dash(self) -> None:
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
    def test_calls_npx_with_correct_args(self) -> None:
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stderr="")
            vdr.run_reg_cli(
                Path("/tmp/after"),
                Path("/tmp/before"),
                Path("/tmp/diff"),
                Path("/tmp/index.html"),
                Path("/tmp/reg.json"),
            )

        args = mock_run.call_args[0][0]
        self.assertEqual(args[0], "npx")
        self.assertEqual(args[1], "-y")
        self.assertRegex(args[2], r"^reg-cli@\d")
        # actual (after) before expected (before) — reg-cli positional order
        self.assertIn("after", args[3])
        self.assertIn("before", args[4])
        self.assertIn("diff", args[5])
        self.assertEqual(args[6], "-R")
        self.assertIn("index.html", args[7])
        # -J directs reg.json into the output dir instead of the cwd
        self.assertEqual(args[8], "-J")
        self.assertIn("reg.json", args[9])
        self.assertIn("-I", args)

    def test_non_zero_exit_raises(self) -> None:
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="some error")
            with self.assertRaises(SystemExit):
                vdr.run_reg_cli(
                    Path("/tmp/a"),
                    Path("/tmp/b"),
                    Path("/tmp/d"),
                    Path("/tmp/r.html"),
                    Path("/tmp/reg.json"),
                )

    def test_real_reg_cli_produces_report(self) -> None:
        """Integration: invoke the real reg-cli via npx and verify index.html is produced."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            _make_png(tmp / "before" / "shot.png", 0, 0, 0)
            _make_png(tmp / "after" / "shot.png", 128, 128, 128)

            diff_dir = tmp / "report" / "diff"
            report_html = tmp / "report" / "index.html"
            json_path = tmp / "report" / "reg.json"
            diff_dir.mkdir(parents=True)

            vdr.run_reg_cli(
                tmp / "after", tmp / "before", diff_dir, report_html, json_path
            )

            self.assertTrue(report_html.exists(), "index.html was not produced")
            self.assertGreater(report_html.stat().st_size, 0)
            # -J directs reg.json into the output dir, not the cwd.
            self.assertTrue(json_path.exists(), "reg.json not written to output dir")


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
            url = vdr.upload_report(
                mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report"
            )

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
            vdr.upload_report(
                mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report"
            )

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
                vdr.upload_report(
                    mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report"
                )
            self.assertIn("index.html", str(ctx.exception))

    def test_unknown_extension_uses_octet_stream(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_dir = Path(tmpdir)
            (report_dir / "index.html").write_text("<html></html>")
            (report_dir / "data.bin").write_bytes(b"\x00")

            mock_s3 = self._make_mock_s3()
            vdr.upload_report(
                mock_s3, report_dir, "screenshots/pr-foo/visual-diff-report"
            )

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

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_missing_before_dir_exits_one(self) -> None:
        stderr = io.StringIO()
        with patch("sys.stderr", stderr):
            code = vdr.main(["/nonexistent/before", str(self._after), "--branch", "b"])
        self.assertEqual(code, 1)
        self.assertIn("before-dir", stderr.getvalue())

    def test_missing_after_dir_exits_one(self) -> None:
        stderr = io.StringIO()
        with patch("sys.stderr", stderr):
            code = vdr.main([str(self._before), "/nonexistent/after", "--branch", "b"])
        self.assertEqual(code, 1)
        self.assertIn("after-dir", stderr.getvalue())

    def test_prints_report_url(self) -> None:
        output_dir = self._tmp / "report"

        def fake_run_reg_cli(
            after_dir, before_dir, diff_dir, report_html, json_path
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

    def test_copies_image_sets_into_output_dir(self) -> None:
        """The report must be self-contained: source image sets are copied into
        the output dir and reg-cli is run against those in-dir paths, so the
        uploaded report references images that actually exist on S3."""
        _make_png(self._before / "shot.png", 0, 0, 0)
        _make_png(self._after / "shot.png", 128, 128, 128)
        output_dir = self._tmp / "report"
        captured: dict[str, Path] = {}

        def fake_run_reg_cli(
            after_dir, before_dir, diff_dir, report_html, json_path
        ) -> None:
            captured["after"] = after_dir
            captured["before"] = before_dir
            report_html.parent.mkdir(parents=True, exist_ok=True)
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
                    "b",
                    "--output-dir",
                    str(output_dir),
                ]
            )

        # reg-cli is pointed at copies inside the output dir, not the sources.
        self.assertEqual(captured["after"], output_dir / "actual")
        self.assertEqual(captured["before"], output_dir / "expected")
        self.assertTrue((output_dir / "actual" / "shot.png").exists())
        self.assertTrue((output_dir / "expected" / "shot.png").exists())

    def test_recopies_when_output_dir_exists(self) -> None:
        """A stale copy from a prior run is replaced, not merged."""
        _make_png(self._before / "shot.png", 0, 0, 0)
        _make_png(self._after / "shot.png", 128, 128, 128)
        output_dir = self._tmp / "report"
        # Pre-seed a stale file under the destination copy.
        stale = output_dir / "expected" / "stale.png"
        _make_png(stale, 1, 2, 3)

        def fake_run_reg_cli(
            after_dir, before_dir, diff_dir, report_html, json_path
        ) -> None:
            report_html.parent.mkdir(parents=True, exist_ok=True)
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
                    "b",
                    "--output-dir",
                    str(output_dir),
                ]
            )

        self.assertFalse(stale.exists(), "stale file survived the recopy")

    def test_s3_prefix_uses_branch_slug(self) -> None:
        output_dir = self._tmp / "report"

        def fake_run_reg_cli(
            after_dir, before_dir, diff_dir, report_html, json_path
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
