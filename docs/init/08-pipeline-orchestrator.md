# Task 08: Core Pipeline Orchestrator

## Objective

Create the unified `processDocument()` function that orchestrates the full ingestion pipeline for both regulatory and policy documents. This is THE central piece that both CLI and API entry points call.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Module: `lib/pipeline.ts`

```typescript
export type DocumentType = 'regulatory' | 'policy';

export interface ProgressEvent {
  status: string;
  detail?: string;
  timestamp: number;
}

export async function processDocument(
  documentId: string,
  documentType: DocumentType,
  onProgress?: (event: ProgressEvent) => void
): Promise<void>
```

### Implementation

This function reads the document's current status from the DB and resumes from wherever it left off:

```typescript
export async function processDocument(documentId, documentType, onProgress) {
  const emit = (status: string, detail?: string) => {
    onProgress?.({ status, detail, timestamp: Date.now() });
  };

  if (documentType === 'policy') {
    // Delegate to policy pipeline
    await processPolicy(documentId, (status, detail) => emit(status, detail));
  } else {
    // Regulatory document pipeline:
    // 1. Extract text (if not already done)
    // 2. Extract requirements via Opus
    // 3. Match evidence against policy chunks

    const doc = await getDocument(documentId);

    if (!doc.rawText) {
      emit('extracting_text');
      await extractAndStoreText(documentId);
    }

    const requirements = await getRequirements(documentId);
    if (requirements.length === 0) {
      emit('extracting_requirements');
      await extractRequirements(documentId, (s, d) => emit(s, d));
    }

    emit('matching_evidence');
    await matchEvidence(documentId, (s, d) => emit(s, d));

    emit('complete');
  }
}
```

### State Machine

The document status field tracks progress:

**Policy documents:**
```
pending -> extracting_text -> chunking -> embedding -> complete
                                                  \-> error
```

**Regulatory documents:**
```
pending -> extracting_text -> extracting_requirements -> matching_evidence -> complete
                                                                        \-> error
```

### Error Handling

- If any step throws, catch the error
- Set document status to 'error' with the error message in statusMessage
- The pipeline is designed to be resumable: calling processDocument() again on an errored document should retry from the failed step
- Log errors but don't crash the process

### Helper: Register a new document

Create a helper function for creating the initial DB record:

```typescript
export async function registerDocument(
  filePath: string,
  documentType: DocumentType,
  category?: string  // For policy docs: AA, CMC, etc.
): Promise<string>  // Returns document ID
```

This function:
1. Generates a UUID
2. Creates a record in the appropriate table (regulatory_documents or policy_documents)
3. Sets status to 'pending'
4. Returns the document ID

### File Management

The `registerDocument` function should also handle copying the PDF to `$DATA_DIR/uploads/`:
- Regulatory docs go to `$DATA_DIR/uploads/regulatory/`
- Policy docs go to `$DATA_DIR/uploads/policies/{category}/`
- If the file is already in the correct location, don't copy it again

## Acceptance Criteria

- `lib/pipeline.ts` exports `processDocument` and `registerDocument`
- Test full pipeline with a single policy doc:
  ```
  npx tsx -e "
    import { registerDocument, processDocument } from './lib/pipeline';
    const id = await registerDocument('path/to/policy.pdf', 'policy', 'PA');
    await processDocument(id, 'policy', (e) => console.log(e.status, e.detail));
  "
  ```
  - Document progresses through all states to 'complete'
  - Chunks and embeddings are created

- Test resumability:
  - Start processing, kill the process mid-embedding
  - Restart processing - it picks up where it left off

- Error handling:
  - If Opus call fails, document status is set to 'error'
  - Calling processDocument again retries from the failed step
