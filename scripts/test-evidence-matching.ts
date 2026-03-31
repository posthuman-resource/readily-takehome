/**
 * Test script for evidence matching.
 *
 * Sets up prerequisite data (requirements + policy chunks) if needed,
 * then runs evidence matching and verifies results.
 *
 * Usage:
 *   DATA_DIR=./data npx tsx scripts/test-evidence-matching.ts
 */
import "../lib/env";
import { db } from "../lib/db";
import {
  regulatoryDocuments,
  requirements,
  policyDocuments,
  policyChunks,
  evidence,
} from "../lib/db/schema";
import { extractPdfText } from "../lib/pdf";
import { extractRequirements } from "../lib/pipeline/requirements";
import { processPolicy } from "../lib/pipeline/policy";
import { matchEvidence } from "../lib/pipeline/evidence";
import { eq, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

const EASY_PDF = resolve("data/Example Input Doc - Easy.pdf");
const POLICIES_DIR = resolve("data/Public Policies");

// Ingest a small subset of policies for testing (5 from GG, 5 from HH)
const POLICY_CATEGORIES = ["GG", "HH"];
const POLICIES_PER_CATEGORY = 5;

async function ensureRegulatoryDoc(): Promise<string> {
  // Check if we already have a doc with requirements
  const existing = db
    .select()
    .from(regulatoryDocuments)
    .all();

  for (const doc of existing) {
    const [reqCount] = db
      .select({ count: count() })
      .from(requirements)
      .where(eq(requirements.regulatoryDocumentId, doc.id))
      .all();
    if (reqCount.count > 0) {
      console.log(`  Using existing regulatory doc ${doc.id} with ${reqCount.count} requirements`);
      return doc.id;
    }
  }

  // Need to create one and extract requirements
  console.log("  Creating regulatory document and extracting requirements...");
  const extracted = await extractPdfText(EASY_PDF);

  const docId = randomUUID();
  db.insert(regulatoryDocuments)
    .values({
      id: docId,
      filename: "Example Input Doc - Easy.pdf",
      title: "Example Input Doc - Easy",
      rawText: extracted.text,
      pageCount: extracted.pageCount,
      status: "text_extracted",
    })
    .run();

  await extractRequirements(docId, (status, detail) => {
    console.log(`    [requirements] ${detail ?? status}`);
  });

  const [reqCount] = db
    .select({ count: count() })
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, docId))
    .all();

  console.log(`  Created doc ${docId} with ${reqCount.count} requirements`);
  return docId;
}

async function ensurePolicyChunks(): Promise<void> {
  // Check if we already have enough policy chunks
  const [chunkCount] = db
    .select({ count: count() })
    .from(policyChunks)
    .all();

  if (chunkCount.count > 0) {
    const [polCount] = db.select({ count: count() }).from(policyDocuments).all();
    console.log(`  Using existing policy data: ${polCount.count} docs, ${chunkCount.count} chunks`);
    return;
  }

  // Ingest a subset of policy documents
  console.log(`  Ingesting policies from categories: ${POLICY_CATEGORIES.join(", ")} (${POLICIES_PER_CATEGORY} each)`);

  for (const category of POLICY_CATEGORIES) {
    const catDir = resolve(POLICIES_DIR, category);
    const files = readdirSync(catDir)
      .filter((f) => f.endsWith(".pdf"))
      .slice(0, POLICIES_PER_CATEGORY);

    for (const file of files) {
      const filePath = resolve(catDir, file);
      const docId = randomUUID();

      db.insert(policyDocuments)
        .values({
          id: docId,
          filename: filePath,
          category,
          title: file.replace(".pdf", ""),
          status: "pending",
        })
        .run();

      try {
        await processPolicy(docId, (status, detail) => {
          if (status === "complete" || status === "embedding") {
            console.log(`    [${category}/${file}] ${detail ?? status}`);
          }
        });
      } catch (err) {
        console.error(`    [${category}/${file}] ERROR: ${err}`);
      }
    }
  }

  const [finalChunks] = db.select({ count: count() }).from(policyChunks).all();
  const [finalDocs] = db.select({ count: count() }).from(policyDocuments).all();
  console.log(`  Ingested ${finalDocs.count} policy docs with ${finalChunks.count} chunks`);
}

async function main() {
  console.log("\n=== Evidence Matching Test ===\n");

  // Step 1: Ensure we have a regulatory doc with requirements
  console.log("Step 1: Ensuring regulatory document with requirements...");
  const docId = await ensureRegulatoryDoc();

  // Step 2: Ensure we have policy chunks to search
  console.log("\nStep 2: Ensuring policy chunks exist...");
  await ensurePolicyChunks();

  // Step 3: Run evidence matching
  console.log("\nStep 3: Running evidence matching...");
  const startTime = Date.now();

  await matchEvidence(docId, (status, detail) => {
    console.log(`  [${status}] ${detail ?? ""}`);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nEvidence matching completed in ${elapsed}s`);

  // Step 4: Verify results
  console.log("\n=== Results ===");

  const reqs = db
    .select()
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, docId))
    .all();

  const evidenceRecords = db
    .select()
    .from(evidence)
    .all();

  // Filter evidence to this document's requirements
  const reqIds = new Set(reqs.map((r) => r.id));
  const docEvidence = evidenceRecords.filter((e) => reqIds.has(e.requirementId));

  console.log(`Total requirements: ${reqs.length}`);
  console.log(`Total evidence records: ${docEvidence.length}`);

  // Compliance status breakdown
  const statusCounts = { met: 0, partial: 0, not_met: 0, unclear: 0 };
  for (const req of reqs) {
    const status = req.complianceStatus as keyof typeof statusCounts;
    if (status in statusCounts) statusCounts[status]++;
  }
  console.log(`\nCompliance status breakdown:`);
  console.log(`  met:     ${statusCounts.met}`);
  console.log(`  partial: ${statusCounts.partial}`);
  console.log(`  not_met: ${statusCounts.not_met}`);
  console.log(`  unclear: ${statusCounts.unclear}`);

  // Show a few evidence examples
  console.log(`\nSample evidence records (first 3):`);
  for (const ev of docEvidence.slice(0, 3)) {
    const req = reqs.find((r) => r.id === ev.requirementId);
    console.log(`  Requirement: ${req?.requirementNumber} - ${req?.text.slice(0, 80)}...`);
    console.log(`    Status: ${ev.status} (confidence: ${ev.confidence})`);
    console.log(`    Excerpt: ${ev.excerpt?.slice(0, 120)}...`);
    console.log(`    Reasoning: ${ev.reasoning?.slice(0, 120)}...`);
    console.log();
  }

  // Verify acceptance criteria
  console.log("=== Acceptance Criteria Checks ===");

  let pass = true;

  // Evidence records exist
  if (docEvidence.length > 0) {
    console.log("  PASS: Evidence records created");
  } else {
    console.log("  FAIL: No evidence records created");
    pass = false;
  }

  // Each evidence record has required fields
  const hasAllFields = docEvidence.every(
    (e) => e.status && e.excerpt && e.reasoning && e.confidence !== null
  );
  if (hasAllFields) {
    console.log("  PASS: All evidence records have status, excerpt, reasoning, confidence");
  } else {
    console.log("  FAIL: Some evidence records missing fields");
    pass = false;
  }

  // Compliance statuses are updated
  const hasUpdated = reqs.some((r) => r.complianceStatus !== "unclear");
  if (hasUpdated) {
    console.log("  PASS: Requirement complianceStatus fields updated");
  } else {
    console.log("  FAIL: No requirements had their complianceStatus updated");
    pass = false;
  }

  // Mix of statuses (not all one)
  const uniqueStatuses = Object.entries(statusCounts).filter(([, v]) => v > 0).length;
  if (uniqueStatuses >= 2) {
    console.log(`  PASS: Mix of compliance statuses (${uniqueStatuses} distinct)`);
  } else {
    console.log(`  FAIL: Only one compliance status found`);
    pass = false;
  }

  // Step 5: Test idempotency
  console.log("\n=== Idempotency Test ===");
  const evidenceBefore = docEvidence.length;

  await matchEvidence(docId, (status, detail) => {
    console.log(`  [${status}] ${detail ?? ""}`);
  });

  const evidenceAfter = db
    .select()
    .from(evidence)
    .all()
    .filter((e) => reqIds.has(e.requirementId)).length;

  if (evidenceAfter === evidenceBefore) {
    console.log(`  PASS: Idempotency check passed (${evidenceAfter} records, no duplicates)`);
  } else {
    console.log(`  FAIL: Idempotency check failed (${evidenceBefore} -> ${evidenceAfter})`);
    pass = false;
  }

  console.log(`\n=== ${pass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"} ===\n`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
