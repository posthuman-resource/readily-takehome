# Task 02: Database Schema

## Objective

Define the Drizzle ORM schema for all tables, set up SQLite with the sqlite-vector extension, generate and run migrations.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Schema Definition

Create `lib/db/schema.ts` with the following tables:

**`regulatory_documents`**
```typescript
- id: text (primary key, use crypto.randomUUID())
- filename: text (not null)
- title: text
- description: text
- pageCount: integer
- status: text (not null, default 'pending')
  // Values: 'pending' | 'extracting_text' | 'extracting_requirements' | 'matching_evidence' | 'complete' | 'error'
- statusMessage: text  // Error message or progress info
- rawText: text  // Full extracted text
- createdAt: text (not null, default sql`CURRENT_TIMESTAMP`)
```

**`requirements`**
```typescript
- id: text (primary key)
- regulatoryDocumentId: text (not null, foreign key -> regulatory_documents.id)
- requirementNumber: text  // "1", "2", "3a", etc.
- text: text (not null)  // The requirement text
- reference: text  // Section/page reference in source doc
- category: text  // Topic category if identifiable
- complianceStatus: text (default 'unclear')
  // Values: 'met' | 'not_met' | 'partial' | 'unclear'
- createdAt: text (not null, default sql`CURRENT_TIMESTAMP`)
```

**`policy_documents`**
```typescript
- id: text (primary key)
- filename: text (not null)
- category: text (not null)  // AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA
- title: text
- pageCount: integer
- status: text (not null, default 'pending')
  // Values: 'pending' | 'extracting_text' | 'chunking' | 'embedding' | 'complete' | 'error'
- statusMessage: text
- rawText: text
- createdAt: text (not null, default sql`CURRENT_TIMESTAMP`)
```

**`policy_chunks`**
```typescript
- id: text (primary key)
- policyDocumentId: text (not null, foreign key -> policy_documents.id)
- pageNumber: integer
- chunkIndex: integer
- text: text (not null)
- embedding: blob  // Float32Array serialized as Buffer (sqlite-vector uses raw binary)
- createdAt: text (not null, default sql`CURRENT_TIMESTAMP`)
```

**`evidence`**
```typescript
- id: text (primary key)
- requirementId: text (not null, foreign key -> requirements.id)
- policyChunkId: text (not null, foreign key -> policy_chunks.id)
- status: text (not null)  // 'met' | 'not_met' | 'partial' | 'unclear'
- excerpt: text  // The specific text from the policy that provides evidence
- reasoning: text  // AI's reasoning for the determination
- confidence: real  // 0-1 confidence score
- createdAt: text (not null, default sql`CURRENT_TIMESTAMP`)
```

**`chat_messages`**
```typescript
- id: text (primary key)
- role: text (not null)  // 'user' | 'assistant' | 'system'
- content: text (not null)
- createdAt: text (not null, default sql`CURRENT_TIMESTAMP`)
```

### Database Connection

Create `lib/db/index.ts`:
- Create and export a singleton Drizzle database instance
- Use better-sqlite3 as the driver
- Load the sqlite-vector extension on connection
- Use `DB_PATH` from `lib/config.ts`
- Call `ensureDirs()` before creating the database to ensure the directory exists
- Enable WAL mode for better concurrent read performance: `db.pragma('journal_mode = WAL')`

### sqlite-vector Setup

The sqlite-vector extension needs to be loaded into better-sqlite3. Research the correct way to:
1. Find the extension binary (it may be bundled with an npm package, or you may need to build it)
2. Load it via `db.loadExtension(path)` in better-sqlite3
3. Test that vector operations work: `SELECT vec_version()` or equivalent

For the embedding column in `policy_chunks`, store embeddings as binary blobs. sqlite-vector works with binary float arrays, not text. The embedding dimension is 1536 (text-embedding-3-small default).

### Drizzle Configuration

Create `drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATA_DIR
      ? `${process.env.DATA_DIR}/db/app.sqlite`
      : './data/db/app.sqlite',  // Local dev fallback
  },
})
```

### Migrations

Run `npx drizzle-kit generate` to generate migration SQL files, then apply them either:
- Via `npx drizzle-kit migrate` (push approach), OR
- Via a `lib/db/migrate.ts` that runs migrations programmatically on app start

### Indexes

Add indexes for common query patterns:
- `requirements.regulatoryDocumentId` (lookup requirements by document)
- `requirements.complianceStatus` (filter by status)
- `evidence.requirementId` (lookup evidence by requirement)
- `evidence.policyChunkId` (reverse lookup)
- `policy_chunks.policyDocumentId` (lookup chunks by document)
- `policy_documents.category` (filter by category)

## Acceptance Criteria

- `npx drizzle-kit generate` succeeds and produces migration files in `drizzle/`
- `npx tsx -e "import { db } from './lib/db'; import { regulatoryDocuments } from './lib/db/schema'; console.log('DB connected')"` succeeds
- Running the sqlite-vector version check query succeeds (e.g., `SELECT vec_version()` or similar)
- All 6 tables are created with the correct columns
- Foreign key relationships are enforced
- `npx drizzle-kit check` reports no pending migrations
