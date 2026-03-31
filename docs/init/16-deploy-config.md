# Task 16: Deploy Configuration

## Objective

Configure the project for deployment on Render.com with a persistent disk for the SQLite database and uploaded files.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Render.com Configuration

Create `render.yaml`:

```yaml
services:
  - type: web
    name: readily-compliance
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: DATA_DIR
        value: /var/data
      - key: NODE_ENV
        value: production
    disk:
      name: data
      mountPath: /var/data
      sizeGB: 1
```

### Persistent Disk Layout

On Render, the persistent disk at `/var/data` will contain:
```
/var/data/
  db/
    app.sqlite         # The database (survives restarts and deploys)
  uploads/
    regulatory/        # Uploaded regulatory docs
    policies/          # Policy corpus
  processing/          # Temp files (cleaned up after use)
```

### First-Run Setup

The database and policy corpus need to be seeded before the app serves users. Options:

**Option A (recommended)**: Run seed as part of the build or a one-time job:
- Add a `postbuild` script that runs `npx tsx scripts/seed.ts --policies-only`
- Run regulatory doc processing manually after deploy via CLI or web upload

**Option B**: Run seed on first request:
- Check if the database is empty on app startup
- If empty, kick off seeding in the background
- Show a "Setting up..." page to users

**Option C**: Pre-seed locally and upload:
- Seed the database locally
- Copy the SQLite file to the persistent disk
- This is fastest but least reproducible

For the takehome, Option A is best. Add to `package.json`:
```json
{
  "scripts": {
    "seed": "tsx scripts/seed.ts",
    "seed:policies": "tsx scripts/seed.ts --policies-only",
    "seed:easy": "tsx scripts/ingest.ts 'data/Example Input Doc - Easy.pdf' --type regulatory"
  }
}
```

### Build Configuration

Ensure the production build works:
- `npm run build` must succeed
- The build should NOT try to connect to the database (SQLite driver issues in build-time)
- Use dynamic imports or lazy initialization for the database connection
- Server Components that read from the DB should work at runtime, not build time

### Environment Variables

Document all required env vars:
- `ANTHROPIC_API_KEY` (required for ingestion pipeline)
- `OPENAI_API_KEY` (required for embeddings + chat)
- `DATA_DIR` (default: `/var/data`)

### Startup Checks

Add a startup check in the Next.js app that:
1. Verifies DATA_DIR exists and is writable
2. Ensures the directory structure is created
3. Runs pending database migrations
4. Optionally checks if the database has seeded data

This can be in `lib/db/index.ts` or a middleware.

### Health Check

The `/api/health` endpoint (from task 10) should be configured as the health check URL in Render:
```yaml
healthCheckPath: /api/health
```

### Node.js Version

Ensure Render uses a compatible Node.js version. Create `.node-version`:
```
20
```

Or add to `package.json`:
```json
{
  "engines": {
    "node": ">=20.9.0"
  }
}
```

### Static Assets

The `data/` directory with PDFs should NOT be included in the production build. It's only needed for seeding. Add to `.gitignore` or ensure the build doesn't try to include it.

Actually, since the data directory is needed for seeding on Render, it should be in the repo. But it should not be processed by Next.js/Turbopack. It won't be by default since it's not in the `app/` or `public/` directories.

### GitHub Repository

Ensure the repo is ready for submission:
- `.env` is in `.gitignore` (don't commit API keys)
- `.env.example` documents all required variables
- README.md has setup instructions
- The repo is clean (no unnecessary files)

## Acceptance Criteria

- `render.yaml` exists with correct configuration
- `npm run build` succeeds in a clean environment
- `npm start` starts the production server
- `.node-version` or `engines` field specifies Node.js 20+
- `.env.example` documents all required environment variables
- `/api/health` returns `{"status":"ok",...}`
- The app works with `DATA_DIR` pointing to a local directory (for development)
- The app works with `DATA_DIR` pointing to `/var/data` (for production)
- The seeded database persists across app restarts
- Deploy to Render succeeds and the app is accessible at a live URL
