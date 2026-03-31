# Task 16: Deploy Configuration

## Objective

Ensure the app builds and runs correctly in production on Render.com. The Render web service is already configured - deployment happens automatically on git push.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Environment

- Render web service is already set up
- Persistent disk: 10GB mounted at `/var/data`
- Deploy trigger: `git push` to the repo
- Env vars set in Render dashboard:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `DATA_DIR=/var/data` (this is also the default, so optional)

### What Needs to Work

1. **`npm run build` must succeed** without connecting to SQLite at build time. The database lives on the persistent disk which only exists at runtime.
   - Use lazy/dynamic initialization for the database connection
   - Server Components that read from the DB should work at request time, not build time
   - If better-sqlite3 or sqlite-vector cause build issues with Turbopack, add them to `serverExternalPackages` in `next.config.ts`

2. **`npm start` must work** with `DATA_DIR=/var/data`
   - On first start, `lib/ensure-dirs.ts` creates the directory structure under `/var/data/`
   - Database migrations run automatically on first connection
   - The app should show an empty state gracefully if no data is seeded yet

3. **Seeding on Render**: After deploy, seeding runs via Render shell or a one-off job:
   ```bash
   npx tsx scripts/seed.ts
   ```
   The seeded SQLite DB at `/var/data/db/app.sqlite` persists across deploys.

### Production Checklist

- `.env` is in `.gitignore`
- `.env.example` documents the three required env vars
- `engines` field in `package.json`: `"node": ">=20.9.0"`
- `/api/health` returns status including whether policies are indexed
- The app handles `DATA_DIR` pointing to any writable directory

### Native Module Considerations

`better-sqlite3` and `@sqliteai/sqlite-vector` are native modules. If Turbopack has issues:

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@sqliteai/sqlite-vector'],
}

export default nextConfig
```

## Acceptance Criteria

- `npm run build` succeeds without a database present
- `npm start` starts the server and `/api/health` responds
- The app shows an empty/welcome state when no data is seeded
- `git push` triggers a successful deploy on Render
- After seeding on Render, the compliance browser shows data at the live URL


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
