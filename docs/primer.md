# Readily Takehome: Regulatory Compliance Auditor

## Primer for Claude Code

You are building a web application for a healthcare compliance company called Readily. The app is a **Compliance Policy Browser**: a pre-built, fully indexed knowledge base where users can browse regulatory requirements, see which organizational policies satisfy them, and drill into evidence, all before they ever interact with the system. Users can also upload new regulatory documents to expand the knowledge base.

**Read this entire primer before doing anything.** Then follow the instructions at the bottom to research, plan, and build.

---

## Context

Healthcare organizations must demonstrate compliance with regulatory requirements issued by agencies like DHCS (California Department of Health Care Services). They regularly audit their internal policies against these regulatory documents and provide excerpts as evidence of compliance.

Today this is manual. The goal is to automate it with AI.

## What the App Does

The app has two layers: a **pre-built compliance knowledge base** and an **interactive chat interface** for deeper exploration.

### Layer 1: Compliance Knowledge Base (ready on first load)

All regulatory documents (the "input docs" like the Easy and Hard examples) and all organizational policy documents (the `data/Public Policies/` corpus) are ingested and analyzed at build time via CLI scripts. When a user opens the app, they see:

1. **Regulatory Document Browser**: A list/sidebar of all ingested regulatory documents. Click one to see its extracted requirements.
2. **Requirements Dashboard**: For the selected regulatory document, a structured list of all extracted requirements with:
   - Requirement number and text
   - Compliance status (met / not met / partial / unclear) indicated by color/icon
   - Summary stats at the top (e.g., "52 of 64 requirements met, 8 partial, 4 unclear")
3. **Evidence Drilldown**: Click any requirement to expand and see:
   - Which policy document(s) provide evidence
   - The specific page(s) and excerpt(s) from each matching policy
   - The AI's reasoning for the compliance determination
4. **Policy Explorer**: A separate view to browse the organizational policy corpus by category (AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA), search across all policies, and see which requirements each policy satisfies.

### Layer 2: Interactive Chat (for exploration and new documents)

A chat interface (accessible as a panel or overlay) that lets users:

1. Ask questions about specific requirements, policies, or compliance gaps ("Which requirements are we failing on?", "What does policy GG.1508 say about retrospective requests?")
2. Upload a NEW regulatory document (PDF) to add to the knowledge base. The system will extract requirements, run evidence matching, and add results to the browseable database.
3. Get AI-powered analysis: "Compare our hospice compliance to our ECM compliance", "What are the highest-risk gaps?", etc.

### The Key Insight

The expensive work (PDF ingestion, requirement extraction, evidence matching) happens **offline via CLI scripts**, not in real-time during the user session. The web app is primarily a viewer/browser of pre-computed results, with the chat layer adding interactivity on top. This makes the UX fast and responsive.

### Online Ingestion: How New Document Uploads Work

The online upload path uses the **same `processDocument()` function** as the CLI. The only difference is the entry point and how progress is communicated.

#### The Flow

1. **User uploads PDF** (via chat or a dedicated upload button in the browser UI)
2. `POST /api/ingest` saves the file to `$DATA_DIR/uploads/regulatory/`, creates a DB record with status `pending`, and returns the document ID immediately.
3. The same route (or a follow-up call) starts `processDocument(documentId)` as a long-lived SSE response, streaming status updates as each step completes.
4. The frontend connects to `GET /api/ingest/[documentId]/progress` (SSE) to show real-time updates. If the connection drops, the frontend reconnects and reads current status from the DB.
5. The compliance browser shows the document immediately with a progress indicator. As requirements and evidence are written to the DB, they appear in the UI.

#### The Status State Machine

Every document has a `status` field in the DB:

```
pending → extracting_text → extracting_requirements → matching_evidence → complete
                                                            ↑
                                                     (tracks progress:
                                                      "12 of 64 matched")
```

If any step fails, status becomes `error` with a message. The pipeline is resumable: calling `processDocument()` again on a partially-processed document picks up where it left off.

#### Why This Works

- **No background job system needed.** The SSE route runs the pipeline inline. If the client disconnects, the server-side request keeps running until it completes or times out.
- **Resumable by design.** Status is in the DB. If the server restarts mid-processing, a startup check can find documents stuck in non-terminal states and re-queue them.
- **Same code path as CLI.** `scripts/ingest.ts` and `POST /api/ingest` both call `processDocument()`. The only difference: the CLI blocks and logs to stdout; the API route streams SSE events.
- **Render.com timeout**: Research Render's max request timeout. The SSE route may need to stay alive for 5-10 minutes. If Render caps this, the pipeline's built-in resumability means the frontend can just re-trigger processing and it picks up where it left off.

## Document Corpus: What We Know and What We Don't

### Two Example Input Documents

We've been given two example regulatory input documents. These illustrate a range, but they are NOT the full picture.

**Easy: Structured Checklist (APL 25-008 Submission Review Form)**
- 14 pages, 64 numbered requirements
- Each is a yes/no question: "Does the P&P state..."
- Clearly delimited, references specific APL sections

**Hard: Narrative Policy Guide (CalAIM ECM Policy Guide)**
- 145 pages of dense policy prose
- Requirements embedded in narrative: "MCPs must...", "MCPs are required to..."
- No numbered checklist; requirements woven throughout sections, tables, appendices

### The Policy Corpus: 200+ PDFs We Haven't Looked At

The `data/Public Policies/` directory contains ~200+ organizational policy PDFs across 10 categories (AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA). These are the documents we need to search for evidence. **We have not examined their contents.** Before designing the ingestion pipeline, we need to understand:

- **Text extractability**: Are any of these scanned images (no extractable text)? Do any have garbled fonts?
- **Size distribution**: Are these 3-page memos or 100-page manuals? This affects chunking strategy and processing time.
- **Structure variety**: Tables? Multi-column layouts? Headers/footers that will pollute text extraction? Embedded images or forms?
- **Content patterns**: What does policy text actually look like? Is it structured with numbered sections, or free-form prose?
- **Encoding issues**: Any PDFs that fail to parse at all?

### Mandatory: Corpus Reconnaissance Before Planning

**Before writing ANY task plan**, you must run a reconnaissance phase across the entire document corpus. This is not optional. Build and run small utility scripts that answer the questions above. Specifically:

#### Recon Script 1: `scripts/recon/corpus-survey.ts`

For every PDF in `data/Public Policies/` and the example input docs:
- Extract page count
- Try text extraction on page 1; record whether it returns real text, empty string (scanned), or garbled output
- Record file size
- Output a CSV/JSON summary: `filename, category, pages, fileSize, hasExtractableText, firstPageTextLength, firstPageSample`

This gives you the shape of the problem. Run it and examine the output before proceeding.

#### Recon Script 2: `scripts/recon/spot-check.ts`

Take a stratified sample: pick 2-3 random PDFs from each category (AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA). For each:
- Extract full text
- Send the first ~2000 tokens to a cheap model (GPT-5.4-nano or GPT-5.4-mini, NOT Opus) with a prompt like:

```
Analyze this policy document excerpt and classify it:
1. Document type: (policy, procedure, guideline, form, reference, other)
2. Structure: (numbered sections, narrative prose, tables, mixed)
3. Complexity: (simple/single-topic, moderate/multi-section, complex/comprehensive)
4. Estimated requirement density: (none, low, medium, high)
   - i.e., how many "must", "shall", "required to" statements per page?
5. Any extraction concerns: (clean text, has tables, has forms, multi-column, garbled, other)

Respond as JSON.
```

- Aggregate the results into a report: `docs/recon/corpus-analysis.md`

#### Recon Script 3: `scripts/recon/extraction-stress-test.ts`

Pick the 5 largest PDFs and the 5 smallest. For each:
- Extract ALL text with page numbers
- Measure: total character count, tokens (rough estimate at 4 chars/token), extraction time
- Check for common problems: pages with zero text (scanned pages within an otherwise text PDF), extremely long pages (possible table dumps), repeated headers/footers

#### What to Do With Recon Results

The recon output goes into `docs/recon/` and MUST be read before writing the task plan. The findings will inform:

- **Chunking strategy**: If docs are mostly short (< 10 pages), larger chunks are fine. If some are 100+ pages, you need smarter chunking with overlap.
- **Scanned doc handling**: If any PDFs are scanned, you need OCR or to skip them and document the gap.
- **Text cleaning**: If headers/footers repeat on every page, you need a cleaning step.
- **Processing budget**: Total token count across all docs tells you how much embedding will cost and how long ingestion takes.
- **Edge cases**: Any PDFs that fail to parse need to be handled gracefully (log and skip, don't crash the pipeline).

The recon phase should also produce a recommended document classification taxonomy that goes beyond just "easy" and "hard." The actual corpus might reveal 3-5 distinct document types that need different handling.

**Your solution must handle whatever you find.** Don't design for two document types and hope the rest fit.

## Architecture

### Stack

- **Framework**: Next.js (App Router, already initialized)
- **Language**: TypeScript everywhere
- **Database**: Drizzle ORM + SQLite for all persistence
- **Vector Search**: sqlite-vector (https://github.com/sqliteai/sqlite-vector) for semantic similarity search over policy chunks
- **AI Models** (three models, two providers, each with a specific role):
  - **Claude Opus 4.6** (`claude-opus-4-6` via `@ai-sdk/anthropic`): The "intelligence" model. Used by the ingestion pipeline (both CLI and API) for requirement extraction from regulatory docs and evidence evaluation against policy chunks. This is where reasoning quality matters most.
  - **OpenAI GPT-5.4-mini** (`gpt-5.4-mini` via `@ai-sdk/openai`): The chat model. $0.75/1M input, $4.50/1M output. Fast, 400k context window, excellent tool use. Handles the conversational interface, orchestrating structured + unstructured search. Semantically compatible with OpenAI embeddings.
  - **OpenAI text-embedding-3-small** (via `@ai-sdk/openai`): Embeddings for all vector search. 1536 dimensions, supports Matryoshka dimensionality reduction. Used to embed policy chunks during ingestion AND user queries at search time. Same provider as the chat model so they share a semantic space. If retrieval quality is insufficient, can upgrade to `text-embedding-3-large` (3072 dimensions) at higher cost.
- **AI SDK**: Use Vercel's AI SDK packages. Before writing any AI code, research what's available:
  - `ai` (core): streaming, tool calling, generateText, generateObject, streamText, embed, embedMany
  - `@ai-sdk/anthropic`: Anthropic provider (for Opus in the ingestion pipeline)
  - `@ai-sdk/openai`: OpenAI provider (for GPT-5.4-mini chat + embeddings)
  - `ai/react`: useChat, useCompletion hooks
  - Check if there are packages for streaming markdown rendering (streamdown or similar)
  - Use `context7` MCP to look up latest docs for `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, and any other Vercel AI packages
- **PDF Processing**: `pdf-parse` or `pdfjs-dist` for text extraction in Node.js
- **Styling**: Tailwind CSS + shadcn/ui components
- **Deployment**: Render.com single instance with persistent disk at a configurable path (default `/var/data`)

### Data Flow

There is **one ingestion pipeline** with **two entry points** (CLI and API). Both write PDFs to the same directory on the persistent disk and call the same processing functions.

#### Filesystem Layout (on persistent disk at `DATA_DIR`)

```
$DATA_DIR/
├── db/
│   └── app.sqlite          # All application data
├── uploads/
│   ├── regulatory/          # Regulatory docs (input docs to extract requirements from)
│   │   ├── apl-25-008.pdf
│   │   ├── calaim-ecm.pdf
│   │   └── ...
│   └── policies/            # Organizational policy corpus
│       ├── AA/
│       ├── CMC/
│       ├── DD/
│       └── ...              # Mirrors data/Public Policies/ structure
└── processing/              # Temp files during extraction (cleaned up after)
```

On first run (or via a setup script), `data/Public Policies/` is copied into `$DATA_DIR/uploads/policies/`. The example input docs go into `$DATA_DIR/uploads/regulatory/`. After that, both CLI and web uploads just drop files into these same directories.

#### The Unified Pipeline

```
[Entry Point: CLI or API route]
         |
         v
[1. Place PDF in $DATA_DIR/uploads/{regulatory|policies}/]
         |
         v
[2. Create DB record with status: pending]
         |
         v
[3. processDocument(documentId)]  <-- SAME FUNCTION, called by both CLI and API
         |
         ├── Extract text (update status: extracting_text)
         ├── If regulatory doc:
         │   ├── Extract requirements via Opus (status: extracting_requirements)
         │   ├── For each requirement:
         │   │   ├── Semantic search against policy chunks
         │   │   ├── Evidence evaluation via Opus
         │   │   └── Save evidence (status: matching_evidence, progress: "N of M")
         │   └── Done (status: complete)
         └── If policy doc:
             ├── Chunk text with overlap
             ├── Generate embeddings via OpenAI
             ├── Store chunks + embeddings (status: complete)
             └── Done
```

**The core processing function (`lib/pipeline.ts`)** takes a document ID, reads its status from the DB, and resumes from wherever it left off. It updates status at each step. This function is called by:

- **CLI**: `scripts/ingest.ts <path-to-pdf> [--type regulatory|policy]` copies the file to `$DATA_DIR/uploads/`, creates the DB record, calls `processDocument()`, and blocks until complete.
- **API route**: `POST /api/ingest` accepts a file upload, saves it to `$DATA_DIR/uploads/`, creates the DB record, calls `processDocument()` in the request handler (long-lived SSE response streaming progress events).
- **Seed script**: `scripts/seed.ts` loops through all files in `data/` and calls the CLI ingestion for each. Just a thin wrapper.

#### Online Web App (reading pre-computed data)

```
User opens app
    |
    v
[Compliance Browser] -- reads pre-computed results from SQLite
    |                    regulatory docs > requirements > evidence
    |
    v
[Chat Panel] -- GPT-5.4-mini with tools that can:
                 - query the database (structured search)
                 - search policy chunks (vector search)
                 - trigger ingestion of a new upload
                 - check ingestion status
```

### Database Schema (Drizzle + SQLite)

Think about these tables:

- `regulatory_documents`: ingested regulatory documents (id, filename, title, description, pageCount, status [pending/processing/complete/error], rawText, createdAt)
- `requirements`: extracted requirements (id, regulatoryDocumentId, requirementNumber, text, reference, category/section, status [met/not_met/partial/unclear], createdAt)
- `policy_documents`: metadata for each organizational policy PDF (id, filename, category [AA/CMC/DD/etc], title, pageCount, status [pending/processing/complete/error], rawText, createdAt)
- `policy_chunks`: chunked policy text with embeddings (id, policyDocumentId, pageNumber, chunkIndex, text, embedding)
- `evidence`: matched evidence linking requirements to policy chunks (id, requirementId, policyChunkId, status [met/not_met/partial/unclear], excerpt, reasoning, confidence)
- `chat_messages`: conversation history (id, role, content, createdAt)

### Dual Search Architecture

The chatbot performs **structured search** and **unstructured search** simultaneously, letting the AI model decide which tools to invoke based on the user's question.

**Structured Search** (SQL queries via Drizzle):
- Query the requirements table: filter by status, regulatory document, requirement number, text search
- Query the evidence table: find which policies match which requirements, aggregate compliance stats
- Query policy_documents: browse by category, filename, metadata
- Examples: "How many requirements are unmet?", "Which policies are in the GG category?", "Show me requirement 18"

**Unstructured Search** (vector similarity via sqlite-vector + OpenAI embeddings):
- Embed the user's query using `text-embedding-3-small`
- Search the policy_chunks table for semantically similar text
- Return the top-K chunks with their source document, page number, and surrounding context
- Examples: "What do our policies say about prior authorization?", "Find anything about hospice election forms", "Do we have a policy on dual eligible members?"

**The chat model (GPT-5.4-mini) orchestrates both.** It has tool definitions for:

**Query tools (fast, read-only):**
1. `queryRequirements({ regulatoryDocId?, status?, searchText? })`: Structured DB query returning requirements with their evidence
2. `queryPolicies({ category?, searchText? })`: Structured DB query for policy document metadata
3. `semanticSearch({ query, topK? })`: Vector search across all policy chunks
4. `getRequirementDetail({ requirementId })`: Full detail on a specific requirement including all evidence
5. `getComplianceSummary({ regulatoryDocId? })`: Aggregated stats (met/not_met/partial/unclear counts)

**Ingestion tools (trigger/monitor the ingestion pipeline):**
6. `startIngestion({ filePath })`: Save uploaded PDF, create DB record, kick off the ingestion API route. Returns the document ID immediately.
7. `getIngestionStatus({ documentId })`: Check current status of an in-progress ingestion (what step it's on, how many requirements matched so far, any errors).

The model decides which tools to call based on what the user is asking. For queries, it picks the right combination of read tools. For uploads, it calls `startIngestion`, then can call `getIngestionStatus` to report progress. The actual processing happens server-side independent of the chat connection.

### Chat Interface

The chat is a secondary interaction layer, not the primary interface. It lives as a side panel or overlay accessible from any view in the compliance browser. It uses Vercel AI SDK with tool calling to:

1. **Query the knowledge base**: "Which requirements does policy GG.1508 satisfy?", "Show me all unmet requirements for the hospice APL"
2. **Search policies**: "Find policies that mention prior authorization for hospice"
3. **Analyze gaps**: "What are our biggest compliance risks?", "Which categories have the most gaps?"
4. **Upload new regulatory docs**: User drops a PDF into chat or uses an upload button in the browser. The system kicks off ingestion server-side. The browser shows the document with a progress indicator; results appear as they're computed. The chat can report on status ("Your document is 40% through evidence matching").
5. **Explain evidence**: "Why did you mark requirement 18 as partial?", "What would we need to add to policy GG.1107 to fully satisfy this?"

Use Vercel AI SDK's tool calling / function calling support to define these as tools that the chat model can invoke.

### Primary UI: Compliance Browser

The main interface should feel like a structured dashboard, not a blank chat window. Think of it as three connected views:

**1. Document List (left sidebar or top-level page)**
- Lists all ingested regulatory documents
- Shows summary stats per document (X requirements, Y% compliant)
- Click to drill into a document

**2. Requirements View (main content area)**
- For the selected regulatory document
- Top: summary bar (met/partial/not_met/unclear counts, maybe a donut chart)
- Below: filterable, searchable list of requirements
- Each requirement row shows: number, truncated text, status badge, number of evidence matches
- Click to expand inline or navigate to detail view

**3. Evidence Detail (expanded view or right panel)**
- Full requirement text with reference
- List of matching policies with:
  - Policy filename and category
  - Page number
  - Relevant excerpt (highlighted or quoted)
  - AI reasoning for the compliance determination
- Status can be manually overridden (stretch goal)

**4. Policy Explorer (separate tab/route)**
- Browse all 200+ policies by category
- Search across all policy text
- Click a policy to see its full text and which requirements it provides evidence for
- This gives users a "reverse lookup": instead of "does this requirement have evidence?", it's "what does this policy cover?"

### Key UX Considerations

- **Instant load**: The browser should load instantly since all data is pre-computed. No spinners on first page load.
- **Filtering and search**: Users need to quickly find specific requirements by text, status, category, or policy reference
- **Evidence quality indicators**: Make it visually clear when evidence is strong (met) vs weak (partial/unclear) vs missing (not_met)
- **Responsive evidence display**: For each requirement, show the source policy name, page number, and a short excerpt. Make it scannable.
- **Summary stats**: After full analysis, show an overview (X met, Y not met, Z unclear) with the ability to drill into any requirement
- **Chat for depth**: The chat panel should feel like having an expert you can ask questions, not the primary way to use the app
- **Progress for new uploads**: When a user uploads a new regulatory doc, the document appears immediately in the compliance browser with a progress indicator. The browser polls or connects via SSE to show real-time status: "Extracting text... Extracting requirements... Matching evidence: 12 of 64..." The user can navigate away and come back; progress continues server-side.

### Deployment Configuration

- **Render.com**: Single web service, Node.js runtime
- **Persistent Disk**: Mounted at configurable path (env var `DATA_DIR`, default `/var/data`). Contains the SQLite database, uploaded PDFs, and processing temp files. All survive restarts.
- **First-run setup**: `scripts/seed.ts` copies `data/Public Policies/` into `$DATA_DIR/uploads/policies/` and the example input docs into `$DATA_DIR/uploads/regulatory/`, then runs the ingestion pipeline for everything. This should be run once before the app serves users.
- **Environment Variables**:
  - `ANTHROPIC_API_KEY`: Required (for Opus in the ingestion pipeline)
  - `OPENAI_API_KEY`: Required (for embeddings + chat model)
  - `DATA_DIR`: Path to persistent storage (default `/var/data`)
  - Any other config should be env-driven

---

## Instructions for Claude Code

### Phase 1: Research

Before planning any tasks, research the following using `context7` and web searches:

1. **Vercel AI SDK**: Look up the latest docs for `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `ai/react`. Understand:
   - How to use `generateObject` with Zod schemas for structured extraction (for Opus requirement extraction)
   - How to define and use tools with `streamText` (for the chat model's tool calling)
   - How `useChat` works on the client side with tool invocations
   - What streaming capabilities exist (streamText, streamObject)
   - How to handle multi-step tool calls
   - How to use `embed` and `embedMany` from the AI SDK with OpenAI's embedding model
   - How to switch between providers (Anthropic for ingestion pipeline, OpenAI for chat + embeddings)

2. **SSE in Next.js App Router**: Research how to implement Server-Sent Events from a Next.js API route. The ingestion progress endpoint needs to stream status updates to the frontend. Understand how long-lived connections work on Render.com.

3. **sqlite-vector**: Read the README at https://github.com/sqliteai/sqlite-vector. Understand:
   - How to create vector columns
   - How to perform similarity search
   - How to integrate with better-sqlite3 or the driver Drizzle uses

4. **Drizzle ORM with SQLite**: Look up how to use Drizzle with better-sqlite3 or libsql. Understand:
   - Schema definition
   - Migrations
   - Custom SQL for vector operations

5. **PDF text extraction in Node.js**: Research `pdf-parse`, `pdfjs-dist`, or `unpdf`. Pick one that gives you text + page numbers reliably.

6. **shadcn/ui**: Check what components are available for chat interfaces, file upload, progress indicators, tables.

7. **OpenAI Embeddings via AI SDK**: Research how `embed` and `embedMany` work with `@ai-sdk/openai` and `text-embedding-3-small`. Understand:
   - Dimensions (1536 default, supports Matryoshka reduction to 512/256 via `dimensions` param)
   - Batch limits for `embedMany`
   - How to store the resulting float arrays in sqlite-vector
   - Cost: $0.02/1M tokens, so embedding 200+ PDFs worth of chunks should be cheap
   - Note: `text-embedding-3-small` and `text-embedding-3-large` are still OpenAI's latest embedding models as of March 2026. No newer embedding models have been released.

### Phase 2: Corpus Reconnaissance

**This phase MUST complete before you write any task plan.** The recon scripts described in the "Document Corpus" section above need to be built and run. Specifically:

1. Build `scripts/recon/corpus-survey.ts`: survey every PDF in the repo for page count, file size, text extractability. Output to `docs/recon/corpus-survey.json`.
2. Build `scripts/recon/spot-check.ts`: stratified sample of 2-3 PDFs per category, send first ~2000 tokens to GPT-5.4-nano for classification. Output to `docs/recon/spot-check.json`.
3. Build `scripts/recon/extraction-stress-test.ts`: test the 5 largest and 5 smallest PDFs for full text extraction. Output to `docs/recon/stress-test.json`.
4. Write `docs/recon/corpus-analysis.md` summarizing findings: document type taxonomy, size distribution, extraction issues, recommended handling strategies per type.

Install minimal dependencies needed for these scripts (a PDF text extraction library, the OpenAI SDK for the spot-check). These recon scripts are throwaway tooling, not part of the final app, but their output directly informs the task plan.

**After running recon**, read the `docs/recon/corpus-analysis.md` report and use it to inform your decisions about:
- Chunking strategy and chunk size
- Whether you need OCR or can skip scanned docs
- Text cleaning requirements (headers, footers, page numbers)
- How to categorize documents in the schema
- Estimated total tokens for embedding cost projection
- Which categories to prioritize vs treat as stretch

### Phase 3: Plan

After research AND reconnaissance, create the task plan. The plan lives in:

- `docs/init.md`: High-level project overview + links to each task
- `docs/init/01-project-setup.md` through `docs/init/NN-final-task.md`: Individual task files

Each task file must contain:

```markdown
# Task NN: [Title]

## Objective
One paragraph describing what this task accomplishes.

## Details
Detailed instructions for what to build/change.

## Acceptance Criteria
Specific, runnable verification steps. Examples:
- `npx tsx scripts/test-pdf-extraction.ts data/Example_Input_Doc_-_Easy.pdf` prints 64 requirements
- `curl http://localhost:3000/api/health` returns `{"status":"ok","policiesIndexed":true}`
- `npx drizzle-kit check` succeeds with no pending migrations
- Open http://localhost:3000, upload Easy PDF, see requirements listed within 30 seconds

Every task MUST have at least one concrete verification step. 
"npm run build succeeds" is acceptable as ONE criterion but never as the ONLY one.
```

### Suggested Task Breakdown

This is a guide, not a prescription. **Adjust based on your research AND reconnaissance findings.** The recon results in `docs/recon/corpus-analysis.md` should directly shape tasks 3-8.

1. **Project Setup**: Install dependencies, configure TypeScript, set up project structure, env vars, `$DATA_DIR` filesystem layout (`db/`, `uploads/regulatory/`, `uploads/policies/`, `processing/`)
2. **Database Schema**: Drizzle schema for all tables (regulatory_documents, requirements, policy_documents, policy_chunks, evidence, chat_messages). Include `status` field with the state machine on both document types. Migrations, SQLite setup with sqlite-vector extension.
3. **PDF Text Extraction Module**: `lib/pdf.ts`, reusable module that takes a PDF path, returns text with page numbers. Test against both Easy and Hard examples AND against edge cases identified during recon. Include text cleaning logic if recon shows it's needed.
4. **Core Pipeline Module**: `lib/pipeline.ts`, the `processDocument(documentId)` function. Implements the state machine: reads status from DB, resumes from wherever it left off, updates status at each step. Handles both regulatory docs (extract requirements + match evidence) and policy docs (chunk + embed). Accepts an optional progress callback for SSE streaming. This is THE central piece of the app.
5. **Policy Ingestion (chunking + embedding)**: The policy-doc branch of `processDocument()`. Chunks text into ~500 token overlapping chunks, generates embeddings via OpenAI `text-embedding-3-small`, stores in policy_chunks. Chunking strategy informed by recon findings.
6. **Requirement Extraction**: The regulatory-doc branch of `processDocument()`. Calls Claude Opus to extract structured requirements. Must handle document types identified during recon. Design the extraction prompt to be robust across structured checklists, narrative prose, and whatever other formats recon revealed.
7. **Evidence Matching**: The evidence-matching step within `processDocument()`. For each requirement: semantic search against policy chunks, then Opus evaluation. Stores results in evidence table. Resumable (tracks which requirements are already matched).
8. **Vector Search Utility**: `lib/search.ts`, function that takes a query string, embeds it, returns top-K similar policy chunks from sqlite-vector. Used by both evidence matching and the chat's semantic search tool.
9. **CLI Entry Point**: `scripts/ingest.ts <path> [--type regulatory|policy]` copies file to `$DATA_DIR/uploads/`, creates DB record, calls `processDocument()`, logs progress to stdout. `scripts/seed.ts` loops through `data/` and calls this for every file.
10. **API Entry Point**: `POST /api/ingest` accepts file upload, saves to `$DATA_DIR/uploads/`, creates DB record, calls `processDocument()` with SSE progress streaming. `GET /api/ingest/[documentId]/progress` returns current status from DB (SSE or JSON).
11. **Compliance Browser: Document List & Requirements Dashboard**: Next.js pages/components for the primary UI. Server components that read from SQLite. Document sidebar (including in-progress docs with status indicators), requirements list with status badges, summary stats.
12. **Compliance Browser: Evidence Drilldown & Policy Explorer**: Expand-to-see-evidence UI, policy browsing by category, search across policies.
13. **Chat Backend**: API route using Vercel AI SDK with tool definitions for querying the knowledge base, searching policies, analyzing gaps, triggering ingestion, checking ingestion status.
14. **Chat Frontend**: React chat panel component using useChat, with file upload support for new regulatory docs, streaming responses.
15. **End-to-End Integration & Testing**: Verify the full flow with both CLI and web upload paths. Test with Easy and Hard examples. Test resume after interruption.
16. **Deploy Config**: Render.com setup, persistent disk at `$DATA_DIR`, production build, environment variables.

### Phase 4: Create the Task Runner

Create `scripts/run-tasks.ts` that:

1. Reads all task files from `docs/init/` in order (sorted by filename)
2. Checks git history for commits whose message starts with `[task-complete] NN-task-name`
3. For each incomplete task:
   - Reads the task file content
   - Passes it to `ANTHROPIC_API_KEY="" claude -p --model opus --effort max --dangerously-skip-permissions` as a prompt, along with context about the project (setting the API key to empty string forces claude to use the logged-in account rather than consuming API credits)
   - The prompt should include: the task file content, the project's current state, and instructions to commit with the message format `[task-complete] NN-task-name` when done
   - Waits for completion
   - Moves to the next task
4. Handles Ctrl+C by forwarding SIGINT to the child `claude` process, then exiting cleanly
5. Is idempotent: can be stopped and resumed, picking up from the last incomplete task

```typescript
// scripts/run-tasks.ts
// Key implementation notes:
// - Use child_process.spawn to run claude CLI
// - Forward stdin/stdout/stderr for visibility
// - Trap SIGINT and forward to child process
// - Parse git log to find completed tasks
// - Read task files sorted numerically
// - Pass task content via stdin or temp file to claude -p
```

The runner script should be created AS PART of the planning phase (i.e., before executing any tasks). The tasks themselves will be executed by the runner.

---

## Important Notes

- **Time constraint**: The original takehome says ~2 hours. We're using AI tooling to go further, but still: prefer working solutions over perfect ones.
- **Deliverables are non-negotiable**: The takehome requires (1) a live URL and (2) a GitHub repo. Deployment must actually work. Don't leave it for last. **Deploy early, not last.**
- **AI tools encouraged**: The takehome explicitly says to use AI tools. This entire pipeline is AI-assisted.
- **The Easy example**: Should definitely work end-to-end. If you can only get one working, prioritize this.
- **The Hard example**: Stretch goal. The requirement extraction is genuinely harder here, but the same pipeline should work with a good enough extraction prompt.
- **Offline ingestion is king**: The CLI scripts that seed the database are the backbone. If the browser works but the chat doesn't, that's still a strong submission. If the chat works but there's nothing pre-computed to browse, that's a weak submission.
- **Policy corpus**: There are ~200+ policy PDFs across 10 subdirectories (AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA). Ingesting all of them takes time. Consider starting with a subset for development (e.g., just GG and HH which are most likely to contain hospice and care management policies), then expanding.
- **Don't over-engineer**: SQLite + sqlite-vector is sufficient. Don't reach for Postgres, Pinecone, or anything external.
- **Render.com deployment**: A `render.yaml` or equivalent config should be created. The seeded SQLite database should be part of the persistent disk, not regenerated on every deploy.

## Sample Data Characteristics

From examining the provided data:

**Easy PDF (APL 25-008 Hospice Submission Review Form)**:
- 14 pages, 64 yes/no requirements
- Each requirement is structured as "Does the P&P state [specific policy requirement]?"
- Each includes a reference to a specific page in APL 25-008
- Topics: hospice election, benefit periods, provider networks, prior authorization, payment rates, dual eligibles, fraud prevention

**Hard PDF (CalAIM ECM Policy Guide)**:
- 145 pages of narrative policy
- Requirements use imperative language: "MCPs must...", "MCPs are required to...", "DHCS expects MCPs to..."
- Contains tables, implementation timelines, appendices
- Organized into 12 major sections with many subsections
- The "requirements" are not numbered or listed; they must be identified from prose

**Policy Corpus (data/Public Policies/)**:
- ~200+ PDFs across categories: AA (19 files), CMC (4), DD (11), EE (12), FF (24), GA (5), GG (110+), HH (46), MA (67), PA (37)
- File naming convention: `CATEGORY.NUMBER_CEO[date]_v[date].pdf`
- These are the organization's internal policies that should contain evidence of compliance
- GG category has by far the most files (110+), suggesting it covers the broadest policy area

---

## Begin

1. Research everything listed in Phase 1
2. **Run corpus reconnaissance** (Phase 2): build and execute the recon scripts, produce `docs/recon/corpus-analysis.md`
3. Read the recon results, then create `docs/init.md` and `docs/init/*.md` task files (Phase 3)
4. Create `scripts/run-tasks.ts` (Phase 4)
5. Do NOT begin executing tasks; only plan them

When creating the plan, think carefully about:
- **Recon findings come first**: Let the actual shape of the document corpus drive your architectural decisions, not assumptions based on two examples
- The offline ingestion pipeline is the foundation: PDF extraction, chunking, embedding, requirement extraction, evidence matching must all work as CLI scripts before any UI is built
- The web app is a thin read layer on top of pre-computed SQLite data; keep it simple
- How to handle the "cold start" problem (ingesting 200+ PDFs and running LLM analysis on them takes time and API calls)
- Edge cases that recon revealed (scanned docs, tables, multi-column layouts, garbled text, etc.)
- The chat layer should query the same database the browser reads from, not be a separate system
- Start with a working subset (Easy example + a few policy categories), then expand
