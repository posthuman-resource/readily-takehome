"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, FileText } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Compliance", icon: ShieldCheck, match: (p: string) => p === "/" || /^\/[0-9a-f-]{36}/.test(p) },
  { href: "/policies", label: "Policies", icon: FileText, match: (p: string) => p.startsWith("/policies") },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background shrink-0">
      <div className="flex items-center h-11 px-4 gap-6">
        <Link href="/" className="font-semibold text-sm mr-2">
          Readily
        </Link>
        <div className="flex gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
