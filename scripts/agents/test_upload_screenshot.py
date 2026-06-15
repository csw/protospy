#!/usr/bin/env python3
"""Unit tests for scripts/agents/upload-screenshot."""

from __future__ import annotations

import importlib.util
import io
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import MagicMock, call, patch


SCRIPT = Path(__file__).with_name("upload-screenshot")
LOADER = SourceFileLoader("upload_screenshot", str(SCRIPT))
SPEC = importlib.util.spec_from_loader("upload_screenshot", LOADER)
assert SPEC is not None
assert SPEC.loader is not None
upload_screenshot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(upload_screenshot)


class SlugTests(unittest.TestCase):
    def test_plain_branch(self) -> None:
        self.assertEqual(upload_screenshot.branch_slug("main"), "main")

    def test_slash_becomes_dash(self) -> None:
        self.assertEqual(
            upload_screenshot.branch_slug("feature/pro-225-upload-screenshots"),
            "feature-pro-225-upload-screenshots",
        )

    def test_multiple_special_chars_collapsed(self) -> None:
        self.assertEqual(
            upload_screenshot.branch_slug("feat//pro--225"),
            "feat-pro--225",
        )

    def test_empty_falls_back(self) -> None:
        self.assertEqual(upload_screenshot.branch_slug(""), "unknown")

    def test_leading_trailing_dashes_stripped(self) -> None:
        self.assertEqual(upload_screenshot.branch_slug("-foo-"), "foo")


class S3UrlTests(unittest.TestCase):
    def test_url_format(self) -> None:
        url = upload_screenshot.s3_url("my-bucket", "screenshots/pr-foo/shot.png")
        self.assertEqual(
            url, "https://my-bucket.s3.amazonaws.com/screenshots/pr-foo/shot.png"
        )


class CollectImagesTests(unittest.TestCase):
    def test_single_png_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "shot.png"
            p.write_bytes(b"")
            images, subdir = upload_screenshot.collect_images(p)
            self.assertEqual(images, [p])
            self.assertIsNone(subdir)

    def test_skips_non_image_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "report.txt"
            p.write_bytes(b"")
            with patch("sys.stderr", new_callable=io.StringIO):
                images, subdir = upload_screenshot.collect_images(p)
            self.assertEqual(images, [])
            self.assertIsNone(subdir)

    def test_directory_collects_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.png").write_bytes(b"")
            (root / "b.jpg").write_bytes(b"")
            (root / "c.webp").write_bytes(b"")
            (root / "d.txt").write_bytes(b"")
            images, subdir = upload_screenshot.collect_images(root)
            self.assertEqual(
                sorted(p.name for p in images), ["a.png", "b.jpg", "c.webp"]
            )
            self.assertEqual(subdir, root.name)

    def test_directory_non_recursive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sub = root / "subdir"
            sub.mkdir()
            (root / "top.png").write_bytes(b"")
            (sub / "nested.png").write_bytes(b"")
            images, _ = upload_screenshot.collect_images(root)
            self.assertEqual([p.name for p in images], ["top.png"])

    def test_directory_subdir_in_key(self) -> None:
        """Directory name is returned as subdir so before/ and after/ don't collide."""
        with tempfile.TemporaryDirectory() as tmp:
            before = Path(tmp) / "before"
            before.mkdir()
            (before / "shot.png").write_bytes(b"")
            _, subdir = upload_screenshot.collect_images(before)
            self.assertEqual(subdir, "before")

    def test_missing_path_exits(self) -> None:
        with self.assertRaises(SystemExit):
            upload_screenshot.collect_images(Path("/nonexistent/path.png"))

    def test_all_supported_extensions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for ext in (".png", ".jpg", ".jpeg", ".webp"):
                (root / f"img{ext}").write_bytes(b"")
            images, _ = upload_screenshot.collect_images(root)
            self.assertEqual(len(images), 4)


class UploadTests(unittest.TestCase):
    def _make_mock_s3(self) -> MagicMock:
        mock_client = MagicMock()
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value = mock_client
        return mock_boto3, mock_client

    def test_upload_single_image_no_subdir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.png"
            img.write_bytes(b"")
            mock_boto3, mock_client = self._make_mock_s3()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                embeds = upload_screenshot.upload([img], "pro-225", None)
            mock_client.upload_file.assert_called_once_with(
                str(img),
                "protospy-dev-data",
                "screenshots/pr-pro-225/shot.png",
                ExtraArgs={"ContentType": "image/png"},
            )
            self.assertEqual(
                embeds,
                [
                    "![shot.png](https://protospy-dev-data.s3.amazonaws.com"
                    "/screenshots/pr-pro-225/shot.png)"
                ],
            )

    def test_upload_with_subdir_in_key(self) -> None:
        """Directory name is included in the S3 key so before/ and after/ don't collide."""
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.png"
            img.write_bytes(b"")
            mock_boto3, mock_client = self._make_mock_s3()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                embeds = upload_screenshot.upload([img], "pro-225", "before")
            mock_client.upload_file.assert_called_once_with(
                str(img),
                "protospy-dev-data",
                "screenshots/pr-pro-225/before/shot.png",
                ExtraArgs={"ContentType": "image/png"},
            )
            self.assertIn("before/shot.png", embeds[0])

    def test_upload_multiple_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a.png"
            b = root / "b.webp"
            a.write_bytes(b"")
            b.write_bytes(b"")
            mock_boto3, mock_client = self._make_mock_s3()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                embeds = upload_screenshot.upload([a, b], "my-branch", None)
            self.assertEqual(len(embeds), 2)
            calls = mock_client.upload_file.call_args_list
            self.assertEqual(calls[0], call(
                str(a),
                "protospy-dev-data",
                "screenshots/pr-my-branch/a.png",
                ExtraArgs={"ContentType": "image/png"},
            ))
            self.assertEqual(calls[1], call(
                str(b),
                "protospy-dev-data",
                "screenshots/pr-my-branch/b.webp",
                ExtraArgs={"ContentType": "image/webp"},
            ))

    def test_jpeg_content_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.jpg"
            img.write_bytes(b"")
            mock_boto3, mock_client = self._make_mock_s3()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                upload_screenshot.upload([img], "branch", None)
            _, kwargs = mock_client.upload_file.call_args
            self.assertEqual(kwargs["ExtraArgs"]["ContentType"], "image/jpeg")

    def test_jpeg_extension_content_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.jpeg"
            img.write_bytes(b"")
            mock_boto3, mock_client = self._make_mock_s3()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                upload_screenshot.upload([img], "branch", None)
            _, kwargs = mock_client.upload_file.call_args
            self.assertEqual(kwargs["ExtraArgs"]["ContentType"], "image/jpeg")


class MainTests(unittest.TestCase):
    def test_main_no_images_exits_one(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch("sys.stderr", new_callable=io.StringIO):
                result = upload_screenshot.main([tmp, "--branch", "main"])
        self.assertEqual(result, 1)

    def test_main_uploads_and_prints(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.png"
            img.write_bytes(b"")
            mock_boto3 = MagicMock()
            mock_boto3.client.return_value = MagicMock()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                with patch(
                    "sys.stdout", new_callable=io.StringIO
                ) as mock_out:
                    result = upload_screenshot.main(
                        [tmp, "--branch", "feature/pro-225"]
                    )
            self.assertEqual(result, 0)
            output = mock_out.getvalue().strip()
            self.assertIn("shot.png", output)
            self.assertIn("protospy-dev-data.s3.amazonaws.com", output)
            self.assertIn("feature-pro-225", output)

    def test_main_branch_required(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit) as cm:
                upload_screenshot.main([tmp])
            self.assertNotEqual(cm.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
