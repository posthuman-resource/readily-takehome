import { notFound } from "next/navigation";
import {
  getDocumentById,
  getRequirementsForDocument,
} from "@/lib/db/queries";
import { ComplianceSummaryBar } from "./compliance-summary-bar";
import { RequirementsList } from "./requirements-list";

export const dynamic = "force-dynamic";

export default async function DocumentPage(
  props: PageProps<"/[documentId]">
) {
  const { documentId } = await props.params;
  const searchParams = await props.searchParams;

  const document = getDocumentById(documentId);
  if (!document) notFound();

  const statusFilter =
    typeof searchParams.status === "string" ? searchParams.status : undefined;
  const searchQuery =
    typeof searchParams.q === "string" ? searchParams.q : undefined;

  const requirements = getRequirementsForDocument(
    documentId,
    statusFilter,
    searchQuery
  );

  // Compute stats from unfiltered data for summary bar
  const allRequirements = getRequirementsForDocument(documentId);
  const stats = {
    total: allRequirements.length,
    met: allRequirements.filter((r) => r.complianceStatus === "met").length,
    partial: allRequirements.filter((r) => r.complianceStatus === "partial")
      .length,
    notMet: allRequirements.filter((r) => r.complianceStatus === "not_met")
      .length,
    unclear: allRequirements.filter((r) => r.complianceStatus === "unclear")
      .length,
  };

  return (
    <div className="h-[calc(100vh-2.75rem)] flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold">
          {document.title || document.filename}
        </h1>
        {document.description && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {document.description}
          </p>
        )}
      </header>

      {/* Summary Bar */}
      <ComplianceSummaryBar stats={stats} />

      {/* Filters + Requirements List */}
      <RequirementsList
        documentId={documentId}
        requirements={requirements}
        currentStatus={statusFilter}
        currentSearch={searchQuery}
      />
    </div>
  );
}
