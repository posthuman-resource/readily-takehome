# Task 07b: Live Pipeline Integration Test

## Objective

Actually run the ingestion pipeline end-to-end with real API calls against real documents. Tasks 05-07 wrote the pipeline code but only tested with synthetic data. This task verifies the pipeline works for real.

## Context

The database currently has 0 policy documents, 0 chunks, 0 requirements, and 0 evidence. There may be stale regulatory_documents records from earlier test runs - delete those first.

API keys are available in `.env`. Load them with `dotenv/config` or however the project loads env vars.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Step 1: Clean slate

Reset the database to a clean state. Delete any existing records from all tables (regulatory_documents, requirements, policy_documents, policy_chunks, evidence). Do NOT drop or recreate tables - just delete rows.

### Step 2: Ingest a small set of policy documents

Pick 10-15 policy PDFs from the PA category (smallest files, fastest to process). Use the pipeline code from tasks 05/08 to:
1. Register each document
2. Run `processDocument()` for each
3. Verify each reaches `complete` status

After this step, confirm:
- `policy_documents` has 10-15 records with status `complete`
- `policy_chunks` has chunks with non-null embeddings
- Embeddings are the right size (1536 * 4 = 6144 bytes per embedding blob)

### Step 3: Ingest the Easy regulatory document

Use the pipeline to process `data/Example Input Doc - Easy.pdf` as a regulatory document:
1. Register it
2. Run text extraction
3. Run requirement extraction (this calls Claude Opus - requires ANTHROPIC_API_KEY)
4. Verify requirements are created in the database

After this step, confirm:
- `regulatory_documents` has 1 record with status at least `extracting_requirements` complete
- `requirements` table has rows (expect ~64 for the Easy doc)
- Each requirement has a `requirement_number` and `text`

### Step 4: Run evidence matching

Run evidence matching for the Easy document's requirements against the policy chunks:
1. For each requirement, semantic search should find relevant policy chunks
2. Claude Opus evaluates whether the evidence satisfies the requirement
3. Evidence records are stored in the database

After this step, confirm:
- `evidence` table has rows
- Requirements have updated `compliance_status` values
- There's a mix of statuses (not all the same)

### Step 5: Verify data quality

Run a few sanity checks:
- Print the compliance summary (met/partial/not_met/unclear counts)
- Print 3 example requirements with their evidence (show the policy excerpt and reasoning)
- Verify semantic search returns reasonable results for a test query like "hospice election"

### If Something Fails

This is the integration test. If the pipeline code from tasks 05-07 has bugs, **fix them**. Common issues:
- Wrong import paths
- API key not loaded
- sqlite-vector not initialized
- Embedding dimension mismatch
- Wrong model IDs (check what's actually available - e.g., `gpt-5.4-mini` vs `gpt-5-mini`)
- Wrong AI SDK API (e.g., deprecated `generateObject` vs `generateText` with `Output.object()`)

Fix whatever is broken, don't just report it. This task isn't done until real data flows through the entire pipeline.

### Write a test script

Create `scripts/test-live-pipeline.ts` that runs all the above steps and prints results. This script should be useful for future debugging.

## Acceptance Criteria

ALL of these must be verified with actual database queries showing real data:

- `policy_documents` has >= 10 records with status `complete`
- `policy_chunks` has >= 50 chunks with non-null embeddings
- `requirements` has >= 30 requirements extracted from the Easy PDF (expect ~64)
- `evidence` has >= 10 evidence records with real excerpts and reasoning from Claude
- At least some requirements have `compliance_status` of `met` or `partial`
- `scripts/test-live-pipeline.ts` runs end-to-end without errors
- Print the full compliance summary to stdout as proof

Do NOT commit if the database is empty or only has synthetic test data.

## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
