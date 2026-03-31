import { sqlite } from "./db";
import { embedText, serializeEmbedding } from "./embeddings";

export interface SearchResult {
  chunkId: string;
  policyDocumentId: string;
  policyFilename: string;
  policyCategory: string;
  pageNumber: number;
  chunkText: string;
  similarity: number;
}

export async function semanticSearch(
  query: string,
  topK: number = 10
): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);
  const queryBuffer = serializeEmbedding(queryEmbedding);

  const rows = sqlite
    .prepare(
      `SELECT
        pc.id as chunkId,
        pc.policy_document_id as policyDocumentId,
        pd.filename as policyFilename,
        pd.category as policyCategory,
        pc.page_number as pageNumber,
        pc.text as chunkText,
        vec_distance_cosine(pc.embedding, ?) as distance
      FROM policy_chunks pc
      JOIN policy_documents pd ON pd.id = pc.policy_document_id
      WHERE pc.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ?`
    )
    .all(queryBuffer, topK) as Array<{
    chunkId: string;
    policyDocumentId: string;
    policyFilename: string;
    policyCategory: string;
    pageNumber: number;
    chunkText: string;
    distance: number;
  }>;

  return rows.map((row) => ({
    chunkId: row.chunkId,
    policyDocumentId: row.policyDocumentId,
    policyFilename: row.policyFilename,
    policyCategory: row.policyCategory,
    pageNumber: row.pageNumber,
    chunkText: row.chunkText,
    similarity: 1 - row.distance,
  }));
}
