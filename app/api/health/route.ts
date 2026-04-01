import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { policyDocuments, regulatoryDocuments } from "@/lib/db/schema";

export async function GET() {
  try {
    const [policies] = db
      .select({ count: count() })
      .from(policyDocuments)
      .all();

    const [regulatory] = db
      .select({ count: count() })
      .from(regulatoryDocuments)
      .all();

    return Response.json({
      status: "ok",
      policiesIndexed: policies.count > 0,
      policiesCount: policies.count,
      regulatoryCount: regulatory.count,
    });
  } catch {
    return Response.json(
      { status: "degraded", error: "Database unavailable", policiesIndexed: false },
      { status: 503 },
    );
  }
}
