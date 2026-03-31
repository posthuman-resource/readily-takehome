# Task 14: Chat Frontend

## Objective

Build the chat panel UI using Vercel AI SDK's `useChat` hook, with file upload support and streaming responses.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Component Structure

```
components/
  chat/
    chat-panel.tsx       # Main chat panel (client component)
    chat-messages.tsx    # Message list with tool call rendering
    chat-input.tsx       # Input with file upload
```

### Chat Panel

`components/chat/chat-panel.tsx` - Client Component (`'use client'`)

The chat panel should be a side panel or overlay accessible from any page. Use shadcn/ui Sheet or a custom slide-out panel.

```bash
npx shadcn@latest add sheet textarea
```

```typescript
'use client';
import { useChat } from 'ai/react';

// Research useChat API via context7 MCP (look up ai/react docs)
// Key features: messages, input, handleInputChange, handleSubmit, isLoading
```

### useChat Integration

Use the Vercel AI SDK's `useChat` hook. Research the latest API via context7:

```typescript
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  // Handle tool invocations in the UI
  // The AI SDK handles tool calls automatically via the backend
});
```

### Message Rendering

Messages should render differently based on role and content:

**User messages**: Simple text bubble, right-aligned

**Assistant messages**: Left-aligned, with:
- Markdown rendering for text content
- Tool call results rendered as structured cards:
  - `queryRequirements` results: table of requirements with status badges
  - `semanticSearch` results: list of policy excerpts with sources
  - `getComplianceSummary` results: summary card with stats
  - `getIngestionStatus` results: progress indicator

### Tool Call Display

When the assistant makes tool calls, show them in the UI:
- While executing: show a loading indicator with the tool name
- After completion: show the results in a structured format
- The text response following tool calls should reference the results

Research how `useChat` exposes tool invocations in the messages array. The AI SDK likely includes tool call information in the message objects.

### File Upload

Add file upload capability for new regulatory documents:

```typescript
// Option 1: Upload button in the chat input
// Option 2: Drag-and-drop on the chat panel

async function handleFileUpload(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', 'regulatory');

  const response = await fetch('/api/ingest', {
    method: 'POST',
    body: formData,
  });

  const { documentId } = await response.json();
  // Add a system message about the upload
  // Start polling for progress
}
```

### Chat Toggle Button

Add a floating button or nav item to open/close the chat panel from any page. The chat should overlay the compliance browser, not replace it.

### Streaming Display

- Show text as it streams in (character by character or chunk by chunk)
- The AI SDK's `useChat` handles this automatically
- Consider using a markdown renderer for formatted responses

### Persistence (Optional)

Chat history can be stored in the `chat_messages` table. For MVP, in-memory chat (lost on page refresh) is acceptable. If time allows, persist messages and reload on mount.

## Acceptance Criteria

- A chat button/icon is visible on all pages
- Clicking it opens a chat panel (side panel or overlay)
- Users can type messages and get streaming responses
- The model can call tools and results are displayed in the UI
- Asking "What are our compliance gaps?" triggers tool calls and returns meaningful analysis
- Asking "Find policies about hospice" triggers semantic search and shows results
- File upload works: dropping a PDF starts ingestion and shows progress
- The chat panel can be closed without losing conversation context
- `npm run build` succeeds


## Knowledge Sharing

If you discover something during this task that future tasks should know about (undocumented API behavior, gotchas, architectural decisions, things that almost broke), add it to `CLAUDE.md` under a relevant section. Every subsequent task executor reads that file.
