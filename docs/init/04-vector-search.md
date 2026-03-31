# Task 04: Vector Search Setup

## Objective

Create the vector search utility module that embeds queries and searches for similar policy chunks using sqlite-vector and OpenAI embeddings.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Module: `lib/search.ts`

```typescript
interface SearchResult {
  chunkId: string;
  policyDocumentId: string;
  policyFilename: string;
  policyCategory: string;
  pageNumber: number;
  chunkText: string;
  similarity: number;  // 0-1 (cosine similarity)
}

export async function semanticSearch(
  query: string,
  topK?: number  // default 10
): Promise<SearchResult[]>
```

### Embedding Function: `lib/embeddings.ts`

Use the Vercel AI SDK to generate embeddings:

```typescript
import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

// Use context7 MCP to look up the latest AI SDK docs for embed/embedMany
// Research the correct API: the model parameter, the value parameter, etc.

export async function embedText(text: string): Promise<number[]>
export async function embedTexts(texts: string[]): Promise<number[][]>
```

- Model: `openai.embedding('text-embedding-3-small')` (1536 dimensions)
- Use `embed()` for single text, `embedMany()` for batch
- Research the AI SDK docs (via context7) for the correct function signatures

### Vector Storage and Search with sqlite-vector

sqlite-vector stores vectors as binary blobs and provides SQL functions for similarity search. Research the exact SQL syntax. It likely looks something like:

```sql
-- Create a virtual table or column for vectors
-- Insert: store as binary float32 array
-- Search: use vec_distance_cosine() or similar function

SELECT
  pc.id, pc.text, pc.pageNumber, pc.policyDocumentId,
  vec_distance_cosine(pc.embedding, ?) as distance
FROM policy_chunks pc
ORDER BY distance ASC
LIMIT ?
```

**Important**: The exact API depends on which version of sqlite-vector you installed. Check the README/docs. Key things to figure out:

1. How to store a float32 array as a vector in SQLite
2. How to perform cosine similarity search
3. Whether you need a virtual table or can use regular columns
4. The SQL function names (vec_distance_cosine, vector_distance, etc.)

### Embedding Serialization

Convert between JavaScript number arrays and the binary format sqlite-vector expects:

```typescript
// To store: number[] -> Buffer (Float32Array -> Buffer)
function serializeEmbedding(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

// To query: number[] -> Buffer for use in SQL parameter
function serializeQuery(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}
```

### Testing

Create a small test script that:
1. Embeds a test string
2. Stores it in the database
3. Embeds a query string
4. Searches for similar vectors
5. Verifies the original text is returned

## Acceptance Criteria

- `lib/embeddings.ts` exports `embedText` and `embedTexts` functions
- `lib/search.ts` exports `semanticSearch` function
- `npx tsx scripts/test-vector-search.ts` (create this test script) demonstrates:
  - Embedding a few test strings
  - Storing them in the policy_chunks table
  - Querying with a similar string and getting relevant results back
  - Results include similarity scores and are sorted by relevance
- The test cleans up after itself (uses a temp database or deletes test data)
