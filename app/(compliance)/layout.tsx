import Link from "next/link";
import { getDocumentsWithStats, type DocumentWithStats } from "@/lib/db/queries";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DocumentStatusPoller } from "./document-status-poller";

function compliancePercent(doc: DocumentWithStats): number {
  if (doc.total === 0) return 0;
  return Math.round(((doc.met + doc.partial * 0.5) / doc.total) * 100);
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "processing":
    case "extracting_text":
    case "extracting_requirements":
    case "matching_evidence":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function isProcessing(status: string): boolean {
  return !["completed", "error"].includes(status);
}

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const documents = getDocumentsWithStats();

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-80 shrink-0 border-r bg-sidebar flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b">
          <Link href="/" className="block">
            <h1 className="text-lg font-semibold text-sidebar-foreground">
              Compliance Auditor
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Regulatory Policy Browser
            </p>
          </Link>
        </div>

        <ScrollArea className="flex-1 overflow-auto">
          <nav className="p-2 space-y-1">
            {documents.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No regulatory documents yet.
                <br />
                Upload one to get started.
              </div>
            ) : (
              documents.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/${doc.id}`}
                  className="block rounded-lg px-3 py-2.5 hover:bg-sidebar-accent transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isProcessing(doc.status) ? (
                      <DocumentStatusPoller
                        documentId={doc.id}
                        initialStatus={doc.status}
                        initialMessage={doc.statusMessage}
                      />
                    ) : (
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusColor(doc.status)}`}
                      />
                    )}
                    <span className="text-sm font-medium text-sidebar-foreground truncate">
                      {doc.title || doc.filename}
                    </span>
                  </div>

                  {doc.total > 0 ? (
                    <div className="ml-4">
                      <div className="flex gap-1 mb-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 h-4 bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          {doc.met} met
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 h-4 bg-amber-50 text-amber-700 border-amber-200"
                        >
                          {doc.partial} partial
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 h-4 bg-red-50 text-red-700 border-red-200"
                        >
                          {doc.notMet} not met
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{
                              width: `${compliancePercent(doc)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {compliancePercent(doc)}%
                        </span>
                      </div>
                    </div>
                  ) : isProcessing(doc.status) ? (
                    <div className="ml-4 text-[10px] text-muted-foreground">
                      Processing...
                    </div>
                  ) : (
                    <div className="ml-4 text-[10px] text-muted-foreground">
                      No requirements found
                    </div>
                  )}
                </Link>
              ))
            )}
          </nav>
        </ScrollArea>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
