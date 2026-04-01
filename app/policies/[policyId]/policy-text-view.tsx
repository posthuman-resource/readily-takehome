"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function PolicyTextView({
  chunks,
  policyFilename,
}: {
  chunks: { pageNumber: number | null; text: string }[];
  policyFilename: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (chunks.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Full Text
        </h2>
        <p className="text-sm text-muted-foreground">
          No extracted text available for this policy.
        </p>
      </section>
    );
  }

  // Group chunks by page
  const pageMap = new Map<number | null, string[]>();
  for (const chunk of chunks) {
    const list = pageMap.get(chunk.pageNumber) ?? [];
    list.push(chunk.text);
    pageMap.set(chunk.pageNumber, list);
  }

  const pages = Array.from(pageMap.entries()).sort((a, b) => {
    if (a[0] === null) return 1;
    if (b[0] === null) return -1;
    return a[0] - b[0];
  });

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        Full Text ({policyFilename})
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4">
          {pages.map(([pageNum, texts]) => (
            <div key={pageNum ?? "null"} className="rounded-lg bg-muted/50 p-4">
              {pageNum != null && (
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Page {pageNum}
                </div>
              )}
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {texts.join("\n\n")}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
