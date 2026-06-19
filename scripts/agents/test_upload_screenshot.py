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
            _, mock_client = self._make_mock_s3()
            embeds = upload_screenshot.upload(mock_client, [img], "screenshots/pr-pro-225", None)
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
            _, mock_client = self._make_mock_s3()
            embeds = upload_screenshot.upload(mock_client, [img], "screenshots/pr-pro-225", "before")
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
            _, mock_client = self._make_mock_s3()
            embeds = upload_screenshot.upload(mock_client, [a, b], "screenshots/pr-my-branch", None)
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

    def test_upload_explicit_prefix_no_subdir(self) -> None:
        """--prefix suppresses the subdir so the prefix is the full path."""
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "requests-1280-dark.png"
            img.write_bytes(b"")
            _, mock_client = self._make_mock_s3()
            embeds = upload_screenshot.upload(mock_client, [img], "reviews/PRO-408", None)
            mock_client.upload_file.assert_called_once_with(
                str(img),
                "protospy-dev-data",
                "reviews/PRO-408/requests-1280-dark.png",
                ExtraArgs={"ContentType": "image/png"},
            )
            self.assertIn("reviews/PRO-408/requests-1280-dark.png", embeds[0])

    def test_jpeg_content_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.jpg"
            img.write_bytes(b"")
            _, mock_client = self._make_mock_s3()
            upload_screenshot.upload(mock_client, [img], "branch", None)
            _, kwargs = mock_client.upload_file.call_args
            self.assertEqual(kwargs["ExtraArgs"]["ContentType"], "image/jpeg")

    def test_jpeg_extension_content_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.jpeg"
            img.write_bytes(b"")
            _, mock_client = self._make_mock_s3()
            upload_screenshot.upload(mock_client, [img], "branch", None)
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

    def test_main_neither_flag_exits(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit) as cm:
                upload_screenshot.main([tmp])
            self.assertNotEqual(cm.exception.code, 0)

    def test_main_both_flags_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit) as cm:
                upload_screenshot.main([tmp, "--branch", "main", "--prefix", "reviews/x"])
            self.assertNotEqual(cm.exception.code, 0)


class ParseMetaTests(unittest.TestCase):
    def test_review_format_simple(self) -> None:
        m = upload_screenshot.parse_screenshot_meta("requests-1280-light.png")
        self.assertEqual(m["type"], "review")
        self.assertEqual(m["scene"], "requests")
        self.assertEqual(m["width"], "1280")
        self.assertEqual(m["theme"], "light")

    def test_review_format_hyphenated_scene(self) -> None:
        m = upload_screenshot.parse_screenshot_meta("sse-streaming-1440-dark.png")
        self.assertEqual(m["type"], "review")
        self.assertEqual(m["scene"], "sse-streaming")
        self.assertEqual(m["width"], "1440")
        self.assertEqual(m["theme"], "dark")

    def test_review_format_1920_width(self) -> None:
        m = upload_screenshot.parse_screenshot_meta("selected-1920-light.png")
        self.assertEqual(m["type"], "review")
        self.assertEqual(m["scene"], "selected")
        self.assertEqual(m["width"], "1920")
        self.assertEqual(m["theme"], "light")

    def test_other_format_uses_stem_as_label(self) -> None:
        m = upload_screenshot.parse_screenshot_meta("network-errors-list.png")
        self.assertEqual(m["type"], "other")
        self.assertEqual(m["label"], "network-errors-list")

    def test_other_format_no_theme_suffix(self) -> None:
        m = upload_screenshot.parse_screenshot_meta("my-scenario-overview.png")
        self.assertEqual(m["type"], "other")
        self.assertNotIn("scene", m)

    def test_other_format_wrong_theme(self) -> None:
        m = upload_screenshot.parse_screenshot_meta("foo-1280-purple.png")
        self.assertEqual(m["type"], "other")


class BuildCatalogEntriesTests(unittest.TestCase):
    def test_review_entries_parsed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            imgs = [Path(tmp) / "requests-1280-dark.png"]
            for p in imgs:
                p.write_bytes(b"")
            entries = upload_screenshot.build_catalog_entries(
                imgs, "reviews/PRO-408", None
            )
        self.assertEqual(len(entries), 1)
        e = entries[0]
        self.assertEqual(e["type"], "review")
        self.assertEqual(e["scene"], "requests")
        self.assertEqual(e["width"], "1280")
        self.assertEqual(e["theme"], "dark")
        self.assertIn("reviews/PRO-408/requests-1280-dark.png", e["url"])

    def test_entries_url_format(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            imgs = [Path(tmp) / "shot.png"]
            imgs[0].write_bytes(b"")
            entries = upload_screenshot.build_catalog_entries(
                imgs, "bestiary/2026-06-15", None
            )
        self.assertEqual(
            entries[0]["url"],
            "https://protospy-dev-data.s3.amazonaws.com/bestiary/2026-06-15/shot.png",
        )


class GenerateCatalogHtmlTests(unittest.TestCase):
    def test_html_contains_title(self) -> None:
        html = upload_screenshot.generate_catalog_html([], "reviews · PRO-408")
        self.assertIn("reviews · PRO-408", html)

    def test_html_no_unresolved_placeholders(self) -> None:
        html = upload_screenshot.generate_catalog_html([], "test")
        self.assertNotIn("__TITLE__", html)
        self.assertNotIn("__DATA_JSON__", html)

    def test_html_embeds_entries_as_json(self) -> None:
        entries = [{"type": "review", "scene": "foo", "width": "1280",
                    "theme": "dark", "url": "https://example.com/foo.png",
                    "filename": "foo-1280-dark.png"}]
        html = upload_screenshot.generate_catalog_html(entries, "t")
        self.assertIn('"scene"', html)
        self.assertIn('"foo"', html)

    def test_html_is_valid_document(self) -> None:
        html = upload_screenshot.generate_catalog_html([], "t")
        self.assertTrue(html.strip().startswith("<!DOCTYPE html>"))
        self.assertIn("</html>", html)

    def test_html_script_tag_safe(self) -> None:
        """</script> in a value must not break the embedding script block."""
        entries = [{"type": "other", "label": "</script><script>alert(1)</script>",
                    "url": "https://example.com/x.png", "filename": "x.png"}]
        html = upload_screenshot.generate_catalog_html(entries, "t")
        self.assertNotIn("</script><script>", html)
        self.assertIn("\\u003c/script\\u003e", html)


class UploadCatalogTests(unittest.TestCase):
    def test_catalog_uploads_to_index_html(self) -> None:
        mock_client = MagicMock()
        url = upload_screenshot.upload_catalog(
            mock_client, "reviews/PRO-408", [], "test"
        )
        mock_client.put_object.assert_called_once()
        call_kwargs = mock_client.put_object.call_args.kwargs
        self.assertEqual(call_kwargs["Bucket"], "protospy-dev-data")
        self.assertEqual(call_kwargs["Key"], "reviews/PRO-408/index.html")
        self.assertIn("text/html", call_kwargs["ContentType"])
        self.assertEqual(
            url,
            "https://protospy-dev-data.s3.amazonaws.com/reviews/PRO-408/index.html",
        )

    def test_catalog_html_body_contains_title(self) -> None:
        mock_client = MagicMock()
        upload_screenshot.upload_catalog(mock_client, "b/date", [], "my title")
        body = mock_client.put_object.call_args.kwargs["Body"]
        self.assertIn(b"my title", body)


class MainPrefixTests(unittest.TestCase):
    def test_prefix_without_branch_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.png"
            img.write_bytes(b"")
            mock_boto3 = MagicMock()
            mock_boto3.client.return_value = MagicMock()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                with patch("sys.stdout", new_callable=io.StringIO):
                    result = upload_screenshot.main([tmp, "--prefix", "reviews/PRO-408"])
            self.assertEqual(result, 0)

    def test_prefix_key_no_subdir(self) -> None:
        """With --prefix, directory name is not appended to the S3 key."""
        with tempfile.TemporaryDirectory() as tmp:
            before_dir = Path(tmp) / "before"
            before_dir.mkdir()
            img = before_dir / "shot.png"
            img.write_bytes(b"")
            mock_boto3 = MagicMock()
            mock_client = MagicMock()
            mock_boto3.client.return_value = mock_client
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                with patch("sys.stdout", new_callable=io.StringIO):
                    upload_screenshot.main(
                        [str(before_dir), "--prefix", "reviews/PRO-408"]
                    )
            uploaded_key = mock_client.upload_file.call_args.args[2]
            self.assertEqual(uploaded_key, "reviews/PRO-408/shot.png")
            self.assertNotIn("before", uploaded_key)

    def test_branch_still_appends_subdir(self) -> None:
        """--branch retains the subdir-in-key behavior for before/after namespacing."""
        with tempfile.TemporaryDirectory() as tmp:
            before_dir = Path(tmp) / "before"
            before_dir.mkdir()
            img = before_dir / "shot.png"
            img.write_bytes(b"")
            mock_boto3 = MagicMock()
            mock_client = MagicMock()
            mock_boto3.client.return_value = mock_client
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                with patch("sys.stdout", new_callable=io.StringIO):
                    upload_screenshot.main(
                        [str(before_dir), "--branch", "my-branch"]
                    )
            uploaded_key = mock_client.upload_file.call_args.args[2]
            self.assertIn("before", uploaded_key)


class MainCatalogTests(unittest.TestCase):
    def test_catalog_flag_uploads_html_and_prints_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "requests-1280-dark.png"
            img.write_bytes(b"")
            mock_boto3 = MagicMock()
            mock_client = MagicMock()
            mock_boto3.client.return_value = mock_client
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
                    result = upload_screenshot.main(
                        [tmp, "--prefix", "reviews/PRO-408", "--catalog"]
                    )
            self.assertEqual(result, 0)
            output = mock_out.getvalue()
            self.assertIn("Catalog:", output)
            self.assertIn("index.html", output)
            # HTML uploaded via put_object
            mock_client.put_object.assert_called_once()

    def test_catalog_url_in_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "shot.png"
            img.write_bytes(b"")
            mock_boto3 = MagicMock()
            mock_boto3.client.return_value = MagicMock()
            with patch.dict("sys.modules", {"boto3": mock_boto3}):
                with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
                    upload_screenshot.main(
                        [tmp, "--prefix", "bestiary/2026-06-15", "--catalog"]
                    )
            output = mock_out.getvalue()
            self.assertIn(
                "https://protospy-dev-data.s3.amazonaws.com"
                "/bestiary/2026-06-15/index.html",
                output,
            )


class ReadMatrixTests(unittest.TestCase):
    def test_reads_filenames(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            m = Path(tmp) / "matrix.txt"
            m.write_text("a-1280-dark.png\nb-1280-dark.png\n")
            self.assertEqual(
                upload_screenshot.read_matrix(m),
                ["a-1280-dark.png", "b-1280-dark.png"],
            )

    def test_ignores_blank_and_comment_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            m = Path(tmp) / "matrix.txt"
            m.write_text("# header\n\na-1280-dark.png\n  \n# note\nb-1280-dark.png\n")
            self.assertEqual(
                upload_screenshot.read_matrix(m),
                ["a-1280-dark.png", "b-1280-dark.png"],
            )

    def test_strips_whitespace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            m = Path(tmp) / "matrix.txt"
            m.write_text("  a-1280-dark.png  \n")
            self.assertEqual(upload_screenshot.read_matrix(m), ["a-1280-dark.png"])


class MatrixWarningsTests(unittest.TestCase):
    def test_no_warnings_when_set_matches(self) -> None:
        names = ["a-1280-dark.png", "b-1280-dark.png"]
        self.assertEqual(upload_screenshot.matrix_warnings(names, names), [])

    def test_extra_file_warned_as_stale(self) -> None:
        warnings = upload_screenshot.matrix_warnings(
            ["a-1280-dark.png", "stale-1280-dark.png"],
            ["a-1280-dark.png"],
        )
        self.assertEqual(len(warnings), 1)
        self.assertIn("stale-1280-dark.png", warnings[0])
        self.assertIn("not in the matrix manifest", warnings[0])

    def test_missing_file_warned(self) -> None:
        warnings = upload_screenshot.matrix_warnings(
            ["a-1280-dark.png"],
            ["a-1280-dark.png", "b-1280-dark.png"],
        )
        self.assertEqual(len(warnings), 1)
        self.assertIn("b-1280-dark.png", warnings[0])
        self.assertIn("was not captured", warnings[0])

    def test_extra_and_missing_both_warned(self) -> None:
        warnings = upload_screenshot.matrix_warnings(
            ["a-1280-dark.png", "stale-1280-dark.png"],
            ["a-1280-dark.png", "b-1280-dark.png"],
        )
        self.assertEqual(len(warnings), 2)
        joined = "\n".join(warnings)
        self.assertIn("stale-1280-dark.png", joined)
        self.assertIn("b-1280-dark.png", joined)

    def test_warnings_sorted(self) -> None:
        warnings = upload_screenshot.matrix_warnings(
            ["z-1280-dark.png", "a-1280-dark.png"],
            [],
        )
        self.assertEqual(len(warnings), 2)
        self.assertIn("a-1280-dark.png", warnings[0])
        self.assertIn("z-1280-dark.png", warnings[1])


class MatrixFlagMainTests(unittest.TestCase):
    def _run(self, argv: list[str]):
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value = MagicMock()
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            with patch("sys.stderr", new_callable=io.StringIO) as mock_err:
                result = upload_screenshot.main(argv)
        return result, mock_err.getvalue()

    def test_matrix_mismatch_warns_but_still_uploads(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "after"
            d.mkdir()
            (d / "a-1280-dark.png").write_bytes(b"")
            (d / "stale-1280-dark.png").write_bytes(b"")
            m = Path(tmp) / "matrix.txt"
            m.write_text("a-1280-dark.png\nb-1280-dark.png\n")
            result, err = self._run([str(d), "--branch", "feat", "--matrix", str(m)])
            self.assertEqual(result, 0)
            self.assertIn("stale-1280-dark.png", err)
            self.assertIn("b-1280-dark.png", err)

    def test_matrix_match_no_warnings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "after"
            d.mkdir()
            (d / "a-1280-dark.png").write_bytes(b"")
            m = Path(tmp) / "matrix.txt"
            m.write_text("a-1280-dark.png\n")
            result, err = self._run([str(d), "--branch", "feat", "--matrix", str(m)])
            self.assertEqual(result, 0)
            self.assertNotIn("warning:", err)

    def test_missing_matrix_file_warns_and_continues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "after"
            d.mkdir()
            (d / "a-1280-dark.png").write_bytes(b"")
            result, err = self._run(
                [str(d), "--branch", "feat", "--matrix", str(Path(tmp) / "nope.txt")]
            )
            self.assertEqual(result, 0)
            self.assertIn("matrix file", err)
            self.assertIn("skipping matrix check", err)


if __name__ == "__main__":
    unittest.main()
