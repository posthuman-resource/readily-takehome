"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition, useCallback } from "react";
import { Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PolicyWithRequirementCount } from "@/lib/db/queries";

export function PolicyList({
  policies,
  categoryCounts,
  totalPolicies,
  currentCategory,
  currentSearch,
}: {
  policies: PolicyWithRequirementCount[];
  categoryCounts: { category: string; count: number }[];
  totalPolicies: number;
  currentCategory?: string;
  currentSearch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(currentSearch ?? "");

  const updateFilters = useCallback(
    (category?: string, search?: string) => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
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
      {/* Category tabs + search */}
      <div className="px-6 py-3 border-b shrink-0 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Category filter buttons */}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => updateFilters(undefined, searchValue || undefined)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                !currentCategory
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              All ({totalPolicies})
            </button>
            {categoryCounts.map((cat) => (
              <button
                key={cat.category}
                onClick={() =>
                  updateFilters(
                    currentCategory === cat.category ? undefined : cat.category,
                    searchValue || undefined
                  )
                }
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  currentCategory === cat.category
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>

          {isPending && (
            <span className="text-xs text-muted-foreground">Loading...</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by filename..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateFilters(currentCategory, searchValue || undefined);
                }
              }}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {policies.length} {policies.length === 1 ? "policy" : "policies"}
          </span>
        </div>
      </div>

      {/* Policy table */}
      <ScrollArea className="flex-1 overflow-auto">
        <div className="px-6 py-2">
          {policies.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No policies match the current filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Filename</th>
                  <th className="py-2 pr-4 font-medium w-24">Category</th>
                  <th className="py-2 pr-4 font-medium w-20 text-right">Pages</th>
                  <th className="py-2 font-medium w-40 text-right">
                    Requirements Satisfied
                  </th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr
                    key={policy.id}
                    className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/policies/${policy.id}`}
                        className="text-sm font-medium hover:underline text-foreground"
                      >
                        {policy.filename}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="secondary" className="text-[10px]">
                        {policy.category}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-muted-foreground tabular-nums">
                      {policy.pageCount ?? "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {policy.requirementsSatisfied > 0 ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          {policy.requirementsSatisfied}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
