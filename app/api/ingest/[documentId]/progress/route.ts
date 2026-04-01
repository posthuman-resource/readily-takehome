import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { regulatoryDocuments, policyDocuments } from "@/lib/db/schema";

function getDocumentStatus(documentId: string) {
  // Check both tables
  const regulatory = db
    .select({
      status: regulatoryDocuments.status,
      statusMessage: regulatoryDocuments.statusMessage,
    })
    .from(regulatoryDocuments)
    .where(eq(regulatoryDocuments.id, documentId))
    .get();

  if (regulatory) return regulatory;

  return db
    .select({
      status: policyDocuments.status,
      statusMessage: policyDocuments.statusMessage,
    })
    .from(policyDocuments)
    .where(eq(policyDocuments.id, documentId))
    .get();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastStatus = "";

      const interval = setInterval(() => {
        try {
          const doc = getDocumentStatus(documentId);
          if (!doc) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Document not found" })}\n\n`
              )
            );
            clearInterval(interval);
            controller.close();
            return;
          }

          const statusStr = JSON.stringify({
            status: doc.status,
            statusMessage: doc.statusMessage,
          });

          if (statusStr !== lastStatus) {
            lastStatus = statusStr;
            controller.enqueue(encoder.encode(`data: ${statusStr}\n\n`));
          } else {
            // Send heartbeat to keep connection alive
            controller.enqueue(encoder.encode(":\n\n"));
          }

          if (doc.status === "complete" || doc.status === "error") {
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      }, 1000);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
