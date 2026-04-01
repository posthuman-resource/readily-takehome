/**
 * Live pipeline integration test.
 *
 * Runs the full ingestion pipeline end-to-end with real API calls:
 * 1. Ingest PA policy documents (skips if already done)
 * 2. Ingest Easy regulatory document + extract requirements (skips if already done)
 * 3. Run evidence matching (resumes from where it left off)
 * 4. Verify data quality
 *
 * Fully idempotent — safe to re-run. Skips completed work.
 *
 * Pass --clean to wipe the database first.
 *
 * Usage:
 *   DATA_DIR=./data npx tsx scripts/test-live-pipeline.ts
 *   DATA_DIR=./data npx tsx scripts/test-live-pipeline.ts --clean
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
const EASY_FILENAME = "Example Input Doc - Easy.pdf";
const POLICIES_DIR = resolve("data/Public Policies/PA");
const POLICY_COUNT = 12;

async function main() {
  const totalStart = Date.now();
  const doClean = process.argv.includes("--clean");

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   Live Pipeline Integration Test     ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ── Step 1: Optional clean ────────────────────────────────────────
  if (doClean) {
    console.log("Step 1: Cleaning database (--clean flag)...");
    db.delete(evidence).run();
    db.delete(requirements).run();
    db.delete(policyChunks).run();
    db.delete(policyDocuments).run();
    db.delete(regulatoryDocuments).run();
    db.delete(chatMessages).run();
    console.log("  All tables cleared.\n");
  } else {
    console.log("Step 1: Skipping clean (no --clean flag). Will resume from existing data.\n");
  }

  // ── Step 2: Ingest PA policy documents ─────────────────────────────
  const existingComplete = db
    .select()
    .from(policyDocuments)
    .where(eq(policyDocuments.status, "complete"))
    .all();

  if (existingComplete.length >= POLICY_COUNT) {
    console.log(`Step 2: Skipping policy ingestion (${existingComplete.length} already complete).\n`);
  } else {
    console.log(`Step 2: Ingesting PA policy documents (${existingComplete.length} already complete)...`);
    const policyStart = Date.now();

    const pdfFiles = readdirSync(POLICIES_DIR)
      .filter((f) => f.endsWith(".pdf"))
      .sort()
      .slice(0, POLICY_COUNT);

    // Find which files are already ingested
    const existingFilenames = new Set(
      db.select({ filename: policyDocuments.filename }).from(policyDocuments).all().map((r) => r.filename)
    );

    let processed = existingComplete.length;
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const filePath = resolve(POLICIES_DIR, file);

      if (existingFilenames.has(filePath)) {
        continue; // already registered
      }

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
            processed++;
            console.log(`  [${processed}/${POLICY_COUNT}] ${file} - ${detail}`);
          }
        });
      } catch (err) {
        console.error(`  ${file} - ERROR: ${err}`);
      }
    }

    const policyElapsed = ((Date.now() - policyStart) / 1000).toFixed(1);
    console.log(`  Policy ingestion completed in ${policyElapsed}s\n`);
  }

  // Verify policy ingestion
  const [polDocCount] = db.select({ count: count() }).from(policyDocuments).all();
  const completePolicies = db
    .select()
    .from(policyDocuments)
    .where(eq(policyDocuments.status, "complete"))
    .all();
  const [chunkCount] = db.select({ count: count() }).from(policyChunks).all();

  const sampleChunk = sqlite
    .prepare("SELECT embedding FROM policy_chunks WHERE embedding IS NOT NULL LIMIT 1")
    .get() as { embedding: Buffer } | undefined;
  const embeddingSize = sampleChunk?.embedding?.length ?? 0;

  console.log(`  Policy documents: ${polDocCount.count} total, ${completePolicies.length} complete`);
  console.log(`  Policy chunks: ${chunkCount.count}`);
  console.log(`  Embedding blob size: ${embeddingSize} bytes (expected: ${1536 * 4} = 6144)\n`);

  // ── Step 3: Ingest Easy regulatory document ────────────────────────
  let regDocId: string;

  const existingRegDoc = db
    .select()
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.filename, EASY_FILENAME))
    .get();

  const [existingReqCount] = existingRegDoc
    ? db
        .select({ count: count() })
        .from(requirements)
        .where(eq(requirements.regulatoryDocumentId, existingRegDoc.id))
        .all()
    : [{ count: 0 }];

  if (existingRegDoc && existingReqCount.count > 0) {
    regDocId = existingRegDoc.id;
    console.log(`Step 3: Skipping requirement extraction (${existingReqCount.count} requirements already exist for "${EASY_FILENAME}").\n`);
  } else {
    console.log("Step 3: Ingesting Easy regulatory document...");
    const reqStart = Date.now();

    if (existingRegDoc) {
      // Doc registered but requirements not extracted yet
      regDocId = existingRegDoc.id;
      console.log("  Document already registered, extracting requirements...");
    } else {
      const extracted = await extractPdfText(EASY_PDF);
      console.log(`  Extracted ${extracted.pageCount} pages, ${extracted.text.length} chars`);

      regDocId = randomUUID();
      db.insert(regulatoryDocuments)
        .values({
          id: regDocId,
          filename: EASY_FILENAME,
          title: "Example Input Doc - Easy",
          rawText: extracted.text,
          pageCount: extracted.pageCount,
          status: "text_extracted",
        })
        .run();
    }

    console.log("  Extracting requirements (calling Claude Opus)...");
    await extractRequirements(regDocId, (status, detail) => {
      console.log(`    [${status}] ${detail}`);
    });

    const reqElapsed = ((Date.now() - reqStart) / 1000).toFixed(1);
    console.log(`  Requirement extraction completed in ${reqElapsed}s\n`);
  }

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

  console.log(`  Regulatory document status: ${regDoc?.status}`);
  console.log(`  Requirements extracted: ${reqCount.count}\n`);

  // ── Step 4: Run evidence matching ──────────────────────────────────
  // matchEvidence is already resumable — it skips requirements that have evidence
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
