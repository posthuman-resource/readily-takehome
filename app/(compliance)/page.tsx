import Link from "next/link";
import { getDocumentsWithStats } from "@/lib/db/queries";
import { FileText, ArrowRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function compliancePercent(doc: {
  total: number;
  met: number;
  partial: number;
}): number {
  if (doc.total === 0) return 0;
  return Math.round(((doc.met + doc.partial * 0.5) / doc.total) * 100);
}

export default function ComplianceHome() {
  const documents = getDocumentsWithStats();

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <FileText className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Regulatory Documents</h2>
        <p className="text-muted-foreground max-w-md">
          Upload a regulatory document to begin auditing your organizational
          policies against compliance requirements.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2.75rem)] flex flex-col">
      <header className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold">Regulatory Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select a regulatory document to browse its requirements and compliance
          evidence
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4 max-w-3xl">
          {documents.map((doc) => {
            const pct = compliancePercent(doc);
            const isComplete = doc.status === "complete";
            const isError = doc.status === "error";

            return (
              <Link
                key={doc.id}
                href={`/${doc.id}`}
                className="group block rounded-xl border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 rounded-lg bg-primary/10 p-2 shrink-0">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-medium truncate">
                        {doc.title || doc.filename}
                      </h2>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {doc.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {doc.total > 0 && (
                  <div className="mt-4 ml-11">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm text-muted-foreground">
                        {doc.total} requirements
                      </span>
                      <div className="flex gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-xs px-2 h-5 bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          {doc.met} met
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs px-2 h-5 bg-amber-50 text-amber-700 border-amber-200"
                        >
                          {doc.partial} partial
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs px-2 h-5 bg-red-50 text-red-700 border-red-200"
                        >
                          {doc.notMet} not met
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </div>
                )}

                {doc.total === 0 && (
                  <div className="mt-3 ml-11">
                    {isError ? (
                      <span className="text-xs text-red-600">
                        Error: {doc.statusMessage || "Processing failed"}
                      </span>
                    ) : isComplete ? (
                      <span className="text-xs text-muted-foreground">
                        No requirements found
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">
                        Processing...
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
