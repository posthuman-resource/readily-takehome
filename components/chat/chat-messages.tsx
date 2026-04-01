"use client";

import type { UIMessage } from "ai";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef } from "react";
import {
  Loader2,
  Search,
  ClipboardList,
  BarChart3,
  FileText,
  Info,
  AlertCircle,
} from "lucide-react";

function ToolCallCard({
  toolName,
  state,
  output,
}: {
  toolName: string;
  state: string;
  output: unknown;
}) {
  const isLoading =
    state === "input-streaming" || state === "input-available" || state === "partial-call";

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{formatToolName(toolName)}...</span>
      </div>
    );
  }

  if (state === "output-error") {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive py-1.5 px-3 bg-destructive/10 rounded-md">
        <AlertCircle className="h-3 w-3" />
        <span>{formatToolName(toolName)} failed</span>
      </div>
    );
  }

  const data = output as Record<string, unknown> | undefined;
  if (!data) return null;

  switch (toolName) {
    case "queryRequirements":
      return <RequirementsCard data={data} />;
    case "semanticSearch":
      return <SemanticSearchCard data={data} />;
    case "getComplianceSummary":
      return <ComplianceSummaryCard data={data} />;
    case "getIngestionStatus":
      return <IngestionStatusCard data={data} />;
    case "queryPolicies":
      return <PoliciesCard data={data} />;
    case "getRequirementDetail":
      return <RequirementDetailCard data={data} />;
    default:
      return (
        <div className="text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md">
          <span className="font-medium">{formatToolName(toolName)}</span>{" "}
          completed
        </div>
      );
  }
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "met":
      return "default";
    case "partial":
      return "secondary";
    case "not_met":
      return "destructive";
    default:
      return "outline";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "met":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
    case "partial":
      return "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100";
    case "not_met":
      return "bg-red-100 text-red-800 border-red-200 hover:bg-red-100";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100";
  }
}

function RequirementsCard({ data }: { data: Record<string, unknown> }) {
  const results = (data.results as Array<Record<string, unknown>>) || [];
  if (results.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md flex items-center gap-2">
        <ClipboardList className="h-3 w-3" />
        {(data.message as string) || "No requirements found"}
      </div>
    );
  }
  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="bg-muted/50 px-3 py-1.5 font-medium flex items-center gap-1.5 border-b">
        <ClipboardList className="h-3 w-3" />
        Requirements ({results.length})
      </div>
      <div className="max-h-48 overflow-auto divide-y">
        {results.slice(0, 10).map((r, i) => (
          <div key={i} className="px-3 py-1.5 flex items-start gap-2">
            <Badge
              variant={statusBadgeVariant(r.complianceStatus as string)}
              className={`text-[10px] shrink-0 ${statusBadgeClass(r.complianceStatus as string)}`}
            >
              {(r.complianceStatus as string) || "unknown"}
            </Badge>
            <span className="line-clamp-2">
              {r.requirementNumber ? `${r.requirementNumber}. ` : ""}
              {r.text as string}
            </span>
          </div>
        ))}
        {results.length > 10 && (
          <div className="px-3 py-1.5 text-muted-foreground">
            ...and {results.length - 10} more
          </div>
        )}
      </div>
    </div>
  );
}

function SemanticSearchCard({ data }: { data: Record<string, unknown> }) {
  const results = (data.results as Array<Record<string, unknown>>) || [];
  if (results.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md flex items-center gap-2">
        <Search className="h-3 w-3" />
        {(data.message as string) || "No matching content found"}
      </div>
    );
  }
  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="bg-muted/50 px-3 py-1.5 font-medium flex items-center gap-1.5 border-b">
        <Search className="h-3 w-3" />
        Policy Matches ({results.length})
      </div>
      <div className="max-h-56 overflow-auto divide-y">
        {results.slice(0, 8).map((r, i) => (
          <div key={i} className="px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">
                {r.policyFilename as string}
              </span>
              {r.pageNumber != null && (
                <span className="text-muted-foreground">
                  p.{r.pageNumber as number}
                </span>
              )}
              {r.similarity != null && (
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {Math.round((r.similarity as number) * 100)}%
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground line-clamp-2">
              {r.excerpt as string}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComplianceSummaryCard({ data }: { data: Record<string, unknown> }) {
  const total = (data.total as number) || 0;
  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md flex items-center gap-2">
        <BarChart3 className="h-3 w-3" />
        {(data.message as string) || "No compliance data available"}
      </div>
    );
  }
  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="bg-muted/50 px-3 py-1.5 font-medium flex items-center gap-1.5 border-b">
        <BarChart3 className="h-3 w-3" />
        Compliance Summary
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
            {(data.met as number) > 0 && (
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${((data.met as number) / total) * 100}%`,
                }}
              />
            )}
            {(data.partial as number) > 0 && (
              <div
                className="h-full bg-amber-500"
                style={{
                  width: `${((data.partial as number) / total) * 100}%`,
                }}
              />
            )}
            {(data.not_met as number) > 0 && (
              <div
                className="h-full bg-red-500"
                style={{
                  width: `${((data.not_met as number) / total) * 100}%`,
                }}
              />
            )}
          </div>
          <span className="font-medium tabular-nums">
            {data.percentCompliant as number}%
          </span>
        </div>
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Met: {data.met as number}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Partial: {data.partial as number}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Not met: {data.not_met as number}
          </span>
          {(data.unclear as number) > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Unclear: {data.unclear as number}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function IngestionStatusCard({ data }: { data: Record<string, unknown> }) {
  const status = data.status as string;
  const isActive =
    status &&
    !["complete", "error"].includes(status);

  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="bg-muted/50 px-3 py-1.5 font-medium flex items-center gap-1.5 border-b">
        {isActive ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Info className="h-3 w-3" />
        )}
        Ingestion Status
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="outline" className="text-[10px]">
            {status || "unknown"}
          </Badge>
        </div>
        {(data.statusMessage as string) ? (
          <div className="text-muted-foreground">
            {data.statusMessage as string}
          </div>
        ) : null}
        {data.requirementsFound != null && (
          <div>
            Requirements: {data.requirementsFound as number} found,{" "}
            {data.requirementsMatched as number} matched
          </div>
        )}
      </div>
    </div>
  );
}

function PoliciesCard({ data }: { data: Record<string, unknown> }) {
  const results = (data.results as Array<Record<string, unknown>>) || [];
  if (results.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md flex items-center gap-2">
        <FileText className="h-3 w-3" />
        {(data.message as string) || "No policies found"}
      </div>
    );
  }
  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="bg-muted/50 px-3 py-1.5 font-medium flex items-center gap-1.5 border-b">
        <FileText className="h-3 w-3" />
        Policies ({results.length})
      </div>
      <div className="max-h-48 overflow-auto divide-y">
        {results.slice(0, 10).map((r, i) => (
          <div key={i} className="px-3 py-1.5 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] shrink-0">
              {r.category as string}
            </Badge>
            <span className="truncate">{(r.title || r.filename) as string}</span>
            {r.pageCount != null && (
              <span className="text-muted-foreground ml-auto shrink-0">
                {r.pageCount as number}p
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RequirementDetailCard({ data }: { data: Record<string, unknown> }) {
  const req = data.requirement as Record<string, unknown> | undefined;
  const evidenceList =
    (data.evidence as Array<Record<string, unknown>>) || [];
  if (!req) return null;
  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="bg-muted/50 px-3 py-1.5 font-medium flex items-center gap-1.5 border-b">
        <ClipboardList className="h-3 w-3" />
        Requirement Detail
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Badge
            variant={statusBadgeVariant(req.complianceStatus as string)}
            className={`text-[10px] shrink-0 ${statusBadgeClass(req.complianceStatus as string)}`}
          >
            {req.complianceStatus as string}
          </Badge>
          <span>{req.text as string}</span>
        </div>
        {evidenceList.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t">
            <span className="font-medium">Evidence ({evidenceList.length}):</span>
            {evidenceList.slice(0, 5).map((ev, i) => (
              <div key={i} className="pl-2 border-l-2 border-muted">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">
                    {ev.policyFilename as string}
                  </span>
                  {ev.pageNumber != null && (
                    <span className="text-muted-foreground">
                      p.{ev.pageNumber as number}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground line-clamp-2 mt-0.5">
                  {ev.excerpt as string}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatMessages({
  messages,
  isLoading,
}: {
  messages: UIMessage[];
  isLoading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center text-muted-foreground text-sm space-y-2 max-w-xs">
          <p className="font-medium text-foreground">
            Compliance Assistant
          </p>
          <p>
            Ask about compliance gaps, search policies, or upload regulatory
            documents.
          </p>
          <div className="text-xs space-y-1 pt-2">
            <p className="text-muted-foreground/70">Try asking:</p>
            <p>&quot;What are our compliance gaps?&quot;</p>
            <p>&quot;Find policies about hospice&quot;</p>
            <p>&quot;Show me a compliance summary&quot;</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] space-y-2 ${
              message.role === "user"
                ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2 text-sm"
                : ""
            }`}
          >
            {message.parts.map((part, i) => {
              if (part.type === "text" && part.text) {
                if (message.role === "user") {
                  return <span key={i}>{part.text}</span>;
                }
                return (
                  <div
                    key={i}
                    className="prose prose-sm prose-neutral max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:bg-muted [&_pre]:text-foreground [&_code]:text-xs"
                  >
                    <ReactMarkdown>{part.text}</ReactMarkdown>
                  </div>
                );
              }
              // v6 typed tool parts: type is "tool-<toolName>"
              if (part.type.startsWith("tool-")) {
                const toolName = part.type.slice(5); // strip "tool-" prefix
                const toolPart = part as { state: string; output?: unknown };
                return (
                  <ToolCallCard
                    key={i}
                    toolName={toolName}
                    state={toolPart.state}
                    output={
                      toolPart.state === "output-available"
                        ? toolPart.output
                        : undefined
                    }
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      ))}
      {isLoading &&
        messages.length > 0 &&
        messages[messages.length - 1].role === "user" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-md">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </div>
          </div>
        )}
      <div ref={bottomRef} />
    </div>
  );
}
