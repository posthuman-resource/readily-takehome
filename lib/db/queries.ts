import { db } from ".";
import {
  regulatoryDocuments,
  requirements,
  evidence,
  policyChunks,
  policyDocuments,
} from "./schema";
import { eq, sql, count, and, like, inArray } from "drizzle-orm";

export type DocumentWithStats = {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  status: string;
  statusMessage: string | null;
  createdAt: string;
  total: number;
  met: number;
  partial: number;
  notMet: number;
  unclear: number;
};

export function getDocumentsWithStats(): DocumentWithStats[] {
  let docs;
  try {
    docs = db
      .select()
      .from(regulatoryDocuments)
      .orderBy(regulatoryDocuments.createdAt)
      .all();
  } catch {
    return [];
  }

  const stats = db
    .select({
      documentId: requirements.regulatoryDocumentId,
      total: count(),
      met: count(sql`CASE WHEN ${requirements.complianceStatus} = 'met' THEN 1 END`),
      partial: count(
        sql`CASE WHEN ${requirements.complianceStatus} = 'partial' THEN 1 END`
      ),
      notMet: count(
        sql`CASE WHEN ${requirements.complianceStatus} = 'not_met' THEN 1 END`
      ),
      unclear: count(
        sql`CASE WHEN ${requirements.complianceStatus} = 'unclear' THEN 1 END`
      ),
    })
    .from(requirements)
    .groupBy(requirements.regulatoryDocumentId)
    .all();

  const statsMap = new Map(stats.map((s) => [s.documentId, s]));

  return docs.map((doc) => {
    const s = statsMap.get(doc.id);
    return {
      id: doc.id,
      filename: doc.filename,
      title: doc.title,
      description: doc.description,
      status: doc.status,
      statusMessage: doc.statusMessage,
      createdAt: doc.createdAt,
      total: s?.total ?? 0,
      met: s?.met ?? 0,
      partial: s?.partial ?? 0,
      notMet: s?.notMet ?? 0,
      unclear: s?.unclear ?? 0,
    };
  });
}

export type RequirementWithEvidence = {
  id: string;
  requirementNumber: string | null;
  text: string;
  reference: string | null;
  category: string | null;
  complianceStatus: string | null;
  evidence: {
    id: string;
    status: string;
    excerpt: string | null;
    reasoning: string | null;
    confidence: number | null;
    policyFilename: string;
    policyCategory: string;
    pageNumber: number | null;
  }[];
};

export function getRequirementsForDocument(
  documentId: string,
  statusFilter?: string,
  searchQuery?: string
): RequirementWithEvidence[] {
  let conditions = [eq(requirements.regulatoryDocumentId, documentId)];

  if (statusFilter && statusFilter !== "all") {
    conditions.push(eq(requirements.complianceStatus, statusFilter));
  }

  if (searchQuery) {
    conditions.push(like(requirements.text, `%${searchQuery}%`));
  }

  const reqs = db
    .select()
    .from(requirements)
    .where(and(...conditions))
    .orderBy(requirements.requirementNumber)
    .all();

  if (reqs.length === 0) return [];

  const reqIds = reqs.map((r) => r.id);

  const evidenceRows = db
    .select({
      id: evidence.id,
      requirementId: evidence.requirementId,
      status: evidence.status,
      excerpt: evidence.excerpt,
      reasoning: evidence.reasoning,
      confidence: evidence.confidence,
      policyChunkId: evidence.policyChunkId,
    })
    .from(evidence)
    .where(inArray(evidence.requirementId, reqIds))
    .all();

  const chunkIds = [...new Set(evidenceRows.map((e) => e.policyChunkId))];
  const chunks =
    chunkIds.length > 0
      ? db
          .select({
            id: policyChunks.id,
            pageNumber: policyChunks.pageNumber,
            policyDocumentId: policyChunks.policyDocumentId,
          })
          .from(policyChunks)
          .where(inArray(policyChunks.id, chunkIds))
          .all()
      : [];

  const policyDocIds = [...new Set(chunks.map((c) => c.policyDocumentId))];
  const policies =
    policyDocIds.length > 0
      ? db
          .select({
            id: policyDocuments.id,
            filename: policyDocuments.filename,
            category: policyDocuments.category,
          })
          .from(policyDocuments)
          .where(inArray(policyDocuments.id, policyDocIds))
          .all()
      : [];

  const chunkMap = new Map(chunks.map((c) => [c.id, c]));
  const policyMap = new Map(policies.map((p) => [p.id, p]));

  const evidenceByReq = new Map<string, typeof evidenceRows>();
  for (const ev of evidenceRows) {
    const list = evidenceByReq.get(ev.requirementId) ?? [];
    list.push(ev);
    evidenceByReq.set(ev.requirementId, list);
  }

  return reqs.map((req) => {
    const evList = evidenceByReq.get(req.id) ?? [];
    return {
      id: req.id,
      requirementNumber: req.requirementNumber,
      text: req.text,
      reference: req.reference,
      category: req.category,
      complianceStatus: req.complianceStatus,
      evidence: evList.map((ev) => {
        const chunk = chunkMap.get(ev.policyChunkId);
        const policy = chunk ? policyMap.get(chunk.policyDocumentId) : undefined;
        return {
          id: ev.id,
          status: ev.status,
          excerpt: ev.excerpt,
          reasoning: ev.reasoning,
          confidence: ev.confidence,
          policyFilename: policy?.filename ?? "Unknown",
          policyCategory: policy?.category ?? "Unknown",
          pageNumber: chunk?.pageNumber ?? null,
        };
      }),
    };
  });
}

export function getDocumentById(id: string) {
  return db
    .select()
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, id))
    .get();
}
