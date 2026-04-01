/**
 * Seed the database with the full document corpus.
 *
 * Usage:
 *   npx tsx scripts/seed.ts [--policies-only] [--regulatory-only] [--category AA] [--dry-run]
 */
import "../lib/env";
import { readdirSync } from "node:fs";
import path from "node:path";
import { db } from "../lib/db";
import {
  policyDocuments,
  policyChunks,
  regulatoryDocuments,
} from "../lib/db/schema";
import { registerDocument, processDocument } from "../lib/pipeline";
import { eq, count, like } from "drizzle-orm";

const VALID_CATEGORIES = [
  "AA",
  "CMC",
  "DD",
  "EE",
  "FF",
  "GA",
  "GG",
  "HH",
  "MA",
  "PA",
];
const POLICIES_SRC_DIR = path.resolve("data/Public Policies");
const REGULATORY_DOCS = [
  path.resolve("data/Example Input Doc - Easy.pdf"),
  path.resolve("data/Example Input Doc - Hard.pdf"),
];

async function main() {
  const args = process.argv.slice(2);

  const policiesOnly = args.includes("--policies-only");
  const regulatoryOnly = args.includes("--regulatory-only");
  const dryRun = args.includes("--dry-run");

  let categoryFilter: string | undefined;
  const catIdx = args.indexOf("--category");
  if (catIdx !== -1 && catIdx + 1 < args.length) {
    categoryFilter = args[catIdx + 1];
    if (!VALID_CATEGORIES.includes(categoryFilter)) {
      console.error(
        `Invalid category: ${categoryFilter}. Valid: ${VALID_CATEGORIES.join(", ")}`
      );
      process.exit(1);
    }
  }

  if (!regulatoryOnly) {
    await seedPolicies(categoryFilter, dryRun);
  }

  if (!policiesOnly) {
    await seedRegulatory(dryRun);
  }
}

async function seedPolicies(categoryFilter?: string, dryRun?: boolean) {
  console.log("Seeding policy documents...\n");

  const categories = categoryFilter ? [categoryFilter] : VALID_CATEGORIES;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalChunks = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  for (const cat of categories) {
    const catDir = path.join(POLICIES_SRC_DIR, cat);
    const pdfs = readdirSync(catDir)
      .filter((f) => f.endsWith(".pdf"))
      .sort();

    for (let i = 0; i < pdfs.length; i++) {
      const pdf = pdfs[i];
      const filePath = path.join(catDir, pdf);
      const label = `[${cat}] ${i + 1}/${pdfs.length} ${pdf}`;

      // Check if already in DB (match by basename in filename)
      const existing = db
        .select()
        .from(policyDocuments)
        .where(like(policyDocuments.filename, `%/${pdf}`))
        .get();

      if (existing?.status === "complete") {
        const chunks = db
          .select({ count: count() })
          .from(policyChunks)
          .where(eq(policyChunks.policyDocumentId, existing.id))
          .get();
        console.log(
          `${label} - complete (${existing.pageCount ?? "?"} pages, ${chunks?.count ?? 0} chunks)`
        );
        totalSkipped++;
        continue;
      }

      if (dryRun) {
        console.log(
          `${label} - would ${existing ? "resume" : "process"}`
        );
        continue;
      }

      try {
        let docId: string;
        if (existing) {
          // Already registered but not complete — resume
          docId = existing.id;
        } else {
          docId = await registerDocument(filePath, "policy", cat);
        }

        await processDocument(docId, "policy", (event) => {
          if (event.status === "complete") {
            const doc = db
              .select()
              .from(policyDocuments)
              .where(eq(policyDocuments.id, docId))
              .get();
            const chunks = db
              .select({ count: count() })
              .from(policyChunks)
              .where(eq(policyChunks.policyDocumentId, docId))
              .get();
            const chunkCount = chunks?.count ?? 0;
            totalChunks += chunkCount;
            console.log(
              `${label} - complete (${doc?.pageCount ?? "?"} pages, ${chunkCount} chunks)`
            );
          }
        });
        totalProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${label} - ERROR: ${msg}`);
        totalErrors++;
      }
    }
  }

  const elapsed = formatDuration(Date.now() - startTime);
  console.log(
    `\nPolicy ingestion complete: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors, ~${totalChunks} new chunks, ${elapsed}\n`
  );
}

async function seedRegulatory(dryRun?: boolean) {
  console.log("Seeding regulatory documents...\n");

  for (let i = 0; i < REGULATORY_DOCS.length; i++) {
    const filePath = REGULATORY_DOCS[i];
    const basename = path.basename(filePath);
    const label = `[${i + 1}/${REGULATORY_DOCS.length}] ${basename}`;

    // Check if already complete (match by basename)
    const existing = db
      .select()
      .from(regulatoryDocuments)
      .where(like(regulatoryDocuments.filename, `%${basename}`))
      .get();

    if (existing?.status === "complete") {
      console.log(`${label} - already complete`);
      continue;
    }

    if (dryRun) {
      console.log(
        `${label} - would ${existing ? "resume" : "process"}`
      );
      continue;
    }

    console.log(label);

    try {
      let docId: string;
      if (existing) {
        docId = existing.id;
      } else {
        docId = await registerDocument(filePath, "regulatory");
      }

      await processDocument(docId, "regulatory", (event) => {
        const detail = event.detail ? ` ${event.detail}` : "";
        console.log(`  [${event.status}]${detail}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: ${msg}`);
    }
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
