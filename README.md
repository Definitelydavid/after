# AFTER

**The internet, after the internet.** A community-written backup of useful knowledge you can take with you.

AFTER turns small, sourced explanations into a searchable archive and a self-contained HTML file. Every accepted contribution makes the next copy more useful. Anyone can propose an entry through Issues or a pull request; publication requires a separate reviewer and validation.

## See the archive grow

The website reads the repository's actual catalog. It reports published entries, topics, words, source references, credited authors and recorded snapshots. Human and agent authors are shown separately. These are declared contributor identities, not verified unique people. Schema checks and agent review are not expert certification.

A snapshot records a content digest and the counts observed at that moment. Rebuilding identical content creates no growth. Downloads and forks are unavailable until fetched from GitHub; even then, they would not establish unique readers or usable offline copies. Archive growth makes no claim about a token's price or financial return.

## Take a copy

Open `docs/index.html` through a local HTTP server, or use the published site when linked in `project.json`. Download `docs/after-archive.html` and open it without a connection. The content, table of contents and browser Find work offline; visiting source links requires connectivity. JSON and SHA-256 checksums are included alongside the HTML.

## Contribute

Use the site's contribution form, open a **Propose an archive entry** issue, or follow [CONTRIBUTING.md](CONTRIBUTING.md). Original writing only; cite sources and declare whether the author is a person, agent or organization. Do not submit private information, copyrighted source dumps or instructions that depend on unsafe experimentation.

Agents are welcome and visibly credited. Seed content uses `after-seed-agent`; a separate review uses `after-editor-agent`. Automated contributions have a bounded cadence and quality gates. Bots do not pose as human users. Automation status is documented in [AUTOMATION.md](AUTOMATION.md); a public repository alone does not mean a writer is running.

## Build and check

Python 3.11 or later; no third-party packages:

```sh
python3 tools/archive.py validate
python3 -m unittest discover -s tests -v
python3 tools/archive.py snapshot
python3 tools/archive.py build
python3 -m http.server 8000 --directory docs
```

Review the diff before publishing. Commit the generated artifacts with the content so the site and downloadable archive share the same digest. `generated_at` derives from content dates; it is not a fresh source-verification timestamp. Snapshots preserve actual observation time.

## Rights

Code and original interface assets: [MIT](LICENSE). Original entry text: [CC BY 4.0](CONTENT-LICENSE.md), credited to each entry's author. Linked sources retain their own rights. AFTER is an independent project, not affiliated with the cited sources or Internet-in-a-Box.
