import "../lib/env";
import Database from "better-sqlite3";
import { load } from "sqlite-vec";
import { embedText, embedTexts, serializeEmbedding } from "../lib/embeddings";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vec-test-"));
const dbPath = path.join(tmpDir, "test.sqlite");

async function main() {
  console.log("=== Vector Search Test ===\n");

  // 1. Set up temp database with sqlite-vec
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  load(sqlite);

  const version = sqlite.prepare("select vec_version()").get() as Record<string, string>;
  console.log("sqlite-vec version:", Object.values(version)[0]);

  // Create tables matching the production schema
  sqlite.exec(`
    CREATE TABLE policy_documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT,
      page_count INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      raw_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE policy_chunks (
      id TEXT PRIMARY KEY,
      policy_document_id TEXT NOT NULL REFERENCES policy_documents(id),
      page_number INTEGER,
      chunk_index INTEGER,
      text TEXT NOT NULL,
      embedding BLOB,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Test texts - healthcare policy related
  const testTexts = [
    "Patients must be assessed for fall risk within 24 hours of admission.",
    "All medication administration requires double verification by licensed staff.",
    "Hand hygiene must be performed before and after every patient contact.",
    "Discharge planning begins at the time of admission and involves the patient and family.",
    "Infection control protocols require isolation for patients with communicable diseases.",
  ];

  console.log("\n--- Embedding test texts ---");
  const embeddings = await embedTexts(testTexts);
  console.log(`Embedded ${embeddings.length} texts (${embeddings[0].length} dimensions each)`);

  // 3. Insert test data
  const docId = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO policy_documents (id, filename, category, status)
       VALUES (?, ?, ?, ?)`
    )
    .run(docId, "test-policy.pdf", "GG", "processed");

  const insertChunk = sqlite.prepare(
    `INSERT INTO policy_chunks (id, policy_document_id, page_number, chunk_index, text, embedding)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (let i = 0; i < testTexts.length; i++) {
    insertChunk.run(
      randomUUID(),
      docId,
      1,
      i,
      testTexts[i],
      serializeEmbedding(embeddings[i])
    );
  }
  console.log(`Inserted ${testTexts.length} chunks into database`);

  // 4. Search with a related query
  const queries = [
    "What are the requirements for preventing patient falls?",
    "How should medications be given safely?",
    "What are the hand washing policies?",
  ];

  for (const query of queries) {
    console.log(`\n--- Query: "${query}" ---`);
    const queryEmbedding = await embedText(query);
    const queryBuffer = serializeEmbedding(queryEmbedding);

    const results = sqlite
      .prepare(
        `SELECT
          pc.id as chunkId,
          pc.text as chunkText,
          pd.filename as policyFilename,
          pd.category as policyCategory,
          vec_distance_cosine(pc.embedding, ?) as distance
        FROM policy_chunks pc
        JOIN policy_documents pd ON pd.id = pc.policy_document_id
        WHERE pc.embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 3`
      )
      .all(queryBuffer) as Array<{
      chunkId: string;
      chunkText: string;
      policyFilename: string;
      policyCategory: string;
      distance: number;
    }>;

    for (const [rank, r] of results.entries()) {
      const similarity = (1 - r.distance).toFixed(4);
      console.log(`  ${rank + 1}. [sim=${similarity}] ${r.chunkText.slice(0, 80)}`);
    }

    // Verify results are sorted by distance (ascending)
    for (let i = 1; i < results.length; i++) {
      if (results[i].distance < results[i - 1].distance) {
        throw new Error("Results are not sorted by distance!");
      }
    }
  }

  // 5. Cleanup
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true });
  console.log("\n--- Cleanup complete ---");
  console.log("\n=== All tests passed! ===");
}

main().catch((err) => {
  // Cleanup on error
  try {
    fs.rmSync(tmpDir, { recursive: true });
  } catch {}
  console.error("Test failed:", err);
  process.exit(1);
});
