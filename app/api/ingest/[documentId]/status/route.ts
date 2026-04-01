import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { regulatoryDocuments, policyDocuments } from "@/lib/db/schema";

function getDocumentStatus(documentId: string) {
  const regulatory = db
    .select({
      id: regulatoryDocuments.id,
      status: regulatoryDocuments.status,
      statusMessage: regulatoryDocuments.statusMessage,
      type: regulatoryDocuments.id, // placeholder for type
    })
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, documentId))
    .get();

  if (regulatory) {
    return {
      id: regulatory.id,
      status: regulatory.status,
      statusMessage: regulatory.statusMessage,
      type: "regulatory" as const,
    };
  }

  const policy = db
    .select({
      id: policyDocuments.id,
      status: policyDocuments.status,
      statusMessage: policyDocuments.statusMessage,
    })
    .from(policyDocuments)
    .where(eq(policyDocuments.id, documentId))
    .get();

  if (policy) {
    return {
      id: policy.id,
      status: policy.status,
      statusMessage: policy.statusMessage,
      type: "policy" as const,
    };
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const doc = getDocumentStatus(documentId);

  if (!doc) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(doc);
}
