# Task 06: Requirement Extraction

## Objective

Implement the requirement extraction step of the regulatory document pipeline. Uses Claude Opus to extract structured requirements from regulatory documents.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Module: `lib/pipeline/requirements.ts`

```typescript
export async function extractRequirements(
  documentId: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<void>
```

This function:
1. Reads the regulatory_documents record from DB
2. If requirements already exist for this document, returns (idempotent)
3. Updates status to 'extracting_requirements'
4. Sends the document text to Claude Opus with a structured extraction prompt
5. Parses the response into individual requirements
6. Stores each requirement in the requirements table
7. Reports progress as requirements are extracted

### AI SDK Usage

Use Vercel AI SDK's `generateObject` with a Zod schema for structured output. Research the latest API via context7 MCP (look up `ai` package docs).

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const RequirementSchema = z.object({
  requirements: z.array(z.object({
    requirementNumber: z.string(),
    text: z.string(),
    reference: z.string().optional(),
    category: z.string().optional(),
  }))
});

// Use context7 to find the correct API for generateObject
// Key parameters: model, schema, prompt (or messages), system
const result = await generateObject({
  model: anthropic('claude-opus-4-6'),
  schema: RequirementSchema,
  system: '...extraction prompt...',
  prompt: documentText,
});
```

### Extraction Prompt Design

The prompt must handle BOTH document types identified during recon:

**Type 1: Structured Checklist (Easy example)**
- 14 pages, 64 numbered yes/no questions
- Pattern: "Does the P&P state [requirement]?"
- Each has an APL reference

**Type 2: Narrative Policy Guide (Hard example)**
- 145 pages of dense prose
- Requirements embedded in text: "MCPs must...", "MCPs are required to..."
- No numbered checklist

The prompt should:
1. First identify the document type (checklist vs narrative)
2. For checklists: extract each numbered item as a requirement
3. For narrative docs: identify imperative statements ("must", "shall", "required to") as requirements
4. Always capture: requirement text, reference/section, and any category/topic

### Handling Large Documents

The Hard example is 145 pages (~70K tokens). This may exceed the model's output capacity if trying to extract all requirements at once. Strategy:

**For documents under 30 pages**: Send the entire text in one call.

**For documents over 30 pages**: Process in sections/chunks:
1. First call: Have the model identify the document structure (sections, chapters)
2. Then process each major section separately
3. Deduplicate requirements across sections
4. Merge results

**Important**: Claude Opus 4.6 has a 200K+ token context window, so input length is rarely the issue. The constraint is output length for very large requirement lists.

### Token Considerations

- Easy example: ~7,500 tokens input, ~64 requirements output
- Hard example: ~70,000 tokens input, potentially 100+ requirements output
- Consider using `generateObject` with streaming if available, to handle large outputs

## Acceptance Criteria

- Test with the Easy example:
  ```
  npx tsx scripts/test-requirement-extraction.ts "data/Example Input Doc - Easy.pdf"
  ```
  - Extracts ~64 requirements
  - Each requirement has a number, text, and reference
  - Requirements are stored in the database
  - Running again is idempotent (no duplicates)

- Test with a section of the Hard example (first 20 pages):
  - Extracts requirements with imperative language
  - Requirements have section references

- The extraction prompt is robust enough to handle both document types without manual configuration


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
