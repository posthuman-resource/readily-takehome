"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RequirementWithEvidence } from "@/lib/db/queries";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "met", label: "Met" },
  { value: "partial", label: "Partial" },
  { value: "not_met", label: "Not Met" },
  { value: "unclear", label: "Unclear" },
] as const;

function statusBadge(status: string | null) {
  switch (status) {
    case "met":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 border-emerald-200"
        >
          Met
        </Badge>
      );
    case "partial":
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 border-amber-200"
        >
          Partial
        </Badge>
      );
    case "not_met":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200"
        >
          Not Met
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="bg-gray-50 text-gray-600 border-gray-200"
        >
          Unclear
        </Badge>
      );
  }
}

export function RequirementsList({
  documentId,
  requirements,
  currentStatus,
  currentSearch,
}: {
  documentId: string;
  requirements: RequirementWithEvidence[];
  currentStatus?: string;
  currentSearch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(currentSearch ?? "");

  const updateFilters = useCallback(
    (status?: string, search?: string) => {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (search) params.set("q", search);
      const qs = params.toString();
      startTransition(() => {
        router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      });
    },
    [router, pathname]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filter controls */}
      <div className="px-6 py-3 border-b flex items-center gap-3 shrink-0 flex-wrap">
        {/* Status filter buttons */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilters(opt.value, searchValue || undefined)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                (currentStatus ?? "all") === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search requirements..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateFilters(currentStatus, searchValue || undefined);
              }
            }}
            className="pl-8 h-7 text-xs"
          />
        </div>

        {isPending && (
          <span className="text-xs text-muted-foreground">Loading...</span>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {requirements.length} requirement{requirements.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Requirements accordion list */}
      <ScrollArea className="flex-1 overflow-auto">
        <div className="px-6 py-2">
          {requirements.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No requirements match the current filters.
            </div>
          ) : (
            <Accordion>
              {requirements.map((req) => (
                <AccordionItem key={req.id} value={req.id}>
                  <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {req.requirementNumber && (
                        <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                          {req.requirementNumber}
                        </Badge>
                      )}
                      <span className="text-sm text-left truncate flex-1 min-w-0">
                        {req.text.length > 120
                          ? req.text.slice(0, 120) + "..."
                          : req.text}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {req.evidence.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {req.evidence.length} evidence
                          </span>
                        )}
                        {statusBadge(req.complianceStatus)}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pb-4 space-y-4">
                      {/* Full requirement text */}
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-sm">{req.text}</p>
                        {req.reference && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Reference: {req.reference}
                          </p>
                        )}
                        {req.category && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Category: {req.category}
                          </p>
                        )}
                      </div>

                      {/* Evidence */}
                      {req.evidence.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No evidence found for this requirement.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Evidence ({req.evidence.length})
                          </h4>
                          {req.evidence.map((ev) => (
                            <div
                              key={ev.id}
                              className="rounded-lg border p-3 space-y-2"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">
                                  {ev.policyFilename}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {ev.policyCategory}
                                </Badge>
                                {ev.pageNumber != null && (
                                  <span className="text-xs text-muted-foreground">
                                    p. {ev.pageNumber}
                                  </span>
                                )}
                                <div className="ml-auto">
                                  {statusBadge(ev.status)}
                                </div>
                              </div>

                              {ev.excerpt && (
                                <blockquote className="border-l-2 border-muted-foreground/20 pl-3 text-sm text-muted-foreground italic">
                                  {ev.excerpt}
                                </blockquote>
                              )}

                              {ev.reasoning && (
                                <div className="text-sm">
                                  <span className="font-medium">Reasoning: </span>
                                  {ev.reasoning}
                                </div>
                              )}

                              {ev.confidence != null && (
                                <div className="text-xs text-muted-foreground">
                                  Confidence: {Math.round(ev.confidence * 100)}%
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
