# Task 05: Policy Ingestion Pipeline

## Objective

Implement the policy document branch of the ingestion pipeline: extract text, chunk it with overlap, generate embeddings, and store in the database.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Module: `lib/pipeline/policy.ts`

```typescript
export async function processPolicy(
  documentId: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<void>
```

This function:
1. Reads the policy_documents record from DB
2. If status is already 'complete', returns immediately (idempotent)
3. If status is 'pending' or 'extracting_text':
   - Updates status to 'extracting_text'
   - Calls `extractPdfText()` with the file path
   - Stores raw text and page count in the DB
4. If status is 'pending', 'extracting_text', or 'chunking':
   - Updates status to 'chunking'
   - Chunks the text using the chunking strategy below
   - Stores chunks in policy_chunks (without embeddings yet)
5. If status is 'chunking' or 'embedding':
   - Updates status to 'embedding'
   - For chunks without embeddings, batch-embed using `embedTexts()`
   - Stores embeddings in policy_chunks
   - Reports progress: "Embedded N of M chunks"
6. Updates status to 'complete'

### Chunking Strategy

Based on corpus recon findings (median 8 pages, ~1000-2000 chars/page):

```typescript
interface Chunk {
  text: string;
  pageNumber: number;
  chunkIndex: number;
}

export function chunkText(
  pages: { pageNumber: number; text: string }[],
  targetTokens?: number,  // default 500
  overlapTokens?: number  // default 100
): Chunk[]
```

**Algorithm:**
1. Process pages in order
2. Split page text into paragraphs (double newline or section header boundaries)
3. Accumulate paragraphs until reaching ~targetTokens (estimate: 4 chars = 1 token)
4. When a chunk is full, save it and start the next chunk with the last ~overlapTokens of the previous chunk
5. Track which page number each chunk starts on
6. Never split mid-sentence if possible (split on sentence boundaries within the target range)

**Important considerations:**
- The policy docs have numbered sections (from recon). Try to keep section headers with their content.
- A chunk should be self-contained enough for embedding to capture its meaning.
- Estimated result: ~5,600-11,200 chunks for the full corpus.

### Batch Embedding

OpenAI's `embedMany` has batch limits. Research the limit (likely 2048 texts per call). Process in batches:

```typescript
const BATCH_SIZE = 100;  // Conservative batch size
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  const embeddings = await embedTexts(batch.map(c => c.text));
  // Store embeddings in DB
  onProgress?.('embedding', `${Math.min(i + BATCH_SIZE, chunks.length)} of ${chunks.length} chunks`);
}
```

### Resumability

The function must be resumable. If it crashes mid-embedding:
- On restart, it checks which chunks already have embeddings
- It only processes chunks without embeddings
- This is why we store chunks BEFORE embedding (step 4 before step 5)

### Status Updates

The `onProgress` callback is called with status updates at each major step. This is used by both CLI (logs to stdout) and API (streams SSE events).

## Acceptance Criteria

- `npx tsx -e "
  import { processPolicy } from './lib/pipeline/policy';
  // First, create a test policy_document record in the DB
  // Then run processPolicy on it
  // Verify: chunks are created, embeddings are stored
  "` succeeds

- Test with a small policy doc (e.g., PA.5052_20250221.pdf, 3 pages):
  - Document status progresses: pending -> extracting_text -> chunking -> embedding -> complete
  - Chunks are created in policy_chunks with page numbers
  - Embeddings are stored as binary blobs of the correct size (1536 * 4 bytes = 6144 bytes)
  - Running processPolicy again on the same document returns immediately (idempotent)

- Test chunking function directly:
  - A 3-page document produces a reasonable number of chunks (5-15)
  - Chunks have overlap (last ~100 tokens of chunk N appear at the start of chunk N+1)
  - No chunk exceeds ~600 tokens (target + buffer)

- Test resumability: interrupt mid-embedding, restart, verify it picks up where it left off


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
