import { NextResponse } from "next/server";
import { getDocumentsWithStats } from "@/lib/db/queries";

export async function GET() {
  const documents = getDocumentsWithStats();
  return NextResponse.json(documents);
}
