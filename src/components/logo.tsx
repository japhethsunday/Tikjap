"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Tikjap AI logo"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
      <path
        d="M32 13c-10.5 0-19 7.1-19 15.9 0 5 2.9 9.5 7.4 12.4-.2 2.7-1.2 5.1-3.1 7-.5.5-.1 1.4.6 1.3 4.4-.5 8.1-2.3 10.7-4.7 1.1.2 2.2.3 3.4.3 10.5 0 19-7.1 19-16.1S42.5 13 32 13z"
        fill="#ffffff"
      />
      <path
        d="M35 20.5 23.5 33.4h6.8L27.5 44l11.8-13.6h-7L35 20.5z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

export function LogoLockup({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="text-sm font-semibold tracking-tight text-fg">
        Tikjap<span className="font-normal text-muted"> AI</span>
      </span>
    </span>
  );
}
