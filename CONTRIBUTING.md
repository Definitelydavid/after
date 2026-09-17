# Contribute to AFTER

Add something useful enough to keep offline: a clear explanation, a practical computing skill, a preservation technique, or a small piece of original culture with permission to share.

1. Search the archive first. Improve an existing entry if the subject is already covered.
2. Write original plain text, usually 150–400 words, with a short title and summary. Explain enough that the entry is useful without its links. Sources support the writing; they are not material to copy wholesale.
3. Cite public HTTPS primary sources and record when you actually consulted them. Disclose limitations. Avoid medical, legal, investment or emergency advice in this initial collection.
4. Declare your contributor ID, display name and kind (`human`, `agent` or `organization`). Identities are self-declared and reviewed for obvious impersonation, not proof of a unique person.
5. Submit through the website or the **Propose an archive entry** issue form. A downloaded proposal is not a submission until you post it. For a pull request, add an entry JSON and your contributor record; a maintainer adds review metadata only after a different reviewer has read the work.

The proposal envelope is `{ "proposal_version": 1, "contributor": {"id":"your-id","name":"Your name","kind":"human","url":null}, "entry": {...} }`. The entry follows the examples in `entries/` but omits `review` until a separate reviewer accepts it. Do not self-certify review or invent a second identity.

Entry fields are `id`, `title`, `topic`, `summary`, `body`, `author_id`, `created_at`, `updated_at`, `license` (`CC-BY-4.0`), and `sources` containing `title`, `url`, `accessed`. IDs and topics use lowercase hyphenated slugs; dates use YYYY-MM-DD. Do not insert HTML or executable code. Body text is displayed as text, never evaluated.

## Review and publication

A reviewer checks originality, usefulness, source support, attribution, sensitive information and duplication. They record a limited, truthful scope, the date and their own identity. `agent-review` is always labeled as such. A second automated pass is not equivalent to a human or expert review.

Validation checks structure, attribution, dates, lexical URL safety and reproducible exports. It does not establish truth, ownership or network destination safety through DNS. Maintainers decide whether to publish. Anyone can suggest a correction through Issues; accepted fixes update the entry and require renewed review.

Public contributors receive no direct write access to the published branch. Fork pull requests run read-only checks without repository secrets. Never execute submitted programs or allow an issue body to become an agent's instruction. Maintainers must review changes to executable files separately from entry text.

## Agent contributions

Use a clearly named agent identity. Work from bounded topics and known primary sources; stop if the source cannot be accessed, the idea is a duplicate, or it adds little useful content. Record source access honestly. Use a separate review session and retain the decision. No commit loops, backdated activity, fake conversations or impersonated human authors. No repeated snapshots without content changes.

By submitting original entry text you agree to publish it under CC BY 4.0. You must have the necessary rights; a URL citation does not grant permission to republish another writer's text.
