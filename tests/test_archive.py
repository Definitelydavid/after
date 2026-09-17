"""Behavioral acceptance tests; temporary roots never mutate the real archive."""
import copy
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("archive", Path(__file__).resolve().parents[1] / "tools/archive.py")
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)


class Tags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
    def handle_starttag(self, tag, attrs): self.tags.append((tag, dict(attrs)))


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "entries").mkdir()
        self.project = {"name": "AFTER", "repository_url": None, "site_url": None, "status": "local-preview"}
        self.people = {"contributors": [
            {"id": "after-seed-agent", "name": "Seed", "kind": "agent", "url": None},
            {"id": "after-editor-agent", "name": "Editor", "kind": "agent", "url": None},
            {"id": "person", "name": "Person", "kind": "human", "url": None},
            {"id": "unused-person", "name": "Unused person", "kind": "human", "url": None},
            {"id": "collective", "name": "Collective", "kind": "organization", "url": None}]}
        self.entry = {"id": "first-guide", "title": "A short original guide", "topic": "files", "summary": "A concise guide.", "body": "Keep two copies of an original file. Check that both copies open before relying on them.", "author_id": "after-seed-agent", "created_at": "2025-01-01", "updated_at": "2025-01-02", "license": "CC-BY-4.0", "sources": [{"title": "Documentation", "url": "https://www.python.org/", "accessed": "2025-01-02"}], "review": {"kind": "agent-review", "reviewer_id": "after-editor-agent", "reviewed_at": "2025-01-03", "scope": "Checked readability and source relevance; no independent factual verification."}}
        self.write("project.json", self.project)
        self.write("contributors.json", self.people)
        self.save()

    def write(self, name, obj):
        (self.root / name).write_text(json.dumps(obj), encoding="utf-8")

    def save(self): self.write("entries/first-guide.json", self.entry)

    def reject(self):
        self.save()
        with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def second(self, author="person"):
        e = copy.deepcopy(self.entry)
        e.update(id="second-guide", title="A different guide", body="Use descriptive filenames to distinguish drafts from final files. Add a date when chronology matters.", author_id=author)
        self.write("entries/second-guide.json", e)
        return e

    def test_valid_concise_original_guide(self):
        catalog, metrics = archive.prepare(self.root)
        self.assertEqual(catalog["entries"][0], self.entry)
        self.assertEqual(metrics["published_entries"], 1)
        self.assertEqual(catalog["generated_at"], "2025-01-03T00:00:00Z")

    def test_malformed_json_duplicate_keys_and_nonfinite(self):
        for raw in ('{', '{"id":"first","id":"second"}', '{"number":NaN}', '[1,2,3]'):
            with self.subTest(raw=raw):
                (self.root / "entries/first-guide.json").write_text(raw)
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def test_schema_and_field_types(self):
        original = copy.deepcopy(self.entry)
        changes = {"id": "Uppercase", "topic": "two words", "summary": [], "body": "short", "license": "unknown", "sources": [], "review": {}, "updated_at": None, "author_id": "unknown"}
        for field, value in changes.items():
            with self.subTest(field=field):
                self.entry = {**original, field: value}
                self.reject()
        self.entry = {**original, "extra": "not allowed"}
        self.reject()

    def test_review_identity_kind_and_dates(self):
        for change in ({"reviewer_id": "after-seed-agent"}, {"reviewer_id": "unknown"}, {"kind": "human-review"}, {"kind": []}, {"reviewed_at": "2025-01-01"}, {"reviewed_at": "9999-01-01"}, {"scope": ""}):
            with self.subTest(change=change):
                e = copy.deepcopy(self.entry)
                e["review"].update(change)
                self.write("entries/first-guide.json", e)
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def test_dates_are_real_nonfuture_and_ordered(self):
        for field, value in (("created_at", "2025-02-30"), ("updated_at", "9999-01-01"), ("created_at", "2025-01-03"), ("updated_at", "2025-1-2")):
            with self.subTest(field=field, value=value):
                e = {**self.entry, field: value}
                self.write("entries/first-guide.json", e)
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)
        self.entry["sources"][0]["accessed"] = "9999-01-01"
        self.reject()

    def test_private_and_unsafe_urls(self):
        urls = ["http://www.python.org/", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://u:p@www.python.org/", "https://www.python.org@127.0.0.1/", "https://127.0.0.1/", "https://10.1.2.3/", "https://192.168.1.1/", "https://169.254.169.254/", "https://100.64.1.1/", "https://224.0.0.1/", "https://[::1]/", "https://[fc00::1]/", "https://[fe80::1]/", "https://[::ffff:127.0.0.1]/", "https://localhost/", "https://foo.localhost./", "https://foo.local/", "https://foo.internal/", "https://intranet/", "https://127.1/", "https://2130706433/", "https://0x7f000001/", "https://0x7f.0x0.0x0.0x1/", "https://www.python.org:22/", "https://www.python.org\\@evil.org/", "https://www.python.org/\n", "https://www.python.org/%zz", "https://-bad.python.org/", "https://[::1%25eth0]/"]
        for url in urls:
            with self.subTest(url=url), self.assertRaises(archive.Invalid): archive.public_url(url)
        self.assertEqual(archive.public_url("https://[2606:4700:4700::1111]/"), "https://[2606:4700:4700::1111]/")
        self.assertEqual(archive.public_url("https://abc.de/"), "https://abc.de/")

    def test_normalized_url_deduplication(self):
        self.assertEqual(archive.public_url("HTTPS://WWW.PYTHON.ORG:443/a/../%7Eguide#section"), "https://www.python.org/~guide")
        self.assertEqual(archive.public_url("https://www.python.org/a%2Fb?q=%2f"), "https://www.python.org/a%2Fb?q=%2F")
        self.entry["sources"].append({"title": "Same URL", "url": "HTTPS://WWW.PYTHON.ORG:443/#different", "accessed": "2025-01-02"})
        self.reject()

    def test_duplicate_content_and_titles(self):
        e = self.second()
        for field in ("body", "title"):
            with self.subTest(field=field):
                duplicate = {**e, field: "  " + self.entry[field].upper().replace(" ", "\n ") + "  "}
                self.write("entries/second-guide.json", duplicate)
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def test_metrics_count_only_published_authors_and_unique_sources(self):
        e = self.second()
        e["review"] = {**e["review"], "kind": "human-review", "reviewer_id": "unused-person"}
        e["sources"][0]["url"] = "HTTPS://WWW.PYTHON.ORG:443/#another"
        self.write("entries/second-guide.json", e)
        _, m = archive.prepare(self.root)
        self.assertEqual(m["authors"], {"human": 1, "agent": 1, "organization": 0, "total": 2})
        self.assertEqual(m["reviews"], {"human": 1, "agent": 1})
        self.assertEqual(m["source_references"], 1)
        self.assertEqual(m["topics"], [{"id": "files", "entries": 2}])
        self.assertEqual(m["words"], len(self.entry["body"].split()) + len(e["body"].split()))
        self.assertIsNone(m["external"]["forks"])

    def test_deterministic_build_and_digest(self):
        c1, _ = archive.build(self.root)
        before = {p.name: p.read_bytes() for p in (self.root / "docs").iterdir()}
        self.people["contributors"].reverse()
        self.write("contributors.json", self.people)
        (self.root / "entries/first-guide.json").write_text(json.dumps(self.entry, sort_keys=True, indent=4))
        c2, _ = archive.build(self.root)
        self.assertEqual(c1, c2)
        self.assertEqual(before, {p.name: p.read_bytes() for p in (self.root / "docs").iterdir()})
        for line in (self.root / "docs/SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ")
            self.assertEqual(digest, hashlib.sha256((self.root / "docs" / name).read_bytes()).hexdigest())
        self.entry["body"] += " Keep the original too."
        self.save()
        self.assertNotEqual(c1["content_sha256"], archive.prepare(self.root)[0]["content_sha256"])

    def test_unused_contributors_and_publication_config_do_not_invent_content_growth(self):
        original = archive.prepare(self.root)[0]["content_sha256"]
        self.people["contributors"][-2]["name"] = "Renamed unused person"
        self.write("contributors.json", self.people)
        self.project.update(status="published", repository_url="https://github.com/example/after")
        self.write("project.json", self.project)
        self.assertEqual(original, archive.prepare(self.root)[0]["content_sha256"])
        self.people["contributors"][0]["name"] = "Renamed published author"
        self.write("contributors.json", self.people)
        self.assertNotEqual(original, archive.prepare(self.root)[0]["content_sha256"])

    def test_snapshot_idempotence_and_real_growth_or_regression(self):
        self.assertTrue(archive.snapshot(self.root))
        self.assertFalse(archive.snapshot(self.root))
        archive.build(self.root)
        self.assertEqual(len(archive.history(self.root)), 1)
        self.second()
        self.assertTrue(archive.snapshot(self.root))
        records = archive.prepare(self.root)[1]["history"]
        self.assertEqual([r["published_entries"] for r in records], [1, 2])
        (self.root / "entries/first-guide.json").unlink()
        self.assertTrue(archive.snapshot(self.root))
        self.assertEqual([r["published_entries"] for r in archive.history(self.root)], [1, 2, 1])
        self.assertEqual(len(list((self.root / "history").glob("*.json"))), 3)

    def test_html_rejects_executable_markup_and_escapes_everywhere(self):
        for text in ('<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<!-- a -->', '</script><script>alert(1)</script>'):
            with self.subTest(text=text):
                e = {**self.entry, "body": text + " padding to exceed minimum body length"}
                self.write("entries/first-guide.json", e)
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)
        self.entry["body"] = 'Keep text such as 2 < 3 & 4 > 1 in the original. Quotes " and entities &lt;script&gt; remain text.'
        self.entry["sources"][0]["url"] = 'https://www.python.org/?q="onclick="alert(1)&x=2'
        self.save()
        catalog, _ = archive.build(self.root)
        markup = (self.root / "docs/after-archive.html").read_text()
        self.assertIn("2 &lt; 3 &amp; 4 &gt; 1", markup)
        parser = Tags(); parser.feed(markup)
        self.assertEqual([a for t, a in parser.tags if t == "script"], [{"type": "application/json", "id": "after-catalog"}])
        self.assertFalse(any(k.startswith("on") for _, attrs in parser.tags for k in attrs))
        self.assertFalse(any(t in {"img", "iframe", "object", "embed", "link"} for t, _ in parser.tags))
        embedded = markup.split('<script type="application/json" id="after-catalog">')[1].split('</script>')[0]
        self.assertEqual(json.loads(embedded), catalog)
        self.assertNotIn("<", embedded)

    def test_offline_export_is_complete_without_fetching(self):
        c, m = archive.build(self.root)
        self.assertEqual(json.loads((self.root / "docs/after-archive.json").read_text()), c)
        markup = (self.root / "docs/after-archive.html").read_text()
        self.assertIn(self.entry["body"], markup)
        self.assertIn(self.entry["review"]["scope"], markup)
        self.assertIn("Source links require connectivity", markup)
        self.assertNotIn("fetch(", markup)
        parser = Tags(); parser.feed(markup)
        self.assertFalse(any("src" in attrs for _, attrs in parser.tags))
        self.assertTrue(any(tag == "a" and attrs.get("href") == "https://creativecommons.org/licenses/by/4.0/" for tag, attrs in parser.tags))
        self.assertEqual(c["content_sha256"], m["content_sha256"])

    def test_empty_archive_is_honest(self):
        (self.root / "entries/first-guide.json").unlink()
        c, m = archive.build(self.root)
        self.assertEqual(m["published_entries"], 0)
        self.assertEqual(m["authors"]["total"], 0)
        self.assertIsNone(c["generated_at"])
        self.assertIn("No published entries yet", (self.root / "docs/after-archive.html").read_text())

    def test_invalid_inputs_never_overwrite_existing_exports(self):
        archive.build(self.root)
        original = (self.root / "docs/catalog.json").read_bytes()
        self.entry["author_id"] = "unknown"
        self.save()
        with self.assertRaises(archive.Invalid): archive.build(self.root)
        self.assertEqual(original, (self.root / "docs/catalog.json").read_bytes())

    def test_symlinks_and_oversized_files_rejected(self):
        entry_path = self.root / "entries/first-guide.json"
        target = self.root / "actual.json"
        entry_path.rename(target)
        entry_path.symlink_to(target)
        with self.assertRaises(archive.Invalid): archive.prepare(self.root)
        entry_path.unlink()
        entry_path.write_text(" " * (archive.MAX_FILE_BYTES + 1))
        with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def test_organization_counts_and_registry_validation(self):
        self.second(author="collective")
        self.assertEqual(archive.prepare(self.root)[1]["authors"], {"human": 0, "agent": 1, "organization": 1, "total": 2})
        for kind in ([], "human", None):
            with self.subTest(kind=kind):
                people = copy.deepcopy(self.people)
                people["contributors"][0]["kind"] = kind
                self.write("contributors.json", people)
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def test_history_rejects_invalid_counts_and_future_records(self):
        archive.snapshot(self.root)
        path = next((self.root / "history").glob("*.json"))
        original = json.loads(path.read_text())
        for field, value in (("topics", 100), ("published_entries", True), ("created_at", "9999-01-01T00:00:00Z"), ("created_at", "2025-01-01T00:00:00"), ("authors", {"human": 1, "agent": 1, "organization": 0, "total": 1})):
            with self.subTest(field=field, value=value):
                path.write_text(json.dumps({**original, field: value}))
                with self.assertRaises(archive.Invalid): archive.prepare(self.root)

    def test_cli_root_and_errors(self):
        result = subprocess.run([sys.executable, str(Path(archive.__file__)), "snapshot", "--root", str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Snapshot recorded", result.stdout)
        self.assertTrue((self.root / "docs/SHA256SUMS").exists())
        self.entry["review"]["reviewer_id"] = self.entry["author_id"]
        self.save()
        result = subprocess.run([sys.executable, str(Path(archive.__file__)), "validate", "--root", str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("reviewer must differ", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__": unittest.main()
