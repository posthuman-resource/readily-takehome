import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { REGULATORY_DIR, POLICIES_DIR } from "@/lib/config";
import { registerDocument, processDocument, DocumentType } from "@/lib/pipeline";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = (formData.get("type") as string) || "regulatory";
  const category = formData.get("category") as string | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (type !== "regulatory" && type !== "policy") {
    return Response.json(
      { error: 'Invalid type. Must be "regulatory" or "policy"' },
      { status: 400 }
    );
  }

  if (type === "policy" && !category) {
    return Response.json(
      { error: "Category is required for policy documents" },
      { status: 400 }
    );
  }

  // Determine destination directory and save file
  const destDir =
    type === "regulatory"
      ? REGULATORY_DIR
      : path.join(POLICIES_DIR, category || "uploads");
  mkdirSync(destDir, { recursive: true });

  const filePath = path.join(destDir, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(filePath, buffer);

  // Register document in DB
  const documentId = await registerDocument(
    filePath,
    type as DocumentType,
    category || undefined
  );

  // Start processing in background (don't await)
  processDocument(documentId, type as DocumentType).catch((err) => {
    console.error("Background processing error:", err);
  });

  return Response.json({ documentId, status: "pending" });
}
