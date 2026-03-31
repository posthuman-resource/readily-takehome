import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { db } from "../db";
import { regulatoryDocuments, requirements } from "../db/schema";
import { randomUUID } from "node:crypto";

const RequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      requirementNumber: z.string().describe("The requirement number or identifier (e.g. '1', '2.3', 'A-1')"),
      text: z.string().describe("The full requirement text"),
      reference: z.string().optional().describe("Section, page, or APL reference where the requirement appears"),
      category: z.string().optional().describe("Topic or category grouping (e.g. 'Staffing', 'Access', 'Quality')"),
    })
  ),
});

type ExtractedRequirement = z.infer<typeof RequirementsSchema>["requirements"][number];

const SYSTEM_PROMPT = `You are a regulatory compliance analyst. Your task is to extract individual, actionable regulatory requirements from a document.

First, identify the document type:
- **Checklist**: Contains numbered yes/no questions or items (e.g., "Does the P&P state...?"). Extract each numbered item as a requirement.
- **Narrative**: Contains dense prose with requirements embedded in sentences using imperative language ("must", "shall", "is required to", "are expected to"). Extract each imperative statement as a requirement.

Rules:
1. Each requirement should be a single, testable statement that an organization could be audited against.
2. For checklists: preserve the original numbering and question text. Convert questions to statements (e.g., "Does the P&P state X?" becomes "The P&P must state X.").
3. For narrative documents: identify sentences with "must", "shall", "required to", "is expected to", "are responsible for", etc. Each becomes a separate requirement.
4. Capture the section, page, or reference number where each requirement appears.
5. Group requirements into categories based on their topic (e.g., "Access & Availability", "Staffing", "Quality Improvement").
6. Do not skip requirements. Be thorough and extract ALL requirements present.
7. Do not invent requirements that aren't in the text.
8. If a requirement has sub-requirements (a, b, c...), extract each as its own entry with numbering like "3a", "3b", etc.`;

const PAGE_THRESHOLD = 30;
const CHARS_PER_TOKEN = 4;
const MAX_INPUT_TOKENS = 150000;

/**
 * Extract structured requirements from a regulatory document.
 * Idempotent: if requirements already exist for this document, returns immediately.
 */
export async function extractRequirements(
  documentId: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<void> {
  const doc = db
    .select()
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, documentId))
    .get();

  if (!doc) {
    throw new Error(`Regulatory document not found: ${documentId}`);
  }

  // Idempotency check
  const [existing] = db
    .select({ count: count() })
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, documentId))
    .all();

  if (existing.count > 0) {
    onProgress?.("complete", `Already extracted ${existing.count} requirements`);
    return;
  }

  if (!doc.rawText) {
    throw new Error(`Document ${documentId} has no extracted text. Run text extraction first.`);
  }

  // Update status
  db.update(regulatoryDocuments)
    .set({ status: "extracting_requirements", statusMessage: "Extracting requirements..." })
    .where(eq(regulatoryDocuments.id, documentId))
    .run();
  onProgress?.("extracting_requirements", "Starting requirement extraction...");

  const pageCount = doc.pageCount ?? 1;
  let allRequirements: ExtractedRequirement[];

  if (pageCount <= PAGE_THRESHOLD) {
    // Small document: process in one call
    onProgress?.("extracting_requirements", `Processing ${pageCount} pages in a single pass`);
    allRequirements = await extractFromText(doc.rawText);
  } else {
    // Large document: process in sections
    onProgress?.("extracting_requirements", `Large document (${pageCount} pages), processing in sections`);
    allRequirements = await extractFromSections(doc.rawText, onProgress);
  }

  // Store requirements
  onProgress?.("extracting_requirements", `Storing ${allRequirements.length} requirements`);

  for (const req of allRequirements) {
    db.insert(requirements)
      .values({
        id: randomUUID(),
        regulatoryDocumentId: documentId,
        requirementNumber: req.requirementNumber,
        text: req.text,
        reference: req.reference ?? null,
        category: req.category ?? null,
      })
      .run();
  }

  // Mark complete
  db.update(regulatoryDocuments)
    .set({
      status: "requirements_extracted",
      statusMessage: `Extracted ${allRequirements.length} requirements`,
    })
    .where(eq(regulatoryDocuments.id, documentId))
    .run();

  onProgress?.("complete", `Extracted ${allRequirements.length} requirements`);
}

/**
 * Extract requirements from a single text block.
 */
async function extractFromText(text: string): Promise<ExtractedRequirement[]> {
  // Truncate if the text is extremely large (shouldn't happen for <30 page docs)
  const maxChars = MAX_INPUT_TOKENS * CHARS_PER_TOKEN;
  const inputText = text.length > maxChars ? text.slice(0, maxChars) : text;

  const { output } = await generateText({
    model: anthropic("claude-opus-4-6"),
    output: Output.object({ schema: RequirementsSchema }),
    system: SYSTEM_PROMPT,
    prompt: `Extract all regulatory requirements from the following document:\n\n${inputText}`,
  });

  return output?.requirements ?? [];
}

/**
 * Split a large document into sections and extract requirements from each.
 * Deduplicates by requirement number.
 */
async function extractFromSections(
  fullText: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<ExtractedRequirement[]> {
  const sections = splitIntoSections(fullText);
  const allRequirements: ExtractedRequirement[] = [];
  const seenNumbers = new Set<string>();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    onProgress?.(
      "extracting_requirements",
      `Processing section ${i + 1} of ${sections.length}`
    );

    const sectionReqs = await extractFromText(section);

    // Deduplicate by requirement number
    for (const req of sectionReqs) {
      const key = req.requirementNumber.toLowerCase().trim();
      if (!seenNumbers.has(key)) {
        seenNumbers.add(key);
        allRequirements.push(req);
      }
    }
  }

  return allRequirements;
}

/**
 * Split text into sections of roughly MAX_INPUT_TOKENS tokens each,
 * preferring to break at section/heading boundaries.
 */
function splitIntoSections(text: string): string[] {
  const maxChars = MAX_INPUT_TOKENS * CHARS_PER_TOKEN;

  if (text.length <= maxChars) {
    return [text];
  }

  const sections: string[] = [];
  // Split on likely section headers (numbered sections, capitalized headings)
  const sectionPattern = /\n(?=(?:\d+\.[\s\d]|[A-Z][A-Z\s]{3,}\n|SECTION|CHAPTER|ARTICLE|Part\s+\d))/gi;
  const parts = text.split(sectionPattern);

  let current = "";
  for (const part of parts) {
    if (current.length + part.length > maxChars && current.length > 0) {
      sections.push(current);
      current = part;
    } else {
      current += (current ? "\n" : "") + part;
    }
  }

  if (current.trim()) {
    sections.push(current);
  }

  // If splitting by section headers wasn't enough (single huge section), split by character count
  const result: string[] = [];
  for (const section of sections) {
    if (section.length <= maxChars) {
      result.push(section);
    } else {
      // Force split at paragraph boundaries
      const paragraphs = section.split(/\n{2,}/);
      let chunk = "";
      for (const para of paragraphs) {
        if (chunk.length + para.length > maxChars && chunk.length > 0) {
          result.push(chunk);
          chunk = para;
        } else {
          chunk += (chunk ? "\n\n" : "") + para;
        }
      }
      if (chunk.trim()) {
        result.push(chunk);
      }
    }
  }

  return result;
}
