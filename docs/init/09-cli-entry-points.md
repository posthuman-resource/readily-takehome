# Task 09: CLI Entry Points

## Objective

Create CLI scripts for ingesting documents and seeding the database with the full document corpus.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Script 1: `scripts/ingest.ts`

Usage: `npx tsx scripts/ingest.ts <path-to-pdf> [--type regulatory|policy] [--category AA|CMC|...]`

This script:
1. Loads env vars from `.env`
2. Validates the file exists and is a PDF
3. Determines document type (default: 'policy' if in a category dir, 'regulatory' otherwise)
4. Calls `registerDocument()` to copy the file and create DB record
5. Calls `processDocument()` with a progress callback that logs to stdout
6. Exits with code 0 on success, 1 on error

Example output:
```
Ingesting: Example Input Doc - Easy.pdf (regulatory)
  [extracting_text] Extracting text...
  [extracting_requirements] Extracting requirements...
  [matching_evidence] Matching evidence: 12 of 64
  [matching_evidence] Matching evidence: 24 of 64
  ...
  [complete] Done in 5m 32s
```

### Script 2: `scripts/seed.ts`

Usage: `npx tsx scripts/seed.ts [--policies-only] [--regulatory-only] [--category AA]`

This script:
1. Loads env vars from `.env`
2. Ensures the DATA_DIR directory structure exists
3. Processes documents in this order:
   a. **Policy documents first** (they need to be embedded before evidence matching)
      - Iterates through all PDFs in `data/Public Policies/` by category
      - For each: calls `registerDocument()` then `processDocument()`
      - Skips documents that are already 'complete' in the DB
   b. **Regulatory documents second**
      - Processes `data/Example Input Doc - Easy.pdf` and `data/Example Input Doc - Hard.pdf`
      - These trigger requirement extraction + evidence matching against the now-embedded policies
4. Reports overall progress:
   ```
   Seeding policy documents...
   [AA] 1/19 AA.1000_CEO20250206_v20250201.pdf - complete (72 pages, 145 chunks)
   [AA] 2/19 AA.1204_20240725_v20240701.pdf - complete (5 pages, 12 chunks)
   ...
   Policy ingestion complete: 373 documents, ~8000 chunks, ~45 seconds

   Seeding regulatory documents...
   [1/2] Example Input Doc - Easy.pdf
     Extracting text... done
     Extracting requirements... 64 found
     Matching evidence: 64/64 complete
   [2/2] Example Input Doc - Hard.pdf
     ...
   ```

5. Handles errors per-document (log and continue, don't crash)
6. Is idempotent: can be run multiple times safely

### Performance Considerations

- Policy ingestion (text + chunk + embed) for 373 docs should take ~2-5 minutes
- The embedding API calls are the bottleneck. Use batch embedding (from task 05)
- Regulatory document processing (Opus calls) takes much longer: ~5-10 min per doc
- Consider processing the Easy example first (more structured, faster) then the Hard one

### Flags and Options

- `--policies-only`: Only process policy documents (skip regulatory)
- `--regulatory-only`: Only process regulatory documents (skip policies)
- `--category AA`: Only process policies in the specified category
- `--dry-run`: Show what would be processed without actually processing

These are nice-to-haves. At minimum, the script must work with no flags to seed everything.

## Acceptance Criteria

- `npx tsx scripts/ingest.ts "data/Public Policies/PA/PA.5052_20250221.pdf" --type policy --category PA` succeeds:
  - Creates a policy_documents record
  - Extracts text, chunks, embeds
  - Status is 'complete'

- `npx tsx scripts/seed.ts --policies-only --category PA` succeeds:
  - Processes all 38 PA policy docs
  - Reports progress to stdout
  - All documents reach 'complete' status
  - Running again skips already-complete documents

- `npx tsx scripts/seed.ts` (full seed) processes all 373 policy docs and both regulatory docs
  - This is the "big run" that populates the database for the web app
  - Expected time: 5-15 minutes for policies, plus 10-20 minutes for regulatory docs
