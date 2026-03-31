/**
 * Test script for requirement extraction.
 *
 * Usage:
 *   npx tsx scripts/test-requirement-extraction.ts "data/Example Input Doc - Easy.pdf"
 *   npx tsx scripts/test-requirement-extraction.ts "data/Example Input Doc - Hard.pdf"
 */
import "../lib/env";
import { db } from "../lib/db";
import { regulatoryDocuments, requirements } from "../lib/db/schema";
import { extractPdfText } from "../lib/pdf";
import { extractRequirements } from "../lib/pipeline/requirements";
import { eq, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("Usage: npx tsx scripts/test-requirement-extraction.ts <pdf-path>");
    process.exit(1);
  }

  const fullPath = resolve(pdfPath);
  console.log(`\n=== Requirement Extraction Test ===`);
  console.log(`PDF: ${fullPath}\n`);

  // Step 1: Extract text from PDF
  console.log("Extracting text from PDF...");
  const extracted = await extractPdfText(fullPath);
  console.log(`  Pages: ${extracted.pageCount}`);
  console.log(`  Text length: ${extracted.text.length} characters`);

  // Step 2: Create or find regulatory document record
  const docId = randomUUID();
  const filename = fullPath.split("/").pop() ?? "unknown.pdf";

  db.insert(regulatoryDocuments)
    .values({
      id: docId,
      filename,
      title: filename.replace(".pdf", ""),
      rawText: extracted.text,
      pageCount: extracted.pageCount,
      status: "text_extracted",
    })
    .run();

  console.log(`  Created document record: ${docId}\n`);

  // Step 3: Extract requirements
  console.log("Extracting requirements (this may take a minute)...");
  const startTime = Date.now();

  await extractRequirements(docId, (status, detail) => {
    console.log(`  [${status}] ${detail ?? ""}`);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nExtraction completed in ${elapsed}s`);

  // Step 4: Read and display results
  const reqs = db
    .select()
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, docId))
    .all();

  console.log(`\n=== Results ===`);
  console.log(`Total requirements extracted: ${reqs.length}`);

  // Show first 5 requirements
  console.log(`\nFirst 5 requirements:`);
  for (const req of reqs.slice(0, 5)) {
    console.log(`  ${req.requirementNumber}: ${req.text.slice(0, 120)}${req.text.length > 120 ? "..." : ""}`);
    if (req.reference) console.log(`    Reference: ${req.reference}`);
    if (req.category) console.log(`    Category: ${req.category}`);
  }

  // Show categories
  const categories = [...new Set(reqs.map((r) => r.category).filter(Boolean))];
  console.log(`\nCategories found: ${categories.length}`);
  for (const cat of categories) {
    const catCount = reqs.filter((r) => r.category === cat).length;
    console.log(`  ${cat}: ${catCount} requirements`);
  }

  // Step 5: Test idempotency
  console.log(`\n=== Idempotency Test ===`);
  console.log("Running extraction again on same document...");
  await extractRequirements(docId, (status, detail) => {
    console.log(`  [${status}] ${detail ?? ""}`);
  });

  const [afterRerun] = db
    .select({ count: count() })
    .from(requirements)
    .where(eq(requirements.regulatoryDocumentId, docId))
    .all();

  console.log(`Requirements after re-run: ${afterRerun.count}`);
  if (afterRerun.count === reqs.length) {
    console.log("  PASS: Idempotency check passed (no duplicates)");
  } else {
    console.log("  FAIL: Idempotency check failed!");
    process.exit(1);
  }

  // Cleanup: remove test data
  db.delete(requirements)
    .where(eq(requirements.regulatoryDocumentId, docId))
    .run();
  db.delete(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, docId))
    .run();
  console.log("\nTest data cleaned up.");
  console.log("=== Test Complete ===\n");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
