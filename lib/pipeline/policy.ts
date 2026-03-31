import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db";
import { policyDocuments, policyChunks } from "../db/schema";
import { extractPdfText, type PageText } from "../pdf";
import { embedTexts, serializeEmbedding } from "../embeddings";
import { randomUUID } from "node:crypto";

// --- Chunking ---

export interface Chunk {
  text: string;
  pageNumber: number;
  chunkIndex: number;
}

const CHARS_PER_TOKEN = 4;

/**
 * Split text into sentences. Handles abbreviations and decimal numbers
 * to avoid false splits.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace and uppercase letter,
  // or followed by newline
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z\d("])|(?<=[.!?])\n+/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Split text into segments: first by double newlines (paragraphs),
 * then if any segment is too large, split it further by sentences.
 */
function splitIntoSegments(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const segments: string[] = [];

  for (const block of paragraphs) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxChars) {
      segments.push(trimmed);
    } else {
      // Paragraph too large - split into sentences
      const sentences = splitSentences(trimmed);
      for (const s of sentences) {
        segments.push(s);
      }
    }
  }

  return segments;
}

export function chunkText(
  pages: PageText[],
  targetTokens: number = 500,
  overlapTokens: number = 100
): Chunk[] {
  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const maxChars = (targetTokens + 100) * CHARS_PER_TOKEN; // hard cap ~600 tokens

  const chunks: Chunk[] = [];
  let currentText = "";
  let currentPage = pages.length > 0 ? pages[0].pageNumber : 1;
  let chunkIndex = 0;

  function flush() {
    const content = currentText.trim();
    if (content) {
      chunks.push({ text: content, pageNumber: currentPage, chunkIndex });
      chunkIndex++;
    }
  }

  for (const page of pages) {
    const segments = splitIntoSegments(page.text, maxChars);

    for (const seg of segments) {
      const combined = currentText
        ? currentText + "\n\n" + seg
        : seg;

      if (combined.length <= maxChars) {
        // Still fits - accumulate
        if (!currentText) {
          currentPage = page.pageNumber;
        }
        currentText = combined;
      } else if (!currentText) {
        // Single segment exceeds max (very long sentence) - emit it as-is
        currentPage = page.pageNumber;
        currentText = seg;
        flush();
        currentText = "";
      } else {
        // Would exceed max - finalize current chunk, start new with overlap
        flush();
        const overlapText = currentText.slice(
          Math.max(0, currentText.length - overlapChars)
        );
        currentText = overlapText + "\n\n" + seg;
        currentPage = page.pageNumber;

        // If overlap + new segment still exceeds max, flush again
        if (currentText.length > maxChars) {
          flush();
          currentText = "";
        }
      }
    }
  }

  // Flush remaining text
  flush();

  return chunks;
}

// --- Pipeline ---

const EMBED_BATCH_SIZE = 100;

type StatusName = "extracting_text" | "chunking" | "embedding" | "complete";

const STATUS_ORDER: StatusName[] = ["extracting_text", "chunking", "embedding", "complete"];

function shouldRun(current: string, phase: StatusName): boolean {
  const currentIdx = STATUS_ORDER.indexOf(current as StatusName);
  const phaseIdx = STATUS_ORDER.indexOf(phase);
  // Run this phase if current status is before or at the phase
  return currentIdx === -1 || currentIdx <= phaseIdx;
}

export async function processPolicy(
  documentId: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<void> {
  // Read the document record
  const doc = db
    .select()
    .from(policyDocuments)
    .where(eq(policyDocuments.id, documentId))
    .get();

  if (!doc) {
    throw new Error(`Policy document not found: ${documentId}`);
  }

  if (doc.status === "complete") {
    onProgress?.("complete", "Already processed");
    return;
  }

  // Phase 1: Extract text
  if (shouldRun(doc.status, "extracting_text")) {
    onProgress?.("extracting_text", `Extracting text from ${doc.filename}`);
    db.update(policyDocuments)
      .set({ status: "extracting_text", statusMessage: "Extracting text..." })
      .where(eq(policyDocuments.id, documentId))
      .run();

    const extracted = await extractPdfText(doc.filename);

    db.update(policyDocuments)
      .set({
        rawText: extracted.text,
        pageCount: extracted.pageCount,
        statusMessage: `Extracted ${extracted.pageCount} pages`,
      })
      .where(eq(policyDocuments.id, documentId))
      .run();

    // Store pages as JSON for chunking phase (use rawText + pageCount)
    // We re-extract pages from rawText if needed, but since we have them now, proceed directly
    doc.rawText = extracted.text;
    doc.pageCount = extracted.pageCount;

    // Chunk immediately with the pages we have
    onProgress?.("chunking", "Chunking text...");
    db.update(policyDocuments)
      .set({ status: "chunking", statusMessage: "Chunking text..." })
      .where(eq(policyDocuments.id, documentId))
      .run();

    const chunks = chunkText(extracted.pages);

    // Delete any existing chunks for this document (in case of restart)
    db.delete(policyChunks)
      .where(eq(policyChunks.policyDocumentId, documentId))
      .run();

    // Insert chunks without embeddings
    for (const chunk of chunks) {
      db.insert(policyChunks)
        .values({
          id: randomUUID(),
          policyDocumentId: documentId,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
        })
        .run();
    }

    onProgress?.("chunking", `Created ${chunks.length} chunks`);
    doc.status = "chunking";
  } else if (shouldRun(doc.status, "chunking")) {
    // Status is already at chunking but text was extracted previously
    // Check if chunks exist already
    const existingChunks = db
      .select()
      .from(policyChunks)
      .where(eq(policyChunks.policyDocumentId, documentId))
      .all();

    if (existingChunks.length === 0 && doc.rawText) {
      onProgress?.("chunking", "Chunking text...");
      db.update(policyDocuments)
        .set({ status: "chunking", statusMessage: "Chunking text..." })
        .where(eq(policyDocuments.id, documentId))
        .run();

      // Re-extract to get pages (we need page boundaries for chunking)
      const extracted = await extractPdfText(doc.filename);
      const chunks = chunkText(extracted.pages);

      for (const chunk of chunks) {
        db.insert(policyChunks)
          .values({
            id: randomUUID(),
            policyDocumentId: documentId,
            pageNumber: chunk.pageNumber,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
          })
          .run();
      }

      onProgress?.("chunking", `Created ${chunks.length} chunks`);
    }
  }

  // Phase 3: Embed chunks
  if (shouldRun(doc.status, "embedding")) {
    onProgress?.("embedding", "Starting embedding...");
    db.update(policyDocuments)
      .set({ status: "embedding", statusMessage: "Generating embeddings..." })
      .where(eq(policyDocuments.id, documentId))
      .run();

    // Find chunks without embeddings (for resumability)
    const unembeddedChunks = db
      .select()
      .from(policyChunks)
      .where(
        and(
          eq(policyChunks.policyDocumentId, documentId),
          isNull(policyChunks.embedding)
        )
      )
      .all();

    const totalChunks = db
      .select()
      .from(policyChunks)
      .where(eq(policyChunks.policyDocumentId, documentId))
      .all().length;

    const alreadyEmbedded = totalChunks - unembeddedChunks.length;

    for (let i = 0; i < unembeddedChunks.length; i += EMBED_BATCH_SIZE) {
      const batch = unembeddedChunks.slice(i, i + EMBED_BATCH_SIZE);
      const embeddings = await embedTexts(batch.map((c) => c.text));

      for (let j = 0; j < batch.length; j++) {
        db.update(policyChunks)
          .set({ embedding: serializeEmbedding(embeddings[j]) })
          .where(eq(policyChunks.id, batch[j].id))
          .run();
      }

      const done = alreadyEmbedded + Math.min(i + EMBED_BATCH_SIZE, unembeddedChunks.length);
      onProgress?.("embedding", `${done} of ${totalChunks} chunks`);
    }
  }

  // Mark complete
  db.update(policyDocuments)
    .set({ status: "complete", statusMessage: "Processing complete" })
    .where(eq(policyDocuments.id, documentId))
    .run();
  onProgress?.("complete", "Processing complete");
}
