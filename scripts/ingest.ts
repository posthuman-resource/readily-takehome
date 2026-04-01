/**
 * Ingest a single PDF document into the compliance database.
 *
 * Usage:
 *   npx tsx scripts/ingest.ts <path-to-pdf> [--type regulatory|policy] [--category AA|CMC|...]
 */
import "../lib/env";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  registerDocument,
  processDocument,
  type DocumentType,
} from "../lib/pipeline";

async function main() {
  const args = process.argv.slice(2);

  let filePath: string | undefined;
  let type: DocumentType | undefined;
  let category: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && i + 1 < args.length) {
      type = args[++i] as DocumentType;
    } else if (args[i] === "--category" && i + 1 < args.length) {
      category = args[++i];
    } else if (!args[i].startsWith("--")) {
      filePath = args[i];
    }
  }

  if (!filePath) {
    console.error(
      "Usage: npx tsx scripts/ingest.ts <path-to-pdf> [--type regulatory|policy] [--category AA|CMC|...]"
    );
    process.exit(1);
  }

  const resolved = path.resolve(filePath);

  if (!existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  if (!resolved.toLowerCase().endsWith(".pdf")) {
    console.error(`Not a PDF file: ${resolved}`);
    process.exit(1);
  }

  // Auto-detect type and category from path if not specified
  if (!type) {
    const relPath = path.relative(
      path.resolve("data/Public Policies"),
      resolved
    );
    if (!relPath.startsWith("..") && relPath.includes(path.sep)) {
      type = "policy";
      if (!category) {
        category = relPath.split(path.sep)[0];
      }
    } else {
      type = "regulatory";
    }
  }

  const basename = path.basename(resolved);
  console.log(
    `Ingesting: ${basename} (${type}${category ? `, category: ${category}` : ""})`
  );

  const startTime = Date.now();

  const id = await registerDocument(resolved, type, category);

  await processDocument(id, type, (event) => {
    const detail = event.detail ? ` ${event.detail}` : "";
    console.log(`  [${event.status}]${detail}`);
  });

  const elapsed = formatDuration(Date.now() - startTime);
  console.log(`  [complete] Done in ${elapsed}`);
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
