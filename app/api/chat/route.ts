import { streamText, tool, convertToModelMessages, stepCountIs, UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  regulatoryDocuments,
  requirements,
  policyDocuments,
  policyChunks,
  evidence,
} from "@/lib/db/schema";
import { eq, like, and, sql, count } from "drizzle-orm";
import { semanticSearch } from "@/lib/search";
import { processDocument, registerDocument } from "@/lib/pipeline";

const queryRequirements = tool({
  description:
    "Search requirements by regulatory document, status, or text. Returns matching requirements with their compliance status.",
  inputSchema: z.object({
    regulatoryDocId: z
      .string()
      .optional()
      .describe("Filter by regulatory document ID"),
    status: z
      .enum(["met", "not_met", "partial", "unclear"])
      .optional()
      .describe("Filter by compliance status"),
    searchText: z
      .string()
      .optional()
      .describe("Search text within requirement text"),
    limit: z.number().optional().default(20).describe("Max results to return"),
  }),
  execute: async ({ regulatoryDocId, status, searchText, limit }) => {
    try {
      const conditions = [];
      if (regulatoryDocId) {
        conditions.push(
          eq(requirements.regulatoryDocumentId, regulatoryDocId)
        );
      }
      if (status) {
        conditions.push(eq(requirements.complianceStatus, status));
      }
      if (searchText) {
        conditions.push(like(requirements.text, `%${searchText}%`));
      }

      const where =
        conditions.length > 0 ? and(...conditions) : undefined;

      const rows = db
        .select({
          id: requirements.id,
          requirementNumber: requirements.requirementNumber,
          text: requirements.text,
          complianceStatus: requirements.complianceStatus,
          regulatoryDocumentId: requirements.regulatoryDocumentId,
          reference: requirements.reference,
          category: requirements.category,
        })
        .from(requirements)
        .where(where)
        .limit(limit)
        .all();

      if (rows.length === 0) {
        return { results: [], message: "No requirements found matching the criteria." };
      }

      return { results: rows, count: rows.length };
    } catch (err) {
      return { error: `Failed to query requirements: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

const queryPolicies = tool({
  description:
    "Browse organizational policies by category or search by filename.",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe(
        "Policy category: AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA"
      ),
    searchText: z
      .string()
      .optional()
      .describe("Search in policy filenames"),
    limit: z.number().optional().default(20),
  }),
  execute: async ({ category, searchText, limit }) => {
    try {
      const conditions = [];
      if (category) {
        conditions.push(eq(policyDocuments.category, category));
      }
      if (searchText) {
        conditions.push(like(policyDocuments.filename, `%${searchText}%`));
      }

      const where =
        conditions.length > 0 ? and(...conditions) : undefined;

      const rows = db
        .select({
          id: policyDocuments.id,
          filename: policyDocuments.filename,
          category: policyDocuments.category,
          title: policyDocuments.title,
          pageCount: policyDocuments.pageCount,
          status: policyDocuments.status,
        })
        .from(policyDocuments)
        .where(where)
        .limit(limit)
        .all();

      if (rows.length === 0) {
        return { results: [], message: "No policies found matching the criteria." };
      }

      return { results: rows, count: rows.length };
    } catch (err) {
      return { error: `Failed to query policies: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

const semanticSearchTool = tool({
  description:
    "Semantic search across all policy documents. Use this to find policies related to a specific topic or question.",
  inputSchema: z.object({
    query: z.string().describe("Natural language search query"),
    topK: z
      .number()
      .optional()
      .default(10)
      .describe("Number of results"),
  }),
  execute: async ({ query, topK }) => {
    try {
      const results = await semanticSearch(query, topK);

      if (results.length === 0) {
        return { results: [], message: "No matching policy content found. The policy corpus may not be indexed yet." };
      }

      return {
        results: results.map((r) => ({
          policyFilename: r.policyFilename,
          category: r.policyCategory,
          pageNumber: r.pageNumber,
          excerpt: r.chunkText,
          similarity: Math.round(r.similarity * 1000) / 1000,
        })),
        count: results.length,
      };
    } catch (err) {
      return { error: `Semantic search failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

const getRequirementDetail = tool({
  description:
    "Get full details on a specific requirement including all evidence matches.",
  inputSchema: z.object({
    requirementId: z.string().describe("The requirement ID"),
  }),
  execute: async ({ requirementId }) => {
    try {
      const req = db
        .select()
        .from(requirements)
        .where(eq(requirements.id, requirementId))
        .get();

      if (!req) {
        return { error: `Requirement not found: ${requirementId}` };
      }

      const evidenceRows = db
        .select({
          id: evidence.id,
          status: evidence.status,
          excerpt: evidence.excerpt,
          reasoning: evidence.reasoning,
          confidence: evidence.confidence,
          policyChunkId: evidence.policyChunkId,
        })
        .from(evidence)
        .where(eq(evidence.requirementId, requirementId))
        .all();

      // Enrich evidence with policy info
      const enrichedEvidence = evidenceRows.map((ev) => {
        const chunk = db
          .select({
            pageNumber: policyChunks.pageNumber,
            policyDocumentId: policyChunks.policyDocumentId,
          })
          .from(policyChunks)
          .where(eq(policyChunks.id, ev.policyChunkId))
          .get();

        let policyFilename: string | null = null;
        if (chunk) {
          const policy = db
            .select({ filename: policyDocuments.filename })
            .from(policyDocuments)
            .where(eq(policyDocuments.id, chunk.policyDocumentId))
            .get();
          policyFilename = policy?.filename ?? null;
        }

        return {
          status: ev.status,
          excerpt: ev.excerpt,
          reasoning: ev.reasoning,
          confidence: ev.confidence,
          policyFilename,
          pageNumber: chunk?.pageNumber,
        };
      });

      return {
        requirement: {
          id: req.id,
          requirementNumber: req.requirementNumber,
          text: req.text,
          complianceStatus: req.complianceStatus,
          reference: req.reference,
          category: req.category,
        },
        evidence: enrichedEvidence,
      };
    } catch (err) {
      return { error: `Failed to get requirement details: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

const getComplianceSummary = tool({
  description:
    "Get aggregated compliance statistics for a regulatory document or all documents.",
  inputSchema: z.object({
    regulatoryDocId: z
      .string()
      .optional()
      .describe(
        "Specific document ID, or omit for overall summary"
      ),
  }),
  execute: async ({ regulatoryDocId }) => {
    try {
      const condition = regulatoryDocId
        ? eq(requirements.regulatoryDocumentId, regulatoryDocId)
        : undefined;

      const rows = db
        .select({
          complianceStatus: requirements.complianceStatus,
          count: count(),
        })
        .from(requirements)
        .where(condition)
        .groupBy(requirements.complianceStatus)
        .all();

      const stats = { total: 0, met: 0, not_met: 0, partial: 0, unclear: 0 };
      for (const row of rows) {
        const status = row.complianceStatus as keyof typeof stats;
        if (status in stats) {
          stats[status] = row.count;
        }
        stats.total += row.count;
      }

      const percentCompliant =
        stats.total > 0
          ? Math.round((stats.met / stats.total) * 1000) / 10
          : 0;

      if (stats.total === 0) {
        return { ...stats, percentCompliant, message: "No requirements found. The knowledge base may not be populated yet." };
      }

      return { ...stats, percentCompliant };
    } catch (err) {
      return { error: `Failed to get compliance summary: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

const startIngestion = tool({
  description:
    "Start processing a newly uploaded regulatory document. Returns the document ID for tracking.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the uploaded PDF file"),
  }),
  execute: async ({ filePath }) => {
    try {
      const documentId = await registerDocument(filePath, "regulatory");

      // Start processing in background
      processDocument(documentId, "regulatory").catch((err) => {
        console.error("Background ingestion error:", err);
      });

      return { documentId, status: "pending" };
    } catch (err) {
      return { error: `Failed to start ingestion: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

const getIngestionStatus = tool({
  description:
    "Check the processing status of a document being ingested.",
  inputSchema: z.object({
    documentId: z.string().describe("The document ID to check"),
  }),
  execute: async ({ documentId }) => {
    try {
      // Check regulatory documents first
      const regDoc = db
        .select({
          id: regulatoryDocuments.id,
          status: regulatoryDocuments.status,
          statusMessage: regulatoryDocuments.statusMessage,
        })
        .from(regulatoryDocuments)
        .where(eq(regulatoryDocuments.id, documentId))
        .get();

      if (regDoc) {
        const [reqCount] = db
          .select({ count: count() })
          .from(requirements)
          .where(eq(requirements.regulatoryDocumentId, documentId))
          .all();

        const [matchedCount] = db
          .select({ count: count() })
          .from(requirements)
          .where(
            and(
              eq(requirements.regulatoryDocumentId, documentId),
              eq(requirements.complianceStatus, "met")
            )
          )
          .all();

        return {
          status: regDoc.status,
          statusMessage: regDoc.statusMessage,
          requirementsFound: reqCount.count,
          requirementsMatched: matchedCount.count,
        };
      }

      // Check policy documents
      const polDoc = db
        .select({
          id: policyDocuments.id,
          status: policyDocuments.status,
          statusMessage: policyDocuments.statusMessage,
        })
        .from(policyDocuments)
        .where(eq(policyDocuments.id, documentId))
        .get();

      if (polDoc) {
        return {
          status: polDoc.status,
          statusMessage: polDoc.statusMessage,
        };
      }

      return { error: `Document not found: ${documentId}` };
    } catch (err) {
      return { error: `Failed to get ingestion status: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: openai("gpt-5.4-mini"),
    system: `You are a healthcare compliance expert assistant. You help users explore regulatory requirements, organizational policies, and compliance gaps.

You have access to a pre-built compliance knowledge base containing:
- Regulatory documents with extracted requirements
- Organizational policy documents indexed for semantic search
- Evidence linking requirements to policy excerpts

Use your tools to answer questions accurately. Always cite specific policies, page numbers, and excerpts when providing evidence. When asked about compliance status, use getComplianceSummary first, then drill into specifics with queryRequirements if needed.`,
    messages: await convertToModelMessages(messages),
    tools: {
      queryRequirements,
      queryPolicies,
      semanticSearch: semanticSearchTool,
      getRequirementDetail,
      getComplianceSummary,
      startIngestion,
      getIngestionStatus,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
