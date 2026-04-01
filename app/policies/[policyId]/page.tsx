import Link from "next/link";
import path from "node:path";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getPolicyById,
  getRequirementsSatisfiedByPolicy,
  getPolicyChunkTexts,
} from "@/lib/db/queries";
import { PolicyTextView } from "./policy-text-view";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "met":
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
          Met
        </Badge>
      );
    case "partial":
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          Partial
        </Badge>
      );
    case "not_met":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          Not Met
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
          Unclear
        </Badge>
      );
  }
}

export default async function PolicyDetailPage(
  props: PageProps<"/policies/[policyId]">
) {
  const { policyId } = await props.params;

  const policy = getPolicyById(policyId);
  if (!policy) notFound();

  const satisfiedRequirements = getRequirementsSatisfiedByPolicy(policyId);
  const chunks = getPolicyChunkTexts(policyId);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 shrink-0">
        <Link
          href={`/policies${policy.category ? `?category=${policy.category}` : ""}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to policies
        </Link>
        <h1 className="text-lg font-semibold">{policy.title || path.basename(policy.filename)}</h1>
        <div className="flex items-center gap-3 mt-1">
          <Badge variant="secondary">{policy.category}</Badge>
          {policy.pageCount != null && (
            <span className="text-sm text-muted-foreground">
              {policy.pageCount} {policy.pageCount === 1 ? "page" : "pages"}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {satisfiedRequirements.length} requirement{satisfiedRequirements.length !== 1 ? "s" : ""} satisfied
          </span>
        </div>
      </header>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="px-6 py-4 space-y-6 max-w-4xl">
          {/* Requirements this policy satisfies */}
          {satisfiedRequirements.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Requirements Satisfied ({satisfiedRequirements.length})
              </h2>
              <div className="space-y-3">
                {satisfiedRequirements.map((req) => (
                  <div
                    key={`${req.id}-${req.evidenceStatus}`}
                    className="rounded-lg border p-4 space-y-2"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {req.requirementNumber && (
                            <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                              {req.requirementNumber}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            from {req.regulatoryDocumentTitle || req.regulatoryDocumentFilename}
                          </span>
                          <div className="ml-auto shrink-0">
                            {statusBadge(req.evidenceStatus)}
                          </div>
                        </div>
                        <p className="text-sm">{req.text}</p>
                      </div>
                    </div>

                    {req.evidenceExcerpt && (
                      <blockquote className="border-l-2 border-muted-foreground/20 pl-3 text-sm text-muted-foreground italic">
                        {req.evidenceExcerpt}
                      </blockquote>
                    )}

                    {req.evidenceReasoning && (
                      <div className="text-sm">
                        <span className="font-medium">Reasoning: </span>
                        {req.evidenceReasoning}
                      </div>
                    )}

                    {req.evidenceConfidence != null && (
                      <div className="text-xs text-muted-foreground">
                        Confidence: {Math.round(req.evidenceConfidence * 100)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Full text */}
          <PolicyTextView chunks={chunks} policyFilename={path.basename(policy.filename)} />
        </div>
      </ScrollArea>
    </div>
  );
}
