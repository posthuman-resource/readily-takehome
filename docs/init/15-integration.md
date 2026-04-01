# Task 15: End-to-End Integration

## Objective

Verify the full application works end-to-end: CLI seed, web browser, chat, and web upload. Fix any integration issues.

## Context: Live Data

A separate process has been ingesting real documents with real API calls (see `docs/7b-in-progress.md`). The database should contain real policy documents, chunks with embeddings, extracted requirements, and evidence. Build against this real data, not synthetic test data.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Integration Test Checklist

#### 1. CLI Seed Flow
- Run `npx tsx scripts/seed.ts` with a subset (e.g., PA category + Easy example)
- Verify all policy docs reach 'complete' status
- Verify the Easy example has requirements extracted and evidence matched
- Check the database has correct data in all tables

#### 2. Compliance Browser
- Start `npm run dev`
- Open `http://localhost:3000`
- Verify: regulatory documents appear in sidebar
- Verify: clicking a document shows requirements with correct compliance stats
- Verify: evidence drilldown shows policy excerpts, page numbers, reasoning
- Verify: filtering by status works
- Verify: text search works

#### 3. Policy Explorer
- Navigate to `/policies`
- Verify: all policy categories show with correct counts
- Verify: clicking a category filters the list
- Verify: policy detail page shows full text and requirements satisfied

#### 4. Chat Interface
- Open the chat panel
- Ask: "How many requirements are met for the hospice APL?"
- Verify: model calls tools and returns accurate stats
- Ask: "Find policies about prior authorization"
- Verify: semantic search returns relevant results
- Ask: "Why is requirement 5 only partially met?"
- Verify: model provides specific evidence and reasoning

#### 5. Web Upload Flow
- Upload a PDF through the chat or upload button
- Verify: document appears in the sidebar with 'pending' status
- Verify: SSE or polling shows progress updates
- Verify: when complete, requirements and evidence appear in the browser

#### 6. Resume After Interruption
- Start processing a regulatory document
- Kill the server mid-processing
- Restart and re-trigger processing
- Verify: it picks up from where it left off

### Common Integration Issues to Check

1. **Database path**: Is the same SQLite database used by both CLI scripts and the Next.js app?
2. **Extension loading**: Does sqlite-vector load correctly in both CLI and Next.js contexts?
3. **Environment variables**: Are ANTHROPIC_API_KEY and OPENAI_API_KEY available in all contexts?
4. **File paths**: Do paths work correctly when running from different directories?
5. **Concurrent access**: Does SQLite handle concurrent reads from the web app while the CLI is writing?
6. **Build**: Does `npm run build` succeed with all the new code?
7. **Type errors**: Are there any TypeScript errors?

### Fixes and Polish

- Fix any broken links or navigation
- Ensure error states are handled gracefully in the UI
- Add loading states for any client-side data fetching
- Verify the app works without seeded data (empty state)
- Ensure the app works with only policy data (no regulatory docs yet)

### Production Build Test

```bash
npm run build
npm start
# Test all the above in production mode
```

## Acceptance Criteria

- `npm run build` succeeds with no errors
- CLI seed processes at least the PA category + Easy example successfully
- Compliance browser shows accurate data
- Evidence drilldown displays policy excerpts with page numbers
- Policy explorer shows all categories with correct counts
- Chat interface responds to queries using tools
- Semantic search returns relevant results
- The app starts cleanly with an empty database (no crashes on first load)
- The app handles the case where only policies are seeded (no regulatory docs)


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
