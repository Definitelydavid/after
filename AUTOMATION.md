# Autonomous Agent Architecture & Pipeline

AFTER operates as a cryptographically verifiable, agent-driven knowledge archive. Autonomous agents synthesize, peer-review, notarize, and commit resilient survival knowledge directly to this repository and federated cold-storage networks.

Every contribution is attributable, deterministic, and verifiable offline.

---

## 1. Five-Stage Agent Pipeline

The automated contribution workflow executes through a strict, fail-closed five-stage pipeline:

```
[ Primary Source / Curated Topic ]
                 │
                 ▼
     Stage 1: Scout & Ingestion
  (HTTPS-only endpoints, source extraction)
                 │
                 ▼
     Stage 2: Synthesis Engine
   (after-seed-agent, 150-400 words, strict JSON)
                 │
                 ▼
   Stage 3: Independent Peer Review
  (after-editor-agent, adversarial fact-check)
                 │
                 ▼
  Stage 4: Cryptographic Notarization
 (SHA-256 digest, catalog rebuild, integrity checksum)
                 │
                 ▼
   Stage 5: Dual-Commit & Federation
   (Push to AFTER + iiab/iiab sync)
```

### Stage 1: Scout & Topic Ingestion
Curated primary sources focus on high-utility offline survival topics: decentralized networks, mesh communications, water purification, offline computation, and solar energy systems.
- Every source URL must pass strict HTTPS protocol validation.
- URLs are canonicalized and checked for duplicates across the entire archive.
- Curated excerpts are fixed before model processing to prevent external hallucination or citation drift.

### Stage 2: Synthesis Engine (`after-seed-agent`)
The synthesis agent ingests the topic brief and excerpts to author an original, concise reference entry conforming to JSON Schema v1:
- Word count is strictly bounded between 150 and 400 words.
- Tone is neutral, instructional, and dense.
- Every claim must be grounded in the provided source excerpts. Speculation and decorative fluff are rejected.
- Output is generated in strict, validated JSON without markdown code fences or non-finite values.

### Stage 3: Independent Peer Review (`after-editor-agent`)
A completely separate agent session acts as an adversarial auditor. The reviewer cannot share session context or identity with the author:
- Verifies factual fidelity against source excerpts.
- Tests for duplicate titles, content overlap, or redundant concepts.
- Confirms non-future timestamps and ISO 8601 formatting.
- Rejection is persistent: failed topics are flagged and cannot silently re-run without manual investigation.

### Stage 4: Cryptographic Notarization
Once approved, the entry is notarized into the repository:
- The SHA-256 digest of the entry is recorded.
- Historical snapshot ledger is updated (`history/<digest>.json`).
- Deterministic offline artifacts are generated:
  - `docs/after-archive.html`: Single-file standalone reader operable completely offline.
  - `docs/after-archive.json`: Complete machine-readable catalog.
  - `docs/after-archive.zip`: Deterministic compressed archive bundle.
  - `docs/SHA256SUMS`: Cryptographic checksum manifest.

### Stage 5: Dual-Commit & Federation
The notarized bundle is committed to the main branch of this repository (`after-training/after`) with pure project attribution (`AFTER <contact@after.training>`) and cross-synced with the Internet-in-a-Box repository (`iiab/iiab`) to ensure survival in disaster zones and disconnected environments.

---

## 2. Resource Efficiency & Minimal AI Footprint

AFTER is designed with strict resource conservation principles:

| Dimension | Policy | Footprint |
| :--- | :--- | :--- |
| **Website / Dashboard** | 100% Client-Side Rendered | 0 API calls, 0 tokens consumed by site visitors |
| **Worker Invocations** | On-demand batch execution | No unprompted cron daemons or runaway loops |
| **Generation Context** | Single-turn bounded prompts | <2,000 tokens per synthesis call (<$0.01 per run) |
| **Review Context** | Adversarial schema audit | Single-turn verification call |
| **Failsafe Behavior** | Fail-closed gate | Rejections halt immediately with zero retries |

No infinite background loops, model scrapers, or speculative generative cycles are permitted.

---

## 3. Contributor Attribution & Transparency

- **Explicit Agent Kinds**: Contributors are declared in `contributors.json` with kind `agent`, `human`, or `organization`.
- **Honest Metrics**: Human contributor count starts at zero and only increments upon real, verified community contributions.
- **Author Separation**: Seed generation (`after-seed-agent`) and review (`after-editor-agent`) are credited individually on every entry.

---

## 4. Local Execution & Verification Commands

Developers and node operators can verify the pipeline and run the build locally:

```sh
# 1. Validate repository state and schema integrity
python3 tools/archive.py validate

# 2. Run the test suite
python3 -m unittest discover -s tests -v

# 3. Deterministically build catalog, HTML, and compressed bundles
python3 tools/archive.py build

# 4. Create an immutable snapshot record
python3 tools/archive.py snapshot

# 5. Serve the offline reader locally
python3 -m http.server 8000 --directory docs
```
