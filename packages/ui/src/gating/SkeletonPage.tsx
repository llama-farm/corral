import React from "react";

export interface SkeletonPageProps {
  layout?: "dashboard" | "list" | "detail" | "settings" | "grid";
  rows?: number;
  showHeader?: boolean;
  showSidebar?: boolean;
  showTabs?: boolean;
  className?: string;
}

/* Tiny helpers */
const Bone = ({ className = "", style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} style={style} />
);

const BoneCircle = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-full bg-slate-200 dark:bg-slate-700 ${className}`} />
);

/* ── Sub-layouts ─────────────────────────────────────── */

function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <BoneCircle className="w-9 h-9" />
        <div className="space-y-2">
          <Bone className="h-4 w-36" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
      <Bone className="h-9 w-28 rounded-lg" />
    </div>
  );
}

function TabsSkeleton() {
  return (
    <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-700 pb-3">
      {[20, 16, 24, 14].map((w, i) => (
        <Bone key={i} className={`h-3`} style={{ width: `${w * 4}px` }} />
      ))}
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="w-48 shrink-0 space-y-3 pr-6 border-r border-slate-200 dark:border-slate-700">
      {Array.from({ length: 7 }).map((_, i) => (
        <Bone key={i} className="h-3" style={{ width: `${60 + Math.random() * 40}%` }} />
      ))}
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────── */

function DashboardLayout({ rows = 4 }: { rows: number }) {
  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-16" />
            <Bone className="h-2 w-24" />
          </div>
        ))}
      </div>
      {/* Chart area */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-6">
        <Bone className="h-4 w-32 mb-4" />
        <Bone className="h-48 w-full rounded-lg" />
      </div>
      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex gap-8">
          {[16, 24, 20, 12].map((w, i) => (
            <Bone key={i} className="h-3" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-8 border-b border-slate-100 dark:border-slate-800 last:border-0">
            {[16, 24, 20, 12].map((w, j) => (
              <Bone key={j} className="h-3" style={{ width: `${w * 4}px`, opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── List ─────────────────────────────────────────────── */

function ListLayout({ rows = 6 }: { rows: number }) {
  return (
    <>
      {/* Search bar */}
      <Bone className="h-10 w-full rounded-lg mb-5" />
      {/* List items */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700"
            style={{ opacity: 1 - i * 0.08 }}
          >
            <BoneCircle className="w-10 h-10 shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-3.5 w-48" />
              <Bone className="h-3 w-72" />
            </div>
            <Bone className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Detail ───────────────────────────────────────────── */

function DetailLayout({ rows = 3 }: { rows: number }) {
  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <Bone className="h-3 w-12" />
        <Bone className="h-3 w-3" />
        <Bone className="h-3 w-20" />
        <Bone className="h-3 w-3" />
        <Bone className="h-3 w-16" />
      </div>
      {/* Title + meta */}
      <Bone className="h-7 w-64 mb-2" />
      <Bone className="h-3 w-48 mb-6" />
      {/* Content blocks */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mb-6 space-y-2">
          <Bone className="h-4 w-40 mb-3" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-3/4" />
        </div>
      ))}
    </>
  );
}

/* ── Settings ─────────────────────────────────────────── */

function SettingsLayout({ rows = 5 }: { rows: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Bone className="h-3 w-28" />
          <Bone className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <Bone className="h-10 w-32 rounded-lg" />
    </div>
  );
}

/* ── Grid ─────────────────────────────────────────────── */

function GridLayout({ rows = 6 }: { rows: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
          style={{ opacity: 1 - i * 0.06 }}
        >
          <Bone className="h-36 w-full" />
          <div className="p-4 space-y-2">
            <Bone className="h-3.5 w-3/4" />
            <Bone className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────── */

const layoutComponents = {
  dashboard: DashboardLayout,
  list: ListLayout,
  detail: DetailLayout,
  settings: SettingsLayout,
  grid: GridLayout,
} as const;

export function SkeletonPage({
  layout = "dashboard",
  rows,
  showHeader = true,
  showSidebar = false,
  showTabs = false,
  className = "",
}: SkeletonPageProps) {
  const Layout = layoutComponents[layout];
  const defaultRows = { dashboard: 4, list: 6, detail: 3, settings: 5, grid: 6 };
  const r = rows ?? defaultRows[layout];

  return (
    <div className={`p-6 ${className}`}>
      {showHeader && <HeaderSkeleton />}
      {showTabs && <TabsSkeleton />}
      <div className={`flex gap-0 ${showSidebar ? "" : ""}`}>
        {showSidebar && <SidebarSkeleton />}
        <div className={showSidebar ? "flex-1 pl-6" : "flex-1"}>
          <Layout rows={r} />
        </div>
      </div>
    </div>
  );
}
