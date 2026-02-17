import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard, Users, CreditCard, BarChart3, ChevronRight, Search,
  Ban, ArrowUpDown, Eye, UserCog, Loader2, TrendingUp, Activity,
  ChevronLeft, Shield, ShieldAlert, ShieldCheck, Clock, UserX, UserCheck,
  Zap, LineChart, CreditCard as CreditCardIcon,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdminConfig {
  serverUrl: string; // e.g. "/api/auth"
  token?: string;
}

interface BetterAuthUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  role: string;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
}

export interface AdminDashboardProps {
  className?: string;
  config: AdminConfig;
}

// ── Admin API helper ───────────────────────────────────────────────────────

function useAdminFetch(config: AdminConfig) {
  return useCallback(async (path: string, options?: RequestInit) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.token) headers["Authorization"] = `Bearer ${config.token}`;
    const res = await fetch(`${config.serverUrl}${path}`, {
      credentials: "include",
      headers,
      ...options,
    });
    if (!res.ok) throw new Error(`Admin API ${res.status}: ${res.statusText}`);
    return res.json();
  }, [config.serverUrl, config.token]);
}

// ── Shared hook: fetch all users ───────────────────────────────────────────

function useUsers(config: AdminConfig) {
  const fetchApi = useAdminFetch(config);
  const [users, setUsers] = useState<BetterAuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi("/admin/list-users");
      setUsers(data.users || []);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    }
    setLoading(false);
  }, [fetchApi]);

  useEffect(() => { reload(); }, [reload]);

  return { users, loading, error, reload, fetchApi };
}

// ── Component ──────────────────────────────────────────────────────────────

type Section = "overview" | "users" | "subscriptions" | "analytics";

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "users", label: "Personnel", icon: <Users className="h-4 w-4" /> },
  { id: "subscriptions", label: "Subscriptions", icon: <CreditCard className="h-4 w-4" /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
];

export function AdminDashboard({ className = "", config }: AdminDashboardProps) {
  const [section, setSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { users, loading, error, reload, fetchApi } = useUsers(config);

  return (
    <div className={`flex h-full min-h-screen bg-slate-900 ${className}`}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-14"} shrink-0 border-r border-slate-700 bg-slate-950 transition-all`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-bold text-slate-100 tracking-wide">HORIZON ADMIN</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-slate-200">
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        <nav className="p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => setSection(item.id)}
              className={`flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors ${
                section === item.id
                  ? "bg-indigo-950 text-indigo-300 border border-indigo-800"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {item.icon}
              {sidebarOpen && item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        {loading ? (
          <LoadingGrid />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            {section === "overview" && <OverviewSection users={users} />}
            {section === "users" && <UsersSection users={users} fetchApi={fetchApi} reload={reload} />}
            {section === "subscriptions" && <SubscriptionsPlaceholder />}
            {section === "analytics" && <AnalyticsPlaceholder />}
          </>
        )}
      </main>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────────────────

function OverviewSection({ users }: { users: BetterAuthUser[] }) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const stats = useMemo(() => {
    const signupsToday = users.filter(u => u.createdAt.slice(0, 10) === todayStr).length;
    const signupsWeek = users.filter(u => new Date(u.createdAt) >= weekAgo).length;
    const adminCount = users.filter(u => u.role === "admin").length;
    const bannedCount = users.filter(u => u.banned).length;
    return { total: users.length, signupsToday, signupsWeek, adminCount, bannedCount };
  }, [users]);

  // Build signup chart: last 14 days
  const chartData = useMemo(() => {
    const days: { label: string; date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        date: dateStr,
        count: users.filter(u => u.createdAt.slice(0, 10) === dateStr).length,
      });
    }
    return days;
  }, [users]);

  const maxCount = Math.max(1, ...chartData.map(d => d.count));

  const statCards = [
    { label: "Total Personnel", value: stats.total, icon: <Users className="h-5 w-5 text-indigo-400" />, accent: "border-indigo-800" },
    { label: "Signups Today", value: stats.signupsToday, icon: <TrendingUp className="h-5 w-5 text-green-400" />, accent: "border-green-800" },
    { label: "Signups (7d)", value: stats.signupsWeek, icon: <Activity className="h-5 w-5 text-cyan-400" />, accent: "border-cyan-800" },
    { label: "Admins", value: stats.adminCount, icon: <ShieldCheck className="h-5 w-5 text-amber-400" />, accent: "border-amber-800" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100 tracking-wide">Command Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`rounded-lg border-l-4 ${card.accent} border border-slate-700 bg-slate-950 p-4`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">{card.label}</span>
              {card.icon}
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-100 tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Signup timeline — CSS bars */}
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Signup Timeline — Last 14 Days</h2>
        <div className="flex items-end gap-1.5 h-48">
          {chartData.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group">
              {/* tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-300 mb-1 whitespace-nowrap">
                {d.count}
              </div>
              <div
                className="w-full rounded-t bg-indigo-500 hover:bg-indigo-400 transition-colors min-h-[2px]"
                style={{ height: `${(d.count / maxCount) * 100}%` }}
              />
              <span className="text-[10px] text-slate-500 mt-1.5 truncate w-full text-center">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Users / Personnel ──────────────────────────────────────────────────────

function UsersSection({ users, fetchApi, reload }: {
  users: BetterAuthUser[];
  fetchApi: (path: string, options?: RequestInit) => Promise<any>;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"createdAt" | "email">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banModal, setBanModal] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = users
    .filter(u => !search || u.email.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = sortField === "email" ? a.email : a.createdAt;
      const bVal = sortField === "email" ? b.email : b.createdAt;
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  const doAction = async (action: string, body: Record<string, any>) => {
    setActionLoading(body.userId);
    try {
      await fetchApi(`/admin/${action}`, { method: "POST", body: JSON.stringify(body) });
      await reload();
    } catch (e: any) {
      alert(`Action failed: ${e.message}`);
    }
    setActionLoading(null);
  };

  const toggleRole = (user: BetterAuthUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(`Set ${user.name || user.email} role to "${newRole}"?`)) return;
    doAction("set-role", { userId: user.id, role: newRole });
  };

  const banUser = (userId: string) => {
    doAction("ban-user", { userId, banReason: banReason || "Banned by admin" });
    setBanModal(null);
    setBanReason("");
  };

  const unbanUser = (userId: string) => {
    doAction("unban-user", { userId });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100 tracking-wide">Personnel Roster</h1>
        <span className="text-sm text-slate-500">{users.length} operators</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search personnel…"
          className="w-full max-w-sm rounded-md border border-slate-700 bg-slate-900 pl-10 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900">
              <th className="px-4 py-3 text-left font-medium text-slate-400 cursor-pointer" onClick={() => toggleSort("email")}>
                <span className="flex items-center gap-1">Operator <ArrowUpDown className="h-3 w-3" /></span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">Role</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400 cursor-pointer" onClick={() => toggleSort("createdAt")}>
                <span className="flex items-center gap-1">Enlisted <ArrowUpDown className="h-3 w-3" /></span>
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((user) => {
              const isLoading = actionLoading === user.id;
              return (
                <tr key={user.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-xs font-bold text-indigo-300">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-slate-100">{user.name || "—"}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/50 border border-amber-700 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                        <ShieldAlert className="h-3 w-3" /> ADMIN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-600 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                        <Shield className="h-3 w-3" /> USER
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.banned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-900/50 border border-red-700 px-2.5 py-0.5 text-xs font-medium text-red-300">
                        <Ban className="h-3 w-3" /> BANNED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-900/50 border border-green-700 px-2.5 py-0.5 text-xs font-medium text-green-300">
                        <UserCheck className="h-3 w-3" /> ACTIVE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400 inline" />
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleRole(user)} title="Toggle role"
                          className="rounded p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950 transition-colors">
                          <UserCog className="h-4 w-4" />
                        </button>
                        {user.banned ? (
                          <button onClick={() => unbanUser(user.id)} title="Unban"
                            className="rounded p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-950 transition-colors">
                            <UserCheck className="h-4 w-4" />
                          </button>
                        ) : (
                          <button onClick={() => setBanModal(user.id)} title="Ban"
                            className="rounded p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950 transition-colors">
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-slate-500">No personnel found.</p>
        )}
      </div>

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-400" /> Ban Operator
            </h3>
            <label className="block text-sm text-slate-400 mb-1">Reason (optional)</label>
            <input
              type="text" value={banReason} onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban…"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 mb-4 focus:ring-2 focus:ring-red-500"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setBanModal(null); setBanReason(""); }}
                className="rounded-md px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={() => banUser(banModal)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subscriptions Placeholder ──────────────────────────────────────────────

function SubscriptionsPlaceholder() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100 tracking-wide">Subscriptions</h1>
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-12 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-indigo-950 border border-indigo-800 p-4 mb-4">
          <CreditCardIcon className="h-8 w-8 text-indigo-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Subscription Management Coming Soon</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Connect Stripe to enable subscription tracking, plan management, and revenue analytics for HORIZON operators.
        </p>
        <div className="mt-6 rounded-md border border-dashed border-slate-700 px-4 py-2 text-xs text-slate-500">
          <code>STRIPE_SECRET_KEY</code> not configured
        </div>
      </div>
    </div>
  );
}

// ── Analytics Placeholder ──────────────────────────────────────────────────

function AnalyticsPlaceholder() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100 tracking-wide">Analytics</h1>
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-12 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-indigo-950 border border-indigo-800 p-4 mb-4">
          <LineChart className="h-8 w-8 text-indigo-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Operational Analytics Coming Soon</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Mission telemetry, usage metrics, and operational intelligence dashboards are being developed for HORIZON command staff.
        </p>
        <div className="mt-6 flex gap-3">
          {["Usage Events", "Mission Logs", "API Metrics"].map((label) => (
            <span key={label} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-500">{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Error State ────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldAlert className="h-10 w-10 text-red-400 mb-4" />
      <h2 className="text-lg font-semibold text-slate-100 mb-2">Access Denied or API Error</h2>
      <p className="text-sm text-slate-400 mb-4 max-w-md">{message}</p>
      <button onClick={onRetry} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
        Retry
      </button>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 rounded bg-slate-800 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-slate-800 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-slate-800 animate-pulse" />
    </div>
  );
}
