# Task 07: Evidence Matching

## Objective

Implement the evidence matching step: for each requirement, search for relevant policy chunks via vector similarity, then use Claude Opus to evaluate whether the evidence satisfies the requirement.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Module: `lib/pipeline/evidence.ts`

```typescript
export async function matchEvidence(
  documentId: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<void>
```

This function:
1. Reads all requirements for the regulatory document
2. For each requirement that doesn't already have evidence records:
   a. Performs semantic search against policy chunks (top-K, K=10-20)
   b. Sends the requirement + candidate evidence to Claude Opus for evaluation
   c. Stores the evidence records in the database
   d. Updates the requirement's complianceStatus based on the best evidence
3. Reports progress: "Matched N of M requirements"

### Evidence Evaluation Flow

For each requirement:

1. **Semantic Search**: Use `semanticSearch(requirement.text, 15)` to find the most relevant policy chunks
2. **Evidence Evaluation**: Send the requirement text + top candidate chunks to Opus:

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const EvidenceEvaluationSchema = z.object({
  evaluations: z.array(z.object({
    chunkId: z.string(),
    status: z.enum(['met', 'not_met', 'partial', 'unclear']),
    excerpt: z.string(),  // The specific text that provides evidence
    reasoning: z.string(),  // Why this status was assigned
    confidence: z.number().min(0).max(1),
  }))
});

// Use context7 to verify the generateObject API
const result = await generateObject({
  model: anthropic('claude-opus-4-6'),
  schema: EvidenceEvaluationSchema,
  system: `You are a healthcare compliance expert evaluating whether organizational policies satisfy regulatory requirements.

For each policy excerpt, determine:
- met: The policy clearly and fully addresses the requirement
- partial: The policy addresses some but not all aspects of the requirement
- not_met: The policy does not address the requirement
- unclear: Cannot determine from the provided excerpt

Be specific about what is and isn't covered. Quote the relevant text.`,
  prompt: `Requirement: ${requirement.text}

Policy excerpts to evaluate:
${chunks.map(c => `[Chunk ${c.chunkId} from ${c.policyFilename} p.${c.pageNumber}]:\n${c.chunkText}`).join('\n\n')}`,
});
```

3. **Store Evidence**: For each evaluation with status != 'not_met', create an evidence record
4. **Update Requirement Status**: Set the requirement's complianceStatus to the best status found:
   - If any evidence is 'met' -> 'met'
   - Else if any is 'partial' -> 'partial'
   - Else if any is 'unclear' -> 'unclear'
   - Else -> 'not_met'

### Batching and Rate Limiting

- Process requirements sequentially (each requires an Opus call)
- The Opus calls are the bottleneck. For 64 requirements, expect ~64 API calls
- Add a small delay between calls if needed to avoid rate limiting
- Total processing time for the Easy example: ~5-10 minutes

### Resumability

The function is resumable:
- Check which requirements already have evidence records
- Skip those and only process unmatched requirements
- Status tracking: report "Matched 12 of 64 requirements"
- If interrupted, calling again picks up from the last unmatched requirement

### Optimizations

- **Batch chunks for evaluation**: Instead of one Opus call per chunk, send all top-K chunks for a requirement in one call. This is more efficient and gives the model context to compare.
- **Filter low-similarity chunks**: If the similarity score is below a threshold (e.g., 0.3), don't bother sending to Opus
- **Cache search results**: The semantic search is fast; no need to cache

## Acceptance Criteria

- Prerequisite: Tasks 04 (vector search), 05 (policy ingestion), and 06 (requirement extraction) are complete with test data in the DB

- Test with the Easy example (64 requirements) against a subset of policy docs (at least GG and HH categories):
  ```
  npx tsx scripts/test-evidence-matching.ts
  ```
  - Evidence records are created for requirements
  - Each evidence record has: status, excerpt, reasoning, confidence
  - Requirement complianceStatus fields are updated
  - Running again is idempotent (no duplicate evidence)
  - Progress is reported via the callback

- The overall compliance summary for the Easy example shows a mix of met/partial/not_met/unclear (not all one status)
