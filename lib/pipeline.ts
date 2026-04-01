import "./env";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { eq, count } from "drizzle-orm";
import { db } from "./db";
import {
  regulatoryDocuments,
  policyDocuments,
  requirements,
} from "./db/schema";
import { REGULATORY_DIR, POLICIES_DIR } from "./config";
import { extractPdfText } from "./pdf";
import { processPolicy } from "./pipeline/policy";
import { extractRequirements } from "./pipeline/requirements";
import { matchEvidence } from "./pipeline/evidence";

export type DocumentType = "regulatory" | "policy";

export interface ProgressEvent {
  status: string;
  detail?: string;
  timestamp: number;
}

/**
 * Orchestrate the full ingestion pipeline for a document.
 * Resumable: reads current status from DB and picks up where it left off.
 */
export async function processDocument(
  documentId: string,
  documentType: DocumentType,
  onProgress?: (event: ProgressEvent) => void
): Promise<void> {
  const emit = (status: string, detail?: string) => {
    onProgress?.({ status, detail, timestamp: Date.now() });
  };

  try {
    if (documentType === "policy") {
      await processPolicy(documentId, (status, detail) =>
        emit(status, detail)
      );
    } else {
      await processRegulatory(documentId, emit);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(
      `Pipeline error for ${documentType} ${documentId}:`,
      message
    );

    // Set status to error in the appropriate table
    const table =
      documentType === "policy" ? policyDocuments : regulatoryDocuments;
    db.update(table)
      .set({ status: "error", statusMessage: message })
      .where(eq(table.id, documentId))
      .run();

    emit("error", message);
  }
}

/**
 * Run the regulatory document pipeline: extract text -> extract requirements -> match evidence.
 */
async function processRegulatory(
  documentId: string,
  emit: (status: string, detail?: string) => void
): Promise<void> {
  const doc = db
    .select()
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, documentId))
    .get();

  if (!doc) {
    throw new Error(`Regulatory document not found: ${documentId}`);
  }

  if (doc.status === "complete") {
    emit("complete", "Already processed");
    return;
  }

  // Step 1: Extract text if not already done
  if (!doc.rawText) {
    emit("extracting_text", `Extracting text from ${doc.filename}`);
    db.update(regulatoryDocuments)
      .set({
        status: "extracting_text",
        statusMessage: "Extracting text...",
      })
      .where(eq(regulatoryDocuments.id, documentId))
      .run();

    const extracted = await extractPdfText(doc.filename);

    db.update(regulatoryDocuments)
      .set({
        rawText: extracted.text,
        pageCount: extracted.pageCount,
        statusMessage: `Extracted ${extracted.pageCount} pages`,
      })
      .where(eq(regulatoryDocuments.id, documentId))
      .run();
  }

  // Step 2: Extract requirements if none exist
  const [existing] = db
    .select({ count: count() })
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, documentId))
    .all();

  if (existing.count === 0) {
    emit("extracting_requirements", "Starting requirement extraction...");
    await extractRequirements(documentId, (status, detail) =>
      emit(status, detail)
    );
  }

  // Step 3: Match evidence
  emit("matching_evidence", "Starting evidence matching...");
  await matchEvidence(documentId, (status, detail) =>
    emit(status, detail)
  );

  emit("complete", "Processing complete");
}

/**
 * Register a new document: create DB record, copy file to uploads dir.
 * Returns the document ID.
 */
export async function registerDocument(
  filePath: string,
  documentType: DocumentType,
  category?: string
): Promise<string> {
  const id = randomUUID();
  const absoluteSrc = path.resolve(filePath);
  const filename = path.basename(absoluteSrc);

  // Determine destination directory
  let destDir: string;
  if (documentType === "regulatory") {
    destDir = REGULATORY_DIR;
  } else {
    if (!category) {
      throw new Error("Category is required for policy documents");
    }
    destDir = path.join(POLICIES_DIR, category);
  }

  mkdirSync(destDir, { recursive: true });

  const destPath = path.join(destDir, filename);

  // Copy file if not already in the correct location
  if (path.resolve(destPath) !== absoluteSrc) {
    if (!existsSync(absoluteSrc)) {
      throw new Error(`Source file not found: ${absoluteSrc}`);
    }
    copyFileSync(absoluteSrc, destPath);
  }

  // Create DB record
  if (documentType === "policy") {
    db.insert(policyDocuments)
      .values({
        id,
        filename: destPath,
        category: category!,
        status: "pending",
      })
      .run();
  } else {
    db.insert(regulatoryDocuments)
      .values({
        id,
        filename: destPath,
        status: "pending",
      })
      .run();
  }

  return id;
}
