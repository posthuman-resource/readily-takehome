# Task 01: Project Setup

## Objective

Install all dependencies, configure TypeScript for scripts, set up project structure, environment variables, and the `$DATA_DIR` filesystem layout.

## Details

### Dependencies to install

**Production:**
- `ai` (Vercel AI SDK core)
- `@ai-sdk/anthropic` (Anthropic provider for Opus)
- `@ai-sdk/openai` (OpenAI provider for GPT-5.4-mini + embeddings)
- `drizzle-orm` (ORM)
- `better-sqlite3` (SQLite driver)
- `pdf-parse` (PDF text extraction - already installed)
- `zod` (schema validation for AI SDK structured output)
- `dotenv` (env var loading for scripts)

**Dev:**
- `drizzle-kit` (migrations)
- `@types/better-sqlite3`
- `tsx` (already installed)

**UI (install now, configure in task 11):**
- Initialize shadcn/ui: `npx shadcn@latest init`
- This will set up the component system for later tasks

### Important: Next.js 16 Considerations

This project uses Next.js 16.2.1. Before writing any code, read the relevant guide in `node_modules/next/dist/docs/`. Key differences from prior versions:

- **Turbopack is default** for both `next dev` and `next build`
- **Async Request APIs**: `cookies()`, `headers()`, `params`, `searchParams` must all be `await`ed
- **React 19.2**: View Transitions, useEffectEvent, Activity
- **Route params**: `{ params }: { params: Promise<{ id: string }> }` - must `await params`
- **RouteContext helper**: Use `RouteContext<'/path/[param]'>` for typed route handlers
- **PageProps helper**: Use `PageProps<'/path/[param]'>` for typed pages

Read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` for the full list of breaking changes.

### sqlite-vector Extension

The project needs `sqlite-vector` for vector similarity search. Research the npm package for sqlite-vector (it may be called `sqlite-vector` or `sqliteai-vector` on npm). The extension provides vector operations for SQLite. Install the appropriate package and verify the extension can be loaded with better-sqlite3.

### Project Structure

Create the following directories:
```
lib/           # Shared modules (pipeline, search, pdf, db)
scripts/       # CLI scripts (ingest, seed)
app/api/       # API routes (already exists via Next.js)
```

### Environment Configuration

Create `.env.example` with:
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DATA_DIR=/var/data
```

Create `lib/config.ts` that exports:
```typescript
export const DATA_DIR = process.env.DATA_DIR || '/var/data'
export const DB_PATH = path.join(DATA_DIR, 'db', 'app.sqlite')
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
export const REGULATORY_DIR = path.join(UPLOADS_DIR, 'regulatory')
export const POLICIES_DIR = path.join(UPLOADS_DIR, 'policies')
export const PROCESSING_DIR = path.join(DATA_DIR, 'processing')
```

Create a `lib/ensure-dirs.ts` utility that creates the DATA_DIR filesystem layout if it doesn't exist:
```
$DATA_DIR/
  db/
  uploads/
    regulatory/
    policies/
  processing/
```

### TypeScript Configuration for Scripts

Scripts run via `npx tsx` and need to import from `lib/`. Ensure `tsconfig.json` paths work for both Next.js and scripts. You may need to add `"ts-node": { "esm": true }` or similar. Test by running: `npx tsx -e "import { DATA_DIR } from './lib/config'; console.log(DATA_DIR)"`

### Load .env in Scripts

Scripts need env vars. Use `dotenv/config` at the top of script entry points, or create a `lib/env.ts` that calls `dotenv.config()` and is imported first. The Next.js app loads `.env` automatically.

## Acceptance Criteria

- `npm install` succeeds with all dependencies
- `npx tsx -e "import { DATA_DIR } from './lib/config'; console.log(DATA_DIR)"` prints the data dir path
- `npx tsx -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); console.log(db.prepare('SELECT 1').get())"` succeeds
- `.env.example` exists with all required variables documented
- `lib/config.ts` exports all path constants
- `lib/ensure-dirs.ts` creates the directory structure
- `npm run build` succeeds (Next.js build still works after adding dependencies)
