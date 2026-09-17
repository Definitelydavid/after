#!/usr/bin/env python3
"""AFTER's dependency-free, offline archive validator and reproducible builder."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timezone
import hashlib
import html
import ipaddress
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import quote, unquote, urlsplit, urlunsplit

SCHEMA = 1
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
HTML = re.compile(r"<\s*(?:/?[a-zA-Z][^>]*|!|\?)", re.S)
ENTRY_KEYS = {"id", "title", "topic", "summary", "body", "author_id", "created_at", "updated_at", "license", "sources", "review"}
MAX_FILE_BYTES = 256_000


class Invalid(ValueError):
    """A public input failed validation; no submitted code is ever evaluated."""


def require(condition, message):
    if not condition:
        raise Invalid(message)


def keys(value, expected, label):
    require(isinstance(value, dict), f"{label}: expected object")
    require(set(value) == expected, f"{label}: expected fields {', '.join(sorted(expected))}")


def plain(value, label, maximum=1000, minimum=1):
    require(isinstance(value, str), f"{label}: expected text")
    value = unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n")).strip()
    require(minimum <= len(value) <= maximum, f"{label}: requires {minimum}–{maximum} characters")
    require(not HTML.search(value), f"{label}: HTML is not permitted")
    require(all(c in "\n\t" or unicodedata.category(c) not in {"Cc", "Cf", "Cs"} for c in value), f"{label}: control characters are not permitted")
    return value


def slug(value, label):
    require(isinstance(value, str) and len(value) <= 100 and SLUG.fullmatch(value), f"{label}: expected lowercase hyphen slug")
    return value


def day(value, label):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value), f"{label}: expected YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise Invalid(f"{label}: invalid date") from exc
    require(parsed <= datetime.now(timezone.utc).date(), f"{label}: future dates are not permitted")
    return value


def public_url(value, label="url"):
    require(isinstance(value, str) and 1 <= len(value) <= 2048, f"{label}: expected HTTPS URL")
    require(not any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value) and "\\" not in value, f"{label}: unsafe URL characters")
    require(not re.search(r"%(?![0-9a-fA-F]{2})", value), f"{label}: invalid percent escape")
    try:
        parts = urlsplit(value)
        host = parts.hostname
        port = parts.port
        require(parts.scheme.lower() == "https" and host and parts.username is None and parts.password is None, f"{label}: only public HTTPS without credentials")
        require(port in (None, 443), f"{label}: only standard HTTPS port 443")
        host = host.rstrip(".").encode("idna").decode("ascii").lower()
        require("%" not in host, f"{label}: scoped or escaped hosts are not permitted")
        try:
            addr = ipaddress.ip_address(host)
        except ValueError:
            require("." in host and not host.endswith((".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".home", ".lan")), f"{label}: local/reserved host")
            require(re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host) and all(1 <= len(x) <= 63 and not x.startswith("-") and not x.endswith("-") for x in host.split(".")), f"{label}: invalid hostname")
            require(not re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|[0-9]+))*", host) and not host.split(".")[-1].isdigit(), f"{label}: ambiguous numeric host")
        else:
            require(addr.is_global and not addr.is_multicast and not addr.is_unspecified and not addr.is_reserved and not (getattr(addr, "ipv4_mapped", None) and not addr.ipv4_mapped.is_global), f"{label}: nonpublic address")
            host = f"[{addr.compressed}]" if addr.version == 6 else str(addr)
        # Preserve query order/values (which may be meaningful), discard fragments.
        # Normalize unreserved percent escapes; quote any raw Unicode safely.
        def normalize(segment):
            segment = re.sub(r"%([0-9a-fA-F]{2})", lambda m: chr(int(m[1], 16)) if chr(int(m[1], 16)) in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~" else "%" + m[1].upper(), segment)
            return quote(segment, safe="/%:@!$&'()*+,;=-._~?")
        path = normalize(parts.path or "/")
        # RFC 3986 dot-segments do not identify different source pages.
        segments = []
        for segment in path.split("/"):
            if segment == "..":
                if segments: segments.pop()
            elif segment != ".":
                segments.append(segment)
        path = "/".join(segments)
        if not path.startswith("/"): path = "/" + path
        if parts.path.endswith(("/.", "/..")) and not path.endswith("/"): path += "/"
        return urlunsplit(("https", host, path, normalize(parts.query), ""))
    except (ValueError, UnicodeError) as exc:
        if isinstance(exc, Invalid): raise
        raise Invalid(f"{label}: malformed URL") from exc


def no_duplicate_keys(pairs):
    obj = {}
    for key, value in pairs:
        require(key not in obj, f"duplicate JSON key: {key}")
        obj[key] = value
    return obj


def read_json(path):
    try:
        require(not path.is_symlink(), f"{path.name}: symlinks are not public input")
        require(path.stat().st_size <= MAX_FILE_BYTES, f"{path.name}: file exceeds {MAX_FILE_BYTES} bytes")
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys, parse_constant=lambda x: (_ for _ in ()).throw(Invalid(f"invalid JSON constant: {x}")))
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise Invalid(f"{path.name}: cannot read valid UTF-8 JSON ({exc})") from exc


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def content_digest(entries, contributors):
    used = {e["author_id"] for e in entries} | {e["review"]["reviewer_id"] for e in entries}
    return hashlib.sha256(canonical({"schema_version": SCHEMA, "entries": entries, "contributors": [c for c in contributors if c["id"] in used]})).hexdigest()


def load(root):
    project = read_json(root / "project.json")
    keys(project, {"name", "repository_url", "site_url", "status"}, "project")
    require(project["name"] == "AFTER", "project.name must be AFTER")
    require(isinstance(project["status"], str) and project["status"] in {"local-preview", "published"}, "project.status: local-preview or published")
    for field in ("repository_url", "site_url"):
        if project[field] is not None: project[field] = public_url(project[field], f"project.{field}")
    require(project["status"] != "local-preview" or project["repository_url"] is None and project["site_url"] is None, "local-preview URLs must be null")
    require(project["status"] != "published" or project["repository_url"] is not None, "published project requires repository_url")
    registry = read_json(root / "contributors.json")
    keys(registry, {"contributors"}, "contributors")
    require(isinstance(registry["contributors"], list), "contributors must be an array")
    contributors, by_id = [], {}
    for contributor in registry["contributors"]:
        keys(contributor, {"id", "name", "kind", "url"}, "contributor")
        c = dict(contributor)
        c["id"] = slug(c["id"], "contributor.id")
        c["name"] = plain(c["name"], "contributor.name", 160)
        require(isinstance(c["kind"], str) and c["kind"] in {"human", "agent", "organization"}, "contributor.kind: invalid kind")
        require(c["id"] not in by_id, f"duplicate contributor: {c['id']}")
        if c["url"] is not None: c["url"] = public_url(c["url"], "contributor.url")
        if c["id"] in {"after-seed-agent", "after-editor-agent"}: require(c["kind"] == "agent", "seed/editor IDs must disclose agent kind")
        by_id[c["id"]] = c
        contributors.append(c)
    contributors.sort(key=lambda c: c["id"])
    entries, ids, bodies, titles = [], set(), set(), set()
    require((root / "entries").is_dir() and not (root / "entries").is_symlink(), "entries must be a real directory")
    for path in sorted((root / "entries").iterdir()):
        if path.name.startswith("."): continue
        require(path.suffix == ".json" and path.is_file(), f"entries/{path.name}: only JSON entry files are allowed")
        e = read_json(path)
        keys(e, ENTRY_KEYS, path.name)
        for field in ("id", "topic", "author_id"): e[field] = slug(e[field], f"{path.name}.{field}")
        require(path.stem == e["id"], f"{path.name}: filename must match entry id")
        require(e["id"] not in ids, "duplicate entry id")
        ids.add(e["id"])
        for field, maximum, minimum in (("title", 160, 3), ("summary", 800, 1), ("body", 100_000, 30)):
            e[field] = plain(e[field], f"{path.name}.{field}", maximum, minimum)
        for field, seen in (("body", bodies), ("title", titles)):
            signature = " ".join(e[field].split()).casefold()
            require(signature not in seen, f"{path.name}: duplicate {field}")
            seen.add(signature)
        require(e["author_id"] in by_id, f"{path.name}: unknown author")
        require(e["license"] == "CC-BY-4.0", f"{path.name}: license must be CC-BY-4.0")
        day(e["created_at"], "created_at"); day(e["updated_at"], "updated_at")
        require(e["created_at"] <= e["updated_at"], "updated_at precedes created_at")
        require(isinstance(e["sources"], list) and 1 <= len(e["sources"]) <= 40, "sources: requires 1–40 source objects")
        urls = set()
        for source in e["sources"]:
            keys(source, {"title", "url", "accessed"}, "source")
            source["title"] = plain(source["title"], "source.title", 240)
            source["url"] = public_url(source["url"], "source.url")
            day(source["accessed"], "source.accessed")
            require(source["url"] not in urls, f"{path.name}: duplicate canonical source URL")
            urls.add(source["url"])
        e["sources"].sort(key=lambda s: (s["url"], s["title"]))
        r = e["review"]
        keys(r, {"kind", "reviewer_id", "reviewed_at", "scope"}, "review")
        require(isinstance(r["kind"], str) and r["kind"] in {"human-review", "agent-review"}, "review.kind invalid")
        slug(r["reviewer_id"], "review.reviewer_id")
        require(r["reviewer_id"] in by_id, "unknown reviewer")
        require(r["reviewer_id"] != e["author_id"], "reviewer must differ from author")
        require(by_id[r["reviewer_id"]]["kind"] == r["kind"].removesuffix("-review"), "review kind must match declared reviewer kind")
        day(r["reviewed_at"], "review.reviewed_at")
        require(r["reviewed_at"] >= e["updated_at"], "review must cover the latest updated_at")
        r["scope"] = plain(r["scope"], "review.scope", 2000, 8)
        entries.append(e)
    return project, contributors, sorted(entries, key=lambda e: e["id"])


def author_counts(entries, contributors):
    by_id = {c["id"]: c for c in contributors}
    counts = Counter(by_id[author]["kind"] for author in {e["author_id"] for e in entries})
    return {**{kind: counts[kind] for kind in ("human", "agent", "organization")}, "total": sum(counts.values())}


def history(root):
    records, digests = [], set()
    directory = root / "history"
    if not directory.exists(): return records
    require(directory.is_dir() and not directory.is_symlink(), "history must be a real directory")
    for path in sorted(directory.glob("*.json")):
        record = read_json(path)
        keys(record, {"created_at", "content_sha256", "published_entries", "topics", "authors"}, "snapshot")
        require(isinstance(record["created_at"], str), "snapshot timestamp must be text")
        try:
            timestamp = datetime.fromisoformat(record["created_at"].replace("Z", "+00:00"))
            require(timestamp.tzinfo is not None and timestamp <= datetime.now(timezone.utc), "snapshot timestamp must be timezone-aware and not future")
        except ValueError as exc: raise Invalid("invalid snapshot timestamp") from exc
        digest = record["content_sha256"]
        require(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest), "invalid snapshot digest")
        require(digest not in digests, "duplicate snapshot content digest")
        require(path.stem == digest, "snapshot filename must match content digest")
        digests.add(digest)
        for field in ("published_entries", "topics"):
            require(type(record[field]) is int and record[field] >= 0, f"snapshot {field} must be nonnegative integer")
        keys(record["authors"], {"human", "agent", "organization", "total"}, "snapshot authors")
        require(all(type(n) is int and n >= 0 for n in record["authors"].values()), "invalid snapshot author counts")
        require(sum(record["authors"][k] for k in ("human", "agent", "organization")) == record["authors"]["total"], "snapshot author total mismatch")
        require(record["topics"] <= record["published_entries"] and record["authors"]["total"] <= record["published_entries"], "snapshot counts exceed entry count")
        records.append(record)
    return sorted(records, key=lambda r: (r["created_at"], r["content_sha256"]))


def prepare(root):
    project, contributors, entries = load(root)
    digest = content_digest(entries, contributors)
    dates = [value for e in entries for value in (e["created_at"], e["updated_at"], e["review"]["reviewed_at"], *(s["accessed"] for s in e["sources"]))]
    # A deterministic content timestamp, not a claim of wall-clock build time.
    generated_at = max(dates) + "T00:00:00Z" if dates else None
    catalog = {"schema_version": SCHEMA, "generated_at": generated_at, "content_sha256": digest, "project": project, "contributors": contributors, "entries": entries}
    topics = Counter(e["topic"] for e in entries)
    metrics = {"schema_version": SCHEMA, "generated_at": generated_at, "content_sha256": digest,
               "published_entries": len(entries), "topics": [{"id": t, "entries": n} for t, n in sorted(topics.items())],
               "words": sum(len(re.findall(r"\S+", e["body"])) for e in entries),
               "source_references": len({s["url"] for e in entries for s in e["sources"]}),
               "authors": author_counts(entries, contributors),
               "reviews": {kind: sum(e["review"]["kind"] == kind + "-review" for e in entries) for kind in ("human", "agent")},
               "history": history(root), "external": {"status": "unavailable", "as_of": None, "release_downloads": None, "forks": None}}
    return catalog, metrics


def offline_html(catalog, metrics):
    esc = html.escape
    people = {c["id"]: c for c in catalog["contributors"]}
    articles = []
    for e in catalog["entries"]:
        author, reviewer = people[e["author_id"]], people[e["review"]["reviewer_id"]]
        sources = "".join(f'<li><a href="{esc(s["url"], quote=True)}" rel="noreferrer noopener">{esc(s["title"])}</a> — accessed {s["accessed"]}</li>' for s in e["sources"])
        articles.append(f'<article id="{e["id"]}"><p class="eyebrow">{esc(e["topic"])}</p><h2>{esc(e["title"])}</h2><p>{esc(e["summary"])}</p><p class="byline">By {esc(author["name"])} · declared {author["kind"]} · {e["license"]} · updated {e["updated_at"]}</p><div class="body">{esc(e["body"])}</div><h3>Sources</h3><ul>{sources}</ul><p class="review">{e["review"]["kind"]} by {esc(reviewer["name"])} on {e["review"]["reviewed_at"]}: {esc(e["review"]["scope"])}</p></article>')
    toc = "".join(f'<li><a href="#{e["id"]}">{esc(e["title"])}</a></li>' for e in catalog["entries"])
    # Escape HTML delimiters even in non-executable application/json script data.
    embedded = canonical(catalog).decode("utf-8").replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>AFTER — offline archive</title><style>body{{max-width:850px;margin:0 auto;padding:40px 22px;background:#f4f1e8;color:#222;font:18px/1.65 Georgia,serif}}h1{{font-size:64px;letter-spacing:-3px;margin:0}}h2{{font-size:30px;line-height:1.2}}a{{color:#963c17;overflow-wrap:anywhere}}article{{border-top:1px solid #bbb;padding:32px 0}}.body{{white-space:pre-wrap;overflow-wrap:anywhere}}.eyebrow,.byline,.review,footer{{font:14px/1.6 system-ui,sans-serif}}.eyebrow{{text-transform:uppercase;color:#963c17}}code{{overflow-wrap:anywhere;font-size:12px}}@media(max-width:500px){{body{{padding:24px 16px}}h1{{font-size:48px}}}}</style></head><body><header><p class="eyebrow">A community-written backup</p><h1>AFTER</h1><p>{metrics['published_entries']} published entries · {len(metrics['topics'])} topics · {metrics['words']} content words</p><p>This file contains the full archive and works offline. Source links require connectivity. Author kinds are declared attribution, not identity verification. Publication and schema validation do not establish factual correctness.</p></header><nav aria-label="Archive contents"><ol>{toc}</ol></nav><main>{''.join(articles) if articles else '<p>No published entries yet.</p>'}</main><footer><p>Content: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noreferrer noopener">Creative Commons Attribution 4.0 International (CC BY 4.0)</a>; attribution appears with each entry. Indicate changes when adapting the text. Linked sources retain their own rights. Review scopes are stated per entry.</p><p>Content timestamp: {catalog['generated_at'] or 'none (empty archive)'}. Determined by the latest content/review/source date; this is not a build or release timestamp.</p><p>Content SHA-256: <code>{catalog['content_sha256']}</code></p></footer><script type="application/json" id="after-catalog">{embedded}</script></body></html>
'''.encode("utf-8")


def make_zip(catalog, metrics, html_data, root):
    import io, zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        fixed_time = (2026, 9, 17, 0, 0, 0)
        def add(name, data):
            info = zipfile.ZipInfo(name, fixed_time)
            info.external_attr = 0o644 << 16
            zf.writestr(info, data)
        add("after-archive.html", html_data)
        add("catalog.json", json_bytes(catalog))
        add("metrics.json", json_bytes(metrics))
        readme = root / "README.md"
        add("README.md", readme.read_bytes() if readme.exists() else b"# AFTER Archive\n")
        license_path = root / "CONTENT-LICENSE.md"
        add("CONTENT-LICENSE.md", license_path.read_bytes() if license_path.exists() else b"CC-BY-4.0\n")
        for e in catalog["entries"]:
            add(f"entries/{e['id']}.json", json_bytes(e))
    return buf.getvalue()


def build(root):
    catalog, metrics = prepare(root)
    docs = root / "docs"
    require(not docs.is_symlink(), "docs cannot be a symlink")
    docs.mkdir(exist_ok=True)
    html_data = offline_html(catalog, metrics)
    zip_data = make_zip(catalog, metrics, html_data, root)
    outputs = {"catalog.json": json_bytes(catalog), "metrics.json": json_bytes(metrics), "after-archive.json": json_bytes(catalog), "after-archive.html": html_data, "after-archive.zip": zip_data}
    for name in [*outputs, "SHA256SUMS"]:
        require(not (docs / name).is_symlink(), f"docs/{name} cannot be a symlink")
    for name, data in outputs.items(): (docs / name).write_bytes(data)
    checksums = [f"{hashlib.sha256(data).hexdigest()}  {name}" for name, data in sorted(outputs.items())]
    if (docs / "iiab-alexandria.zip").exists():
        iiab_hash = hashlib.sha256((docs / "iiab-alexandria.zip").read_bytes()).hexdigest()
        checksums.append(f"{iiab_hash}  iiab-alexandria.zip")
    (docs / "SHA256SUMS").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    return catalog, metrics


def snapshot(root):
    catalog, metrics = prepare(root)
    digest = catalog["content_sha256"]
    if any(r["content_sha256"] == digest for r in metrics["history"]): return False
    record = {"created_at": datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"), "content_sha256": digest, "published_entries": metrics["published_entries"], "topics": len(metrics["topics"]), "authors": metrics["authors"]}
    directory = root / "history"
    directory.mkdir(exist_ok=True)
    with (directory / f"{digest}.json").open("xb") as handle: handle.write(json_bytes(record))
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate", "build", "snapshot"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent, help="repo root (defaults to script parent-parent)")
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve()
        if args.command == "snapshot":
            added = snapshot(root)
            catalog, metrics = build(root)
            print("Snapshot recorded." if added else "Unchanged content; no snapshot added.")
        elif args.command == "build": catalog, metrics = build(root)
        else: catalog, metrics = prepare(root)
        print(f"Validated {metrics['published_entries']} entries; content SHA-256 {catalog['content_sha256']}")
        return 0
    except (Invalid, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
