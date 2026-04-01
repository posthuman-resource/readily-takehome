"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DocumentStatusPoller({
  documentId,
  initialStatus,
  initialMessage,
}: {
  documentId: string;
  initialStatus: string;
  initialMessage: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(initialMessage);
  const router = useRouter();

  useEffect(() => {
    if (["completed", "error"].includes(status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ingest/${documentId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);
        setMessage(data.statusMessage ?? null);
        if (["completed", "error"].includes(data.status)) {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // ignore fetch errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [documentId, status, router]);

  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="text-xs">{message || status}</p>
      </TooltipContent>
    </Tooltip>
  );
}
