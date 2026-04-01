import { NextRequest, NextResponse } from "next/server";
import { getRequirementsForDocument } from "@/lib/db/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const requirements = getRequirementsForDocument(documentId, status, q);
  return NextResponse.json(requirements);
}
