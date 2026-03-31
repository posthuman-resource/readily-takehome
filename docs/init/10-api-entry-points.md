# Task 10: API Entry Points (Ingest + SSE Progress)

## Objective

Create Next.js API routes for file upload/ingestion and real-time progress streaming via Server-Sent Events.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

Key Next.js 16 specifics:
- Route Handlers use Web Request/Response APIs
- `params` must be awaited: `const { id } = await params`
- Use `RouteContext<'/path/[param]'>` for typed context
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

### Route 1: `POST /api/ingest`

`app/api/ingest/route.ts`

Accepts a multipart form upload with:
- `file`: PDF file
- `type`: 'regulatory' | 'policy'
- `category`: (optional) policy category

Response: JSON with the document ID

```typescript
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const type = formData.get('type') as string || 'regulatory';
  const category = formData.get('category') as string;

  // Save file to DATA_DIR
  const filePath = path.join(
    type === 'regulatory' ? REGULATORY_DIR : path.join(POLICIES_DIR, category || 'uploads'),
    file.name
  );
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Register document
  const documentId = await registerDocument(filePath, type, category);

  // Start processing in background (don't await - let SSE handle progress)
  processDocument(documentId, type).catch(err => {
    console.error('Processing error:', err);
  });

  return Response.json({ documentId, status: 'pending' });
}
```

### Route 2: `GET /api/ingest/[documentId]/progress`

`app/api/ingest/[documentId]/progress/route.ts`

Returns a Server-Sent Events stream with processing progress.

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Poll the database for status changes
      let lastStatus = '';
      const interval = setInterval(async () => {
        try {
          const doc = await getDocumentStatus(documentId);
          if (!doc) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Document not found' })}\n\n`));
            clearInterval(interval);
            controller.close();
            return;
          }

          const statusStr = JSON.stringify({
            status: doc.status,
            statusMessage: doc.statusMessage,
          });

          if (statusStr !== lastStatus) {
            lastStatus = statusStr;
            controller.enqueue(encoder.encode(`data: ${statusStr}\n\n`));
          }

          if (doc.status === 'complete' || doc.status === 'error') {
            clearInterval(interval);
            controller.close();
          }
        } catch (err) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      // Clean up on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Route 3: `GET /api/ingest/[documentId]/status`

`app/api/ingest/[documentId]/status/route.ts`

Simple JSON endpoint for polling (fallback if SSE doesn't work):

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const doc = await getDocumentStatus(documentId);
  if (!doc) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return Response.json(doc);
}
```

### Route 4: `GET /api/health`

`app/api/health/route.ts`

Health check endpoint:

```typescript
export async function GET() {
  const policiesCount = await countPolicies();
  const regulatoryCount = await countRegulatoryDocs();
  return Response.json({
    status: 'ok',
    policiesIndexed: policiesCount > 0,
    policiesCount,
    regulatoryCount,
  });
}
```

### Render.com Timeout Considerations

Render.com web services have a default request timeout (typically 30 seconds for free tier, longer for paid). The SSE connection needs to stay alive for 5-10 minutes during ingestion. Options:
- The progress endpoint polls the DB, so if the SSE connection drops, the client can reconnect and read current status
- The processing happens in the POST handler's fire-and-forget promise, independent of any SSE connection
- Consider adding keep-alive pings to the SSE stream: send a heartbeat comment (`:\n\n`) every 15 seconds

## Acceptance Criteria

- `curl -X POST http://localhost:3000/api/ingest -F "file=@data/Public Policies/PA/PA.5052_20250221.pdf" -F "type=policy" -F "category=PA"` returns `{ "documentId": "...", "status": "pending" }`

- `curl http://localhost:3000/api/ingest/<documentId>/status` returns current processing status

- SSE endpoint streams updates:
  ```
  curl -N http://localhost:3000/api/ingest/<documentId>/progress
  data: {"status":"extracting_text"}
  data: {"status":"chunking"}
  data: {"status":"embedding","statusMessage":"50 of 100 chunks"}
  data: {"status":"complete"}
  ```

- `curl http://localhost:3000/api/health` returns `{"status":"ok","policiesIndexed":true,...}`

- File upload saves the PDF to the correct DATA_DIR location


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
