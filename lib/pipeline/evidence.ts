import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { db } from "../db";
import { requirements, regulatoryDocuments, evidence } from "../db/schema";
import { semanticSearch, type SearchResult } from "../search";
import { randomUUID } from "node:crypto";

const SIMILARITY_THRESHOLD = 0.3;
const TOP_K = 15;

const EvidenceEvaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      chunkId: z.string(),
      status: z.enum(["met", "not_met", "partial", "unclear"]),
      excerpt: z.string().describe("The specific text from the policy that provides evidence"),
      reasoning: z.string().describe("Why this status was assigned"),
      confidence: z.number().describe("Confidence score between 0 and 1"),
    })
  ),
});

const SYSTEM_PROMPT = `You are a healthcare compliance expert evaluating whether organizational policies satisfy regulatory requirements.

For each policy excerpt, determine:
- met: The policy clearly and fully addresses the requirement
- partial: The policy addresses some but not all aspects of the requirement
- not_met: The policy does not address the requirement
- unclear: Cannot determine from the provided excerpt

Be specific about what is and isn't covered. Quote the relevant text in the excerpt field.
Return the chunkId exactly as provided for each evaluation.`;

/**
 * For a given regulatory document, find evidence in policy chunks for each requirement.
 * Resumable: skips requirements that already have evidence records.
 */
export async function matchEvidence(
  documentId: string,
  onProgress?: (status: string, detail?: string) => void
): Promise<void> {
  // Verify document exists
  const doc = db
    .select()
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, documentId))
    .get();

  if (!doc) {
    throw new Error(`Regulatory document not found: ${documentId}`);
  }

  // Get all requirements for this document
  const allRequirements = db
    .select()
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, documentId))
    .all();

  if (allRequirements.length === 0) {
    throw new Error(`No requirements found for document ${documentId}. Run requirement extraction first.`);
  }

  // Find which requirements already have evidence (for resumability)
  const requirementsWithEvidence = new Set<string>();
  for (const req of allRequirements) {
    const [existing] = db
      .select({ count: count() })
      .from(evidence)
      .where(eq(evidence.requirementId, req.id))
      .all();
    if (existing.count > 0) {
      requirementsWithEvidence.add(req.id);
    }
  }

  const unmatched = allRequirements.filter((r) => !requirementsWithEvidence.has(r.id));
  const total = allRequirements.length;
  const alreadyDone = total - unmatched.length;

  if (unmatched.length === 0) {
    onProgress?.("complete", `All ${total} requirements already have evidence`);
    return;
  }

  onProgress?.("matching_evidence", `Matching ${unmatched.length} of ${total} requirements (${alreadyDone} already done)`);

  db.update(regulatoryDocuments)
    .set({ status: "matching_evidence", statusMessage: "Matching evidence..." })
    .where(eq(regulatoryDocuments.id, documentId))
    .run();

  for (let i = 0; i < unmatched.length; i++) {
    const req = unmatched[i];
    const progress = alreadyDone + i + 1;
    onProgress?.("matching_evidence", `Matched ${progress - 1} of ${total} requirements`);

    // Step 1: Semantic search for relevant chunks
    const searchResults = await semanticSearch(req.text, TOP_K);

    // Filter out low-similarity chunks
    const candidates = searchResults.filter((r) => r.similarity >= SIMILARITY_THRESHOLD);

    if (candidates.length === 0) {
      // No relevant chunks found - mark as not_met
      db.update(requirements)
        .set({ complianceStatus: "not_met" })
        .where(eq(requirements.id, req.id))
        .run();
      continue;
    }

    // Step 2: Send to Opus for evaluation
    const evaluations = await evaluateEvidence(req.text, candidates);

    // Step 3: Store evidence records for non-not_met evaluations
    let bestStatus: "met" | "partial" | "unclear" | "not_met" = "not_met";

    for (const evaluation of evaluations) {
      if (evaluation.status !== "not_met") {
        db.insert(evidence)
          .values({
            id: randomUUID(),
            requirementId: req.id,
            policyChunkId: evaluation.chunkId,
            status: evaluation.status,
            excerpt: evaluation.excerpt,
            reasoning: evaluation.reasoning,
            confidence: evaluation.confidence,
          })
          .run();
      }

      // Track best status
      if (evaluation.status === "met") {
        bestStatus = "met";
      } else if (evaluation.status === "partial" && bestStatus !== "met") {
        bestStatus = "partial";
      } else if (evaluation.status === "unclear" && bestStatus === "not_met") {
        bestStatus = "unclear";
      }
    }

    // Step 4: Update requirement compliance status
    db.update(requirements)
      .set({ complianceStatus: bestStatus })
      .where(eq(requirements.id, req.id))
      .run();
  }

  onProgress?.("matching_evidence", `Matched ${total} of ${total} requirements`);

  // Mark document complete
  db.update(regulatoryDocuments)
    .set({
      status: "complete",
      statusMessage: `Evidence matching complete for ${total} requirements`,
    })
    .where(eq(regulatoryDocuments.id, documentId))
    .run();

  onProgress?.("complete", `Evidence matching complete for ${total} requirements`);
}

/**
 * Call Claude Opus to evaluate candidate policy chunks against a requirement.
 */
async function evaluateEvidence(
  requirementText: string,
  chunks: SearchResult[]
): Promise<
  Array<{
    chunkId: string;
    status: "met" | "not_met" | "partial" | "unclear";
    excerpt: string;
    reasoning: string;
    confidence: number;
  }>
> {
  const chunksPrompt = chunks
    .map(
      (c) =>
        `[Chunk ${c.chunkId} from ${c.policyFilename} p.${c.pageNumber}]:\n${c.chunkText}`
    )
    .join("\n\n");

  const { output } = await generateText({
    model: anthropic("claude-opus-4-6"),
    output: Output.object({ schema: EvidenceEvaluationSchema }),
    system: SYSTEM_PROMPT,
    prompt: `Requirement: ${requirementText}\n\nPolicy excerpts to evaluate:\n${chunksPrompt}`,
  });

  if (!output?.evaluations) {
    return [];
  }

  // Filter to only chunks we actually sent (guard against hallucinated chunkIds)
  const validChunkIds = new Set(chunks.map((c) => c.chunkId));
  return output.evaluations.filter((e) => validChunkIds.has(e.chunkId));
}
