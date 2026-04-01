@AGENTS.md

# Readily Compliance Auditor

## What This Is

A take-home assignment for Readily, a healthcare compliance company. The goal is to build an AI-powered Compliance Policy Browser that automates the manual process of auditing organizational policies against regulatory requirements.

**Live site:** https://readily.codes
**Deployed on:** Render.com (persistent disk at `/var/data`, auto-deploys on git push)

## How This Project Was Built

This codebase was bootstrapped by Claude Code (Opus) following a detailed spec in `docs/primer.md`. The init process:

1. **Research** (Phase 1): Investigated Vercel AI SDK, sqlite-vector, Drizzle ORM, pdf-parse, shadcn/ui, Next.js 16, SSE patterns, Render.com limits
2. **Corpus Reconnaissance** (Phase 2): Built and ran scripts (`scripts/recon/`) to survey all 375 policy PDFs. Key finding: all docs are clean, extractable, uniform policy documents with numbered sections. ~2.8M tokens total, $0.06 to embed. No OCR needed.
3. **Task Planning** (Phase 3): Created 16 task files in `docs/init/` covering the full build
4. **Task Runner** (Phase 4): Built `scripts/run-tasks.ts` which feeds each task to a Claude Code instance sequentially

Tasks are executed by `npx tsx scripts/run-tasks.ts`. Each task commits with `[task-complete] NN-task-name`.

## Architecture

- **Next.js 16** (App Router, Turbopack, React 19.2) - see AGENTS.md for breaking changes
- **SQLite** (better-sqlite3 + Drizzle ORM) for all persistence
- **sqlite-vector** (`@sqliteai/sqlite-vector`) for semantic similarity search
- **Claude Opus 4.6** for requirement extraction + evidence evaluation (ingestion pipeline)
- **OpenAI GPT-5.4-mini** for the chat interface
- **OpenAI text-embedding-3-small** (1536 dims) for policy chunk embeddings
- **pdf-parse v2** for PDF text extraction (use `PDFParse` class, not the v1 default export)
- **Vercel AI SDK** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) for all AI operations
- **shadcn/ui** + Tailwind CSS v4 for UI components

### Key Data Flow

1. **Offline ingestion** (CLI scripts or API): PDFs -> text extraction -> chunking -> embedding -> SQLite
2. **Requirement extraction** (Opus): Regulatory doc text -> structured requirements list
3. **Evidence matching** (Opus): For each requirement, vector search -> candidate chunks -> Opus evaluation
4. **Web app**: Reads pre-computed results from SQLite. Chat layer adds interactivity on top.

### Database

SQLite at `$DATA_DIR/db/app.sqlite` with tables: `regulatory_documents`, `requirements`, `policy_documents`, `policy_chunks` (with vector embeddings), `evidence`, `chat_messages`. See `lib/db/schema.ts`.

### The Pipeline

`lib/pipeline.ts` exports `processDocument(id, type)` - called by both CLI (`scripts/ingest.ts`) and API (`POST /api/ingest`). It's resumable: reads status from DB and picks up where it left off.

## Environment Variables

- `ANTHROPIC_API_KEY` - for Opus (ingestion pipeline)
- `OPENAI_API_KEY` - for embeddings + chat
- `DATA_DIR` - persistent storage path (default: `/var/data`)

## Corpus Facts (from recon)

- 375 PDFs across 10 categories (AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA)
- GG is largest (144 docs), then MA (69), HH (47), PA (38)
- All have extractable text, numbered sections, clean output
- Median 8 pages, mean 10.1, max 145 (Hard example)
- Two example input docs: Easy (14 pages, 64 structured requirements) and Hard (145 pages, narrative prose)
- Full recon data in `docs/recon/`

## AI SDK Notes

These may differ from your training data. When in doubt, use context7 MCP to look up current docs.

- `generateObject` is **deprecated** - use `generateText` with `Output.object({ schema })` instead
- `maxSteps` is **deprecated** - use `stopWhen: stepCountIs(N)` instead
- Tool definitions use `inputSchema` (not `parameters`)
- `useChat` imports from `@ai-sdk/react` (not `ai/react`)
- `useChat` v6 API: returns `{ messages, sendMessage, status }` — NOT `input`/`handleSubmit`/`isLoading`. Manage input state yourself. Use `sendMessage({ text })` to send. Status is `'submitted' | 'streaming' | 'ready' | 'error'`.
- `useChat` v6 requires a `transport` option: `new DefaultChatTransport({ api: '/api/chat' })` imported from `'ai'`
- Message parts use typed tool format: `part.type === 'tool-<toolName>'` with `part.state` (`'input-streaming' | 'input-available' | 'output-available' | 'output-error'`), `part.input`, `part.output` directly on the part — NOT `part.toolInvocation`
- Streaming markdown: `streamdown` package
- **Anthropic API rejects `minimum`/`maximum` on number types** in JSON schema. Don't use Zod `.min()`/`.max()` on `z.number()` in schemas passed to Anthropic models — use `.describe()` instead.

## Next.js Gotchas

- `better-sqlite3`, `sqlite-vec`, and `@sqliteai/sqlite-vector` must be listed in `serverExternalPackages` in `next.config.ts`. Without this, Turbopack bundles them and `import.meta.resolve` fails at runtime.
- `pdf-parse` (pdfjs-dist) also fails under Turbopack dev server because it can't resolve its worker module. It works fine when run via `tsx` scripts. Add `pdfjs-dist` to `serverExternalPackages` if needed in future tasks.

## For Task Executors

- The task plan lives in `docs/init.md` and `docs/init/*.md`
- Each task has acceptance criteria that must pass before committing
- If you discover something important that future tasks should know (undocumented APIs, gotchas, architectural decisions), add it to this file under a relevant section. This file is read by every subsequent task executor.
