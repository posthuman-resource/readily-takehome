# Task 11: Compliance Browser UI

## Objective

Build the primary UI: document list sidebar, requirements dashboard with compliance stats, and evidence drilldown.

## Context: Live Data

A separate process has been ingesting real documents with real API calls (see `docs/7b-in-progress.md`). The database should contain real policy documents, chunks with embeddings, extracted requirements, and evidence. Build against this real data, not synthetic test data.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

Key Next.js 16 specifics:
- Layouts and pages are Server Components by default
- `params` and `searchParams` must be awaited
- Use `PageProps<'/path/[param]'>` for typed page props
- Read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`

### shadcn/ui Setup

If not already initialized in task 01, run `npx shadcn@latest init` to set up shadcn/ui. Then add the components needed:

```bash
npx shadcn@latest add badge button card progress separator
npx shadcn@latest add sidebar accordion table input
npx shadcn@latest add tooltip sheet scroll-area
```

### Page Structure

```
app/
  layout.tsx              # Root layout with sidebar
  page.tsx                # Redirect to first regulatory doc, or welcome page
  (compliance)/
    layout.tsx            # Compliance layout with document sidebar
    [documentId]/
      page.tsx            # Requirements dashboard for selected document
```

### Component 1: Document Sidebar

`app/(compliance)/layout.tsx` - Server Component

- Lists all regulatory documents from the DB
- Shows per-document summary: title, requirement count, compliance %
- In-progress documents show a status indicator (spinner + status text)
- Active document is highlighted
- Uses shadcn/ui Sidebar component

```typescript
// Server Component - reads directly from SQLite
const documents = await db.select().from(regulatoryDocuments).orderBy(regulatoryDocuments.createdAt);

// For each document, get compliance stats
const stats = await db.select({
  documentId: requirements.regulatoryDocumentId,
  total: count(),
  met: count(sql`CASE WHEN compliance_status = 'met' THEN 1 END`),
  partial: count(sql`CASE WHEN compliance_status = 'partial' THEN 1 END`),
  notMet: count(sql`CASE WHEN compliance_status = 'not_met' THEN 1 END`),
  unclear: count(sql`CASE WHEN compliance_status = 'unclear' THEN 1 END`),
}).from(requirements).groupBy(requirements.regulatoryDocumentId);
```

### Component 2: Requirements Dashboard

`app/(compliance)/[documentId]/page.tsx` - Server Component

**Summary Bar (top):**
- Total requirements count
- Compliance breakdown: met (green), partial (yellow), not_met (red), unclear (gray)
- Percentage compliant
- Visual: either a horizontal stacked bar or donut chart (keep it simple - a colored bar is fine)

**Filter Controls:**
- Filter by status: All / Met / Partial / Not Met / Unclear
- Text search across requirement text
- These can be client-side filters using `searchParams`

**Requirements List:**
Each requirement row shows:
- Requirement number (badge)
- Truncated requirement text (first ~100 chars)
- Compliance status badge (color-coded)
- Number of evidence matches
- Click to expand/drill down

### Component 3: Evidence Drilldown

When a requirement row is clicked, expand inline using an accordion/collapsible:

- Full requirement text
- Reference (section/page in source doc)
- List of matching evidence, each showing:
  - Policy filename and category (badge)
  - Page number
  - Excerpt (quoted/highlighted)
  - AI reasoning for the compliance determination
  - Confidence score (if useful)
  - Status badge (met/partial/not_met/unclear)

Use shadcn/ui Accordion for expand/collapse behavior.

### Data Loading

All data comes from SQLite via Server Components. No client-side data fetching needed for the initial view. The pages should load instantly since it's pre-computed data.

API routes for any client-side interactions (filtering, search):
- `app/api/documents/route.ts` - GET list of regulatory documents with stats
- `app/api/documents/[documentId]/requirements/route.ts` - GET requirements with evidence for a document

### Status Indicators for In-Progress Documents

Documents that are still being processed should show their current status:
- Use a polling mechanism or SSE to update the UI
- Show a progress bar or status text
- When complete, refresh the requirements view

This can be a client component that wraps the document sidebar entry.

### Visual Design

- Clean, professional dashboard aesthetic
- Color scheme: green (met), amber/yellow (partial), red (not_met), gray (unclear)
- Status badges should be immediately scannable
- The sidebar should be collapsible on mobile
- Evidence excerpts should use a blockquote or highlighted background

## Acceptance Criteria

- Open `http://localhost:3000` and see the compliance browser
- Regulatory documents appear in the sidebar with compliance summaries
- Click a document to see its requirements dashboard
- Summary bar shows correct compliance stats (met/partial/not_met/unclear counts)
- Click a requirement to expand and see evidence details
- Evidence shows: policy name, page number, excerpt, reasoning, status
- Filter by compliance status works
- Text search across requirements works
- The page loads instantly (no loading spinners for pre-computed data)
- In-progress documents show their processing status
- `npm run build` succeeds


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
