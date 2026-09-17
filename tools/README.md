# AFTER archive tools

Python 3.9+ standard library only. Commands can run from any working directory:

```sh
python3 tools/archive.py validate
python3 tools/archive.py build
python3 tools/archive.py snapshot
python3 -m unittest discover -s tests -v
```

The default repository root is the script's parent-parent. To validate or build an isolated fixture, append `--root /path/to/repo`. Invalid submissions return exit status 1 and an explanatory error. No content or source code submitted through entries is executed. No network calls occur.

- `validate` validates all entries, contributor/project metadata and retained snapshot records. It writes nothing.
- `build` validates first, then writes `docs/catalog.json`, `metrics.json`, `after-archive.json`, `after-archive.html` and `SHA256SUMS`. It preserves the website source and does not invent history.
- `snapshot` explicitly records the current content digest once in `history/<digest>.json`, then rebuilds exports. Repeating a previous digest adds no record, even if it was last seen before an intervening change. Snapshot dates are actual UTC creation times. Entry totals may rise, remain equal or fall.

## Reproducibility and counts

Normalized entries are sorted by ID; sources and contributors have stable order. UTF-8 JSON has deterministic key order and formatting. `after-archive.json` and `catalog.json` are identical. `SHA256SUMS` covers the four generated archive/metrics files, not itself or the website source. From `docs/`, verify with `shasum -a 256 -c SHA256SUMS` on macOS or `sha256sum -c SHA256SUMS` on Linux.

`content_sha256` hashes compact canonical JSON containing schema version, normalized entries and the registry records of their authors and reviewers. It excludes unused contributors, publication configuration, history and timestamps of builds. Updating source attribution, a published author's metadata, content or review changes this digest. Editing an unused contributor or setting a real publication URL does not invent archive growth. Digest agreement binds the catalog and metrics to the same content; checksums additionally bind the complete output bytes.

`generated_at` is a **deterministic content-state timestamp**, the latest entry creation/update, review or source-access date at UTC midnight. It is not the time the builder ran, an assertion that the builder checked a source, or a release date. It is `null` for an empty archive. Retained snapshots use actual UTC creation timestamps. Identical inputs and history produce identical output bytes.

Words are whitespace-delimited body tokens. Topics count accepted entries per topic. Source references count unique canonical source URLs across published entries. Authors count distinct authors of published entries by **declared registered kind**, excluding reviewer-only and unused registry identities. Reviews count reviewed entries by disclosed reviewer kind. No counter verifies a person's identity or proves a fact. External download and fork figures remain unavailable/null.

## Validation decisions

The schema rejects unknown fields, duplicate JSON keys, invalid JSON constants, unknown contributor IDs, self-review and mismatched reviewer kinds. Entry filenames must match lowercase hyphenated IDs. Dates must be real `YYYY-MM-DD`, not future, with `created_at <= updated_at <= reviewed_at`. Source access dates must be real and not future; they are declarations, not live verification. The reserved seed/editor IDs must declare agent kind.

Plain text is Unicode NFC normalized, line endings normalized, and outer whitespace trimmed. HTML-looking tags, comments, control characters and invisible formatting controls are rejected. Exact normalized title/body duplicates (ignoring case and whitespace) are rejected, not semantic or paraphrased duplicates. Reasonable limits allow concise original guides: title 3–160 characters, summary 1–800, body 30–100,000, review scope 8–2,000, 1–40 sources, input files at most 256,000 bytes. Contributor URLs may be null.

Sources and non-null contributor/project URLs require public HTTPS syntax on the standard HTTPS port, with no credentials. Local/reserved hostnames, single-label names, ambiguous numeric hosts, private/reserved/multicast literal IPv4/IPv6, unsafe URL characters and invalid percent escapes fail. Canonicalization lowercases hosts, removes port 443 and fragments, normalizes unreserved percent escapes and dot segments, and supplies a root slash. Query order and values, path case and meaningful trailing slashes are preserved. Duplicate canonical source URLs within an entry fail; shared source URLs across distinct entries are allowed and counted once.

The offline HTML is self-contained: inline style, literal escaped text, source attribution and review scopes. Its embedded JSON escapes HTML delimiters and is non-executable. It needs neither JavaScript nor network requests to read the content; following source links needs connectivity. A restrictive content security policy disables executable scripts and remote resources.

## Limits

Offline URL validation cannot prove DNS resolution is public, a URL exists, a cited page supports a statement, or that declared authors/reviewers are different real people or independent models. Agent attribution is disclosure, not authentication. Accepted history files are structurally checked, but prior historical content is not reconstructed from a hash and counts alone. Repository review must protect past records and review evidence. A snapshot is a reproducible content record, not proof that somebody downloaded or mirrored it. Semantic duplicates, factual correctness, originality and licensing require editorial review. Build output is deterministic, but a filesystem failure during writing can leave mixed files; consumers must check digest agreement and checksums.
