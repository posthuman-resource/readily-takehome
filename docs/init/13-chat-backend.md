# Task 13: Chat Backend

## Objective

Create the chat API route using Vercel AI SDK with tool definitions for querying the knowledge base, searching policies, analyzing gaps, and triggering ingestion.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### API Route: `app/api/chat/route.ts`

Use Vercel AI SDK's `streamText` with tool definitions. Research the latest API via context7 MCP (look up `ai` package docs for `streamText` and tool calling).

```typescript
import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  const { messages } = await request.json();

  const result = streamText({
    model: openai('gpt-5.4-mini'),
    system: `You are a healthcare compliance expert assistant. You help users explore regulatory requirements, organizational policies, and compliance gaps.

You have access to a pre-built compliance knowledge base containing:
- Regulatory documents with extracted requirements
- Organizational policy documents indexed for semantic search
- Evidence linking requirements to policy excerpts

Use your tools to answer questions accurately. Always cite specific policies, page numbers, and excerpts when providing evidence.`,
    messages,
    tools: {
      queryRequirements,
      queryPolicies,
      semanticSearch,
      getRequirementDetail,
      getComplianceSummary,
      startIngestion,
      getIngestionStatus,
    },
    maxSteps: 5,  // Allow multi-step tool calling
  });

  return result.toDataStreamResponse();
}
```

### Tool Definitions

Use the `tool` helper from the AI SDK with Zod schemas:

**1. queryRequirements**
```typescript
const queryRequirements = tool({
  description: 'Search requirements by regulatory document, status, or text. Returns matching requirements with their compliance status.',
  parameters: z.object({
    regulatoryDocId: z.string().optional().describe('Filter by regulatory document ID'),
    status: z.enum(['met', 'not_met', 'partial', 'unclear']).optional().describe('Filter by compliance status'),
    searchText: z.string().optional().describe('Search text within requirement text'),
    limit: z.number().optional().default(20).describe('Max results to return'),
  }),
  execute: async ({ regulatoryDocId, status, searchText, limit }) => {
    // Query requirements table with filters
    // Return: array of { id, requirementNumber, text, complianceStatus, evidenceCount }
  },
});
```

**2. queryPolicies**
```typescript
const queryPolicies = tool({
  description: 'Browse organizational policies by category or search by filename.',
  parameters: z.object({
    category: z.string().optional().describe('Policy category: AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA'),
    searchText: z.string().optional().describe('Search in policy filenames'),
    limit: z.number().optional().default(20),
  }),
  execute: async ({ category, searchText, limit }) => {
    // Query policy_documents with filters
    // Return: array of { id, filename, category, pageCount, requirementsSatisfied }
  },
});
```

**3. semanticSearch**
```typescript
const semanticSearch = tool({
  description: 'Semantic search across all policy documents. Use this to find policies related to a specific topic or question.',
  parameters: z.object({
    query: z.string().describe('Natural language search query'),
    topK: z.number().optional().default(10).describe('Number of results'),
  }),
  execute: async ({ query, topK }) => {
    // Call semanticSearch from lib/search.ts
    // Return: array of { policyFilename, category, pageNumber, excerpt, similarity }
  },
});
```

**4. getRequirementDetail**
```typescript
const getRequirementDetail = tool({
  description: 'Get full details on a specific requirement including all evidence matches.',
  parameters: z.object({
    requirementId: z.string().describe('The requirement ID'),
  }),
  execute: async ({ requirementId }) => {
    // Query requirement + all evidence records
    // Return: { requirement, evidence: [{ policyFilename, pageNumber, excerpt, reasoning, status }] }
  },
});
```

**5. getComplianceSummary**
```typescript
const getComplianceSummary = tool({
  description: 'Get aggregated compliance statistics for a regulatory document or all documents.',
  parameters: z.object({
    regulatoryDocId: z.string().optional().describe('Specific document ID, or omit for overall summary'),
  }),
  execute: async ({ regulatoryDocId }) => {
    // Aggregate met/not_met/partial/unclear counts
    // Return: { total, met, notMet, partial, unclear, percentCompliant }
  },
});
```

**6. startIngestion**
```typescript
const startIngestion = tool({
  description: 'Start processing a newly uploaded regulatory document. Returns the document ID for tracking.',
  parameters: z.object({
    filePath: z.string().describe('Path to the uploaded PDF file'),
  }),
  execute: async ({ filePath }) => {
    // Register and start processing
    // Return: { documentId, status: 'pending' }
  },
});
```

**7. getIngestionStatus**
```typescript
const getIngestionStatus = tool({
  description: 'Check the processing status of a document being ingested.',
  parameters: z.object({
    documentId: z.string().describe('The document ID to check'),
  }),
  execute: async ({ documentId }) => {
    // Read status from DB
    // Return: { status, statusMessage, requirementsFound, requirementsMatched }
  },
});
```

### Multi-Step Tool Calls

Set `maxSteps: 5` to allow the model to make multiple tool calls in sequence. For example:
1. User asks "What are our biggest compliance gaps?"
2. Model calls `getComplianceSummary()`
3. Model calls `queryRequirements({ status: 'not_met' })`
4. Model synthesizes results into a response

### Error Handling

- Tool execution errors should be caught and returned as error messages (not crash the stream)
- If the database is empty (no seeded data), tools should return helpful "no data available" messages

## Acceptance Criteria

- `POST /api/chat` with a message like `{"messages":[{"role":"user","content":"How many requirements are met?"}]}` returns a streaming response
- The model uses the `getComplianceSummary` tool and returns compliance stats
- Semantic search works: asking about "hospice" returns relevant policy excerpts
- Multi-step tool calling works: complex questions trigger multiple tool calls
- Error handling: if a tool fails, the model gracefully reports the error
- `npm run build` succeeds
