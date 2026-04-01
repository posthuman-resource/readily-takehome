import { getDocumentsWithStats } from "@/lib/db/queries";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ComplianceHome() {
  const documents = getDocumentsWithStats();

  // If there are documents, redirect to the first one
  if (documents.length > 0) {
    redirect(`/${documents[0].id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen text-center px-4">
      <FileText className="h-16 w-16 text-muted-foreground/40 mb-4" />
      <h2 className="text-xl font-semibold mb-2">No Regulatory Documents</h2>
      <p className="text-muted-foreground max-w-md">
        Upload a regulatory document to begin auditing your organizational
        policies against compliance requirements.
      </p>
    </div>
  );
}
