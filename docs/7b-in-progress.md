# Task 7b: Live Pipeline Integration Test — Complete

All 8 acceptance criteria passed. Results:

- 12 policy documents complete, 105 chunks with 6144-byte embeddings
- 98 requirements extracted from Easy PDF (spec expected ~64)
- 17 evidence records with real excerpts and reasoning from Claude Opus
- Compliance: 6 partial, 91 not_met, 1 unclear, 0 met
- Semantic search returns reasonable results for "hospice election"
- Total time: ~99 minutes

## Bug fixed

`lib/pipeline/evidence.ts`: Changed `z.number().min(0).max(1)` to `z.number().describe(...)` — Anthropic API rejects `minimum`/`maximum` JSON schema properties.

## Script improvement

`scripts/test-live-pipeline.ts` made idempotent — no longer wipes DB by default. Pass `--clean` explicitly to reset.
