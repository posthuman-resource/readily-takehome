/**
 * Live pipeline integration test.
 *
 * Runs the full ingestion pipeline end-to-end with real API calls:
 * 1. Clean database
 * 2. Ingest PA policy documents
 * 3. Ingest Easy regulatory document + extract requirements
 * 4. Run evidence matching
 * 5. Verify data quality
 *
 * Usage:
 *   DATA_DIR=./data npx tsx scripts/test-live-pipeline.ts
 */
import "../lib/env";
import { db, sqlite } from "../lib/db";
import {
  regulatoryDocuments,
  requirements,
  policyDocuments,
  policyChunks,
  evidence,
  chatMessages,
} from "../lib/db/schema";
import { extractPdfText } from "../lib/pdf";
import { extractRequirements } from "../lib/pipeline/requirements";
import { processPolicy } from "../lib/pipeline/policy";
import { matchEvidence } from "../lib/pipeline/evidence";
import { semanticSearch } from "../lib/search";
import { count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

const EASY_PDF = resolve("data/Example Input Doc - Easy.pdf");
const POLICIES_DIR = resolve("data/Public Policies/PA");
const POLICY_COUNT = 12;

async function main() {
  const totalStart = Date.now();

  // ── Step 1: Clean slate ────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   Live Pipeline Integration Test     ║");
  console.log("╚══════════════════════════════════════╝\n");

  console.log("Step 1: Cleaning database...");
  db.delete(evidence).run();
  db.delete(requirements).run();
  db.delete(policyChunks).run();
  db.delete(policyDocuments).run();
  db.delete(regulatoryDocuments).run();
  db.delete(chatMessages).run();
  console.log("  All tables cleared.\n");

  // ── Step 2: Ingest PA policy documents ─────────────────────────────
  console.log(`Step 2: Ingesting ${POLICY_COUNT} PA policy documents...`);
  const policyStart = Date.now();

  const pdfFiles = readdirSync(POLICIES_DIR)
    .filter((f) => f.endsWith(".pdf"))
    .sort() // deterministic order
    .slice(0, POLICY_COUNT);

  console.log(`  Selected ${pdfFiles.length} PDFs from PA category`);

  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    const filePath = resolve(POLICIES_DIR, file);
    const docId = randomUUID();

    db.insert(policyDocuments)
      .values({
        id: docId,
        filename: filePath,
        category: "PA",
        title: file.replace(".pdf", ""),
        status: "pending",
      })
      .run();

    try {
      await processPolicy(docId, (status, detail) => {
        if (status === "complete") {
          console.log(`  [${i + 1}/${pdfFiles.length}] ${file} - ${detail}`);
        }
      });
    } catch (err) {
      console.error(`  [${i + 1}/${pdfFiles.length}] ${file} - ERROR: ${err}`);
    }
  }

  const policyElapsed = ((Date.now() - policyStart) / 1000).toFixed(1);
  console.log(`  Policy ingestion completed in ${policyElapsed}s`);

  // Verify policy ingestion
  const [polDocCount] = db.select({ count: count() }).from(policyDocuments).all();
  const completePolicies = db
    .select()
    .from(policyDocuments)
    .where(eq(policyDocuments.status, "complete"))
    .all();
  const [chunkCount] = db.select({ count: count() }).from(policyChunks).all();

  // Check embedding sizes
  const sampleChunk = sqlite
    .prepare("SELECT embedding FROM policy_chunks WHERE embedding IS NOT NULL LIMIT 1")
    .get() as { embedding: Buffer } | undefined;
  const embeddingSize = sampleChunk?.embedding?.length ?? 0;

  console.log(`\n  Policy documents: ${polDocCount.count} total, ${completePolicies.length} complete`);
  console.log(`  Policy chunks: ${chunkCount.count}`);
  console.log(`  Embedding blob size: ${embeddingSize} bytes (expected: ${1536 * 4} = 6144)\n`);

  // ── Step 3: Ingest Easy regulatory document ────────────────────────
  console.log("Step 3: Ingesting Easy regulatory document...");
  const reqStart = Date.now();

  const extracted = await extractPdfText(EASY_PDF);
  console.log(`  Extracted ${extracted.pageCount} pages, ${extracted.text.length} chars`);

  const regDocId = randomUUID();
  db.insert(regulatoryDocuments)
    .values({
      id: regDocId,
      filename: "Example Input Doc - Easy.pdf",
      title: "Example Input Doc - Easy",
      rawText: extracted.text,
      pageCount: extracted.pageCount,
      status: "text_extracted",
    })
    .run();

  console.log("  Extracting requirements (calling Claude Opus)...");
  await extractRequirements(regDocId, (status, detail) => {
    console.log(`    [${status}] ${detail}`);
  });

  const reqElapsed = ((Date.now() - reqStart) / 1000).toFixed(1);

  const [reqCount] = db
    .select({ count: count() })
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, regDocId))
    .all();

  const regDoc = db
    .select()
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, regDocId))
    .get();

  console.log(`\n  Regulatory document status: ${regDoc?.status}`);
  console.log(`  Requirements extracted: ${reqCount.count}`);
  console.log(`  Requirement extraction completed in ${reqElapsed}s\n`);

  // ── Step 4: Run evidence matching ──────────────────────────────────
  console.log("Step 4: Running evidence matching (calling Claude Opus)...");
  const evidenceStart = Date.now();

  await matchEvidence(regDocId, (status, detail) => {
    console.log(`    [${status}] ${detail}`);
  });

  const evidenceElapsed = ((Date.now() - evidenceStart) / 1000).toFixed(1);

  const [evidenceCount] = db.select({ count: count() }).from(evidence).all();
  console.log(`\n  Evidence matching completed in ${evidenceElapsed}s`);
  console.log(`  Evidence records: ${evidenceCount.count}\n`);

  // ── Step 5: Verify data quality ────────────────────────────────────
  console.log("Step 5: Verifying data quality...\n");

  // Compliance summary
  const allReqs = db
    .select()
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, regDocId))
    .all();

  const statusCounts = { met: 0, partial: 0, not_met: 0, unclear: 0 };
  for (const req of allReqs) {
    const s = req.complianceStatus as keyof typeof statusCounts;
    if (s in statusCounts) statusCounts[s]++;
  }

  console.log("  ┌─────────────────────────────────┐");
  console.log("  │     Compliance Summary           │");
  console.log("  ├─────────────────────────────────┤");
  console.log(`  │  Met:     ${String(statusCounts.met).padStart(4)}               │`);
  console.log(`  │  Partial: ${String(statusCounts.partial).padStart(4)}               │`);
  console.log(`  │  Not Met: ${String(statusCounts.not_met).padStart(4)}               │`);
  console.log(`  │  Unclear: ${String(statusCounts.unclear).padStart(4)}               │`);
  console.log(`  │  Total:   ${String(allReqs.length).padStart(4)}               │`);
  console.log("  └─────────────────────────────────┘\n");

  // 3 example requirements with evidence
  console.log("  Example requirements with evidence:\n");
  const reqsWithEvidence = allReqs.filter((r) => r.complianceStatus !== "not_met" && r.complianceStatus !== "unclear");
  const examples = reqsWithEvidence.slice(0, 3);

  for (const req of examples) {
    console.log(`  Requirement ${req.requirementNumber}: ${req.text.slice(0, 100)}${req.text.length > 100 ? "..." : ""}`);
    console.log(`    Status: ${req.complianceStatus}`);

    const evRecords = db
      .select()
      .from(evidence)
      .where(eq(evidence.requirementId, req.id))
      .all();

    for (const ev of evRecords.slice(0, 1)) {
      console.log(`    Evidence excerpt: ${ev.excerpt?.slice(0, 150)}${(ev.excerpt?.length ?? 0) > 150 ? "..." : ""}`);
      console.log(`    Reasoning: ${ev.reasoning?.slice(0, 150)}${(ev.reasoning?.length ?? 0) > 150 ? "..." : ""}`);
      console.log(`    Confidence: ${ev.confidence}`);
    }
    console.log();
  }

  // Semantic search test
  console.log("  Semantic search test: 'hospice election'");
  const searchResults = await semanticSearch("hospice election", 5);
  console.log(`    Found ${searchResults.length} results:`);
  for (const r of searchResults.slice(0, 3)) {
    console.log(`      [${r.policyFilename.split("/").pop()}] sim=${r.similarity.toFixed(3)} - ${r.chunkText.slice(0, 80)}...`);
  }

  // ── Acceptance Criteria ────────────────────────────────────────────
  console.log("\n\n╔══════════════════════════════════════╗");
  console.log("║     Acceptance Criteria Check        ║");
  console.log("╚══════════════════════════════════════╝\n");

  let allPass = true;
  function check(name: string, pass: boolean, detail: string) {
    const icon = pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${name}: ${detail}`);
    if (!pass) allPass = false;
  }

  check(
    "Policy documents >= 10 with status complete",
    completePolicies.length >= 10,
    `${completePolicies.length} complete`
  );

  check(
    "Policy chunks >= 50 with embeddings",
    chunkCount.count >= 50,
    `${chunkCount.count} chunks`
  );

  check(
    "Embedding size correct (6144 bytes)",
    embeddingSize === 6144,
    `${embeddingSize} bytes`
  );

  check(
    "Requirements >= 30 from Easy PDF",
    reqCount.count >= 30,
    `${reqCount.count} requirements`
  );

  check(
    "Evidence >= 10 records with real data",
    evidenceCount.count >= 10,
    `${evidenceCount.count} evidence records`
  );

  // Check that evidence records have real data
  const allEvidence = db.select().from(evidence).all();
  const hasRealData = allEvidence.every(
    (e) => e.status && e.excerpt && e.reasoning && e.confidence !== null
  );
  check(
    "Evidence records have excerpt, reasoning, confidence",
    hasRealData,
    hasRealData ? "all fields present" : "some fields missing"
  );

  const hasMetOrPartial =
    statusCounts.met > 0 || statusCounts.partial > 0;
  check(
    "Some requirements met or partial",
    hasMetOrPartial,
    `met=${statusCounts.met}, partial=${statusCounts.partial}`
  );

  const uniqueStatuses = Object.entries(statusCounts).filter(([, v]) => v > 0).length;
  check(
    "Mix of compliance statuses",
    uniqueStatuses >= 2,
    `${uniqueStatuses} distinct statuses`
  );

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n  Total time: ${totalElapsed}s`);
  console.log(`\n  ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}\n`);

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("\nPipeline test failed:", err);
  process.exit(1);
});
