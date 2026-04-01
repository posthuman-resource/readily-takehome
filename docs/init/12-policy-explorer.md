# Task 12: Policy Explorer UI

## Objective

Build the Policy Explorer view: browse organizational policies by category, search across all policy text, and see which requirements each policy satisfies (reverse lookup).

## Context: Live Data

A separate process has been ingesting real documents with real API calls (see `docs/7b-in-progress.md`). The database should contain real policy documents, chunks with embeddings, extracted requirements, and evidence. Build against this real data, not synthetic test data.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Page Structure

```
app/
  policies/
    page.tsx              # Policy explorer main page
    [policyId]/
      page.tsx            # Individual policy detail page
```

### Policy Explorer Main Page

`app/policies/page.tsx` - Server Component

**Category Navigation:**
- Tab bar or sidebar with all 10 categories: AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA
- Show count per category (e.g., "GG (144)")
- Default to showing all, filter by clicking a category

**Policy List:**
- Sortable table or card grid of policies
- Columns: Filename, Category, Pages, Requirements Satisfied
- "Requirements Satisfied" shows how many requirements reference this policy's chunks as evidence
- Search input to filter by filename or content

**Search:**
- Text search across policy filenames
- Optionally, semantic search across policy content (uses the vector search endpoint)

### Policy Detail Page

`app/policies/[policyId]/page.tsx` - Server Component

Shows:
- Policy metadata: filename, category, page count
- **Requirements this policy satisfies**: a list of requirements where this policy's chunks appear as evidence
  - For each: requirement number, text, compliance status, the specific excerpt used
- **Full text**: scrollable view of the policy's extracted text, organized by page

### Data Queries

**Policies by category:**
```sql
SELECT pd.*, COUNT(DISTINCT e.requirement_id) as requirements_satisfied
FROM policy_documents pd
LEFT JOIN policy_chunks pc ON pc.policy_document_id = pd.id
LEFT JOIN evidence e ON e.policy_chunk_id = pc.id
WHERE pd.category = ?
GROUP BY pd.id
ORDER BY pd.filename
```

**Requirements satisfied by a policy:**
```sql
SELECT r.*, e.excerpt, e.reasoning, e.status as evidence_status
FROM requirements r
JOIN evidence e ON e.requirement_id = r.id
JOIN policy_chunks pc ON pc.id = e.policy_chunk_id
WHERE pc.policy_document_id = ?
ORDER BY r.requirement_number
```

### API Routes (if needed for client-side filtering)

- `app/api/policies/route.ts` - GET policies with optional category filter
- `app/api/policies/[policyId]/route.ts` - GET policy detail with requirements

### Navigation

- Add a top-level nav that lets users switch between "Compliance" and "Policies" views
- The nav should be in the root layout or a shared component
- Both views should feel like parts of the same app

## Acceptance Criteria

- Navigate to `/policies` and see all policies grouped/filterable by category
- Category counts are correct (e.g., GG shows 144)
- Click a category to filter the list
- Search for a policy by filename
- Click a policy to see its detail page
- Detail page shows which requirements this policy provides evidence for
- Detail page shows the policy's full extracted text
- Navigation between Compliance Browser and Policy Explorer works
- `npm run build` succeeds


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
