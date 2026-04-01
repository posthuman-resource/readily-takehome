import { Badge } from "@/components/ui/badge";

type Stats = {
  total: number;
  met: number;
  partial: number;
  notMet: number;
  unclear: number;
};

export function ComplianceSummaryBar({ stats }: { stats: Stats }) {
  const compliancePercent =
    stats.total > 0
      ? Math.round(((stats.met + stats.partial * 0.5) / stats.total) * 100)
      : 0;

  const segments = [
    { count: stats.met, color: "bg-emerald-500", label: "Met" },
    { count: stats.partial, color: "bg-amber-400", label: "Partial" },
    { count: stats.notMet, color: "bg-red-500", label: "Not Met" },
    { count: stats.unclear, color: "bg-gray-300", label: "Unclear" },
  ];

  return (
    <div className="border-b px-6 py-4 shrink-0">
      <div className="flex items-center gap-6 flex-wrap">
        {/* Total count */}
        <div>
          <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Requirements</div>
        </div>

        {/* Compliance percentage */}
        <div>
          <div className="text-2xl font-bold tabular-nums text-emerald-600">
            {compliancePercent}%
          </div>
          <div className="text-xs text-muted-foreground">Compliant</div>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            {stats.met} Met
          </Badge>
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200"
          >
            {stats.partial} Partial
          </Badge>
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200"
          >
            {stats.notMet} Not Met
          </Badge>
          <Badge
            variant="outline"
            className="bg-gray-50 text-gray-600 border-gray-200"
          >
            {stats.unclear} Unclear
          </Badge>
        </div>
      </div>

      {/* Stacked bar */}
      {stats.total > 0 && (
        <div className="mt-3 flex h-2.5 w-full rounded-full overflow-hidden bg-muted">
          {segments.map(
            (seg) =>
              seg.count > 0 && (
                <div
                  key={seg.label}
                  className={`${seg.color} transition-all`}
                  style={{ width: `${(seg.count / stats.total) * 100}%` }}
                  title={`${seg.label}: ${seg.count}`}
                />
              )
          )}
        </div>
      )}
    </div>
  );
}
