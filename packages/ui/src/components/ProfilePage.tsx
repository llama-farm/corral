import React, { useState, useEffect } from "react";
import { User, CreditCard, BarChart3, Key, Monitor, Loader2, AlertCircle, Trash2, Plus, Copy, Check, Shield } from "lucide-react";
import { useCorral } from "../context/CorralProvider";
import { PlanPicker } from "./PlanPicker";
import { UsageMeters } from "./UsageMeters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface ProfilePageProps {
  className?: string;
  defaultTab?: string;
  onUpgrade?: () => void;
  usageHistory?: Array<{ date: string; value: number }>;
}

type Tab = "general" | "billing" | "usage" | "api-keys" | "sessions";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <User className="h-4 w-4" /> },
  { id: "billing", label: "Billing", icon: <CreditCard className="h-4 w-4" /> },
  { id: "usage", label: "Usage", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "api-keys", label: "API Keys", icon: <Key className="h-4 w-4" /> },
  { id: "sessions", label: "Sessions", icon: <Monitor className="h-4 w-4" /> },
];

export function ProfilePage({ className = "", defaultTab = "general", onUpgrade, usageHistory }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab as Tab);

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "general" && <GeneralTab />}
      {activeTab === "billing" && <BillingTab onUpgrade={onUpgrade} />}
      {activeTab === "usage" && <UsageTab onUpgrade={onUpgrade} usageHistory={usageHistory} />}
      {activeTab === "api-keys" && <ApiKeysTab />}
      {activeTab === "sessions" && <SessionsTab />}
    </div>
  );
}

// ── General Tab ────────────────────────────────────────────────────────────

function GeneralTab() {
  const { user, updateProfile, changePassword, deleteAccount } = useCorral();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true); setError(null); setSaved(false);
    const result = await updateProfile({ name });
    setSaving(false);
    if (result.error) setError(result.error);
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  const handleChangePassword = async () => {
    if (newPw.length < 8) { setPwMsg({ type: "error", text: "New password must be at least 8 characters" }); return; }
    setPwSaving(true); setPwMsg(null);
    const result = await changePassword(currentPw, newPw);
    setPwSaving(false);
    if (result.error) setPwMsg({ type: "error", text: result.error });
    else { setPwMsg({ type: "success", text: "Password changed!" }); setCurrentPw(""); setNewPw(""); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    await deleteAccount();
    setDeleting(false);
  };

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-6">
          {user?.image ? (
            <img src={user.image} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              {(user?.name || user?.email || "?")[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">{user?.name || "User"}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input type="email" value={user?.email || ""} disabled
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleSaveProfile} disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : saved ? <><Check className="h-4 w-4 inline" /> Saved</> : "Save changes"}
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Change Password</h2>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
          </div>
          {pwMsg && <p className={`text-sm ${pwMsg.type === "error" ? "text-red-500" : "text-green-600"}`}>{pwMsg.text}</p>}
          <button onClick={handleChangePassword} disabled={pwSaving || !currentPw || !newPw}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
            {pwSaving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Update password"}
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-lg border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Permanently delete your account and all data.</p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950">
            <Trash2 className="h-4 w-4 inline mr-1" /> Delete account
          </button>
        ) : (
          <div className="space-y-3 max-w-md">
            <p className="text-sm text-red-600 dark:text-red-400">Type <strong>DELETE</strong> to confirm:</p>
            <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:bg-slate-900 dark:text-slate-100" />
            <div className="flex gap-3">
              <button onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirm !== "DELETE" || deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Permanently delete"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Billing Tab ────────────────────────────────────────────────────────────

function BillingTab({ onUpgrade }: { onUpgrade?: () => void }) {
  const { subscription, plans } = useCorral();
  const currentPlan = plans.find((p) => p.id === subscription?.planId);

  return (
    <div className="space-y-8">
      {/* Current plan */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Current Plan</h2>
        {subscription ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{subscription.planName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Status: <span className={`font-medium ${subscription.status === "active" ? "text-green-600" : subscription.status === "past_due" ? "text-red-600" : "text-amber-600"}`}>
                  {subscription.status}
                </span>
              </p>
              {subscription.currentPeriodEnd && (
                <p className="text-xs text-slate-400 mt-1">
                  {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {currentPlan && <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">${currentPlan.price}<span className="text-sm font-normal text-slate-500">/{currentPlan.interval}</span></div>}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No active subscription.</p>
        )}
      </section>

      {/* Plan picker */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Change Plan</h2>
        <PlanPicker />
      </section>
    </div>
  );
}

// ── Usage Tab ──────────────────────────────────────────────────────────────

function UsageTab({ onUpgrade, usageHistory }: { onUpgrade?: () => void; usageHistory?: Array<{ date: string; value: number }> }) {
  return (
    <div className="space-y-8">
      <UsageMeters onUpgrade={onUpgrade} />

      {usageHistory && usageHistory.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-950">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Usage History</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageHistory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-slate-500" />
                <YAxis tick={{ fontSize: 12 }} className="text-slate-500" />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

// ── API Keys Tab ───────────────────────────────────────────────────────────

function ApiKeysTab() {
  const { getApiKeys, createApiKey, revokeApiKey } = useCorral();
  const [keys, setKeys] = useState<Array<{ id: string; name: string; key?: string; createdAt: string; lastUsed?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => { setKeys(await getApiKeys()); setLoading(false); })();
  }, [getApiKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    const result = await createApiKey(newKeyName);
    setCreating(false);
    if ("error" in result) return;
    setNewKey(result.key);
    setNewKeyName("");
    setKeys(await getApiKeys());
  };

  const handleRevoke = async (id: string) => {
    await revokeApiKey(id);
    setKeys(await getApiKeys());
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* New key revealed */}
      {newKey && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">New API key created! Copy it now — it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white px-3 py-1.5 text-sm font-mono text-slate-900 border dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 truncate">{newKey}</code>
            <button onClick={() => handleCopy(newKey)}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Create */}
      <div className="flex gap-3">
        <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. Production)" 
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
        <button onClick={handleCreate} disabled={creating || !newKeyName.trim()}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
        </button>
      </div>

      {/* List */}
      {keys.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No API keys yet.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 dark:border-slate-700 dark:divide-slate-700">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-950">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{k.name}</p>
                <p className="text-xs text-slate-400">Created {new Date(k.createdAt).toLocaleDateString()}{k.lastUsed ? ` · Last used ${new Date(k.lastUsed).toLocaleDateString()}` : ""}</p>
              </div>
              <button onClick={() => handleRevoke(k.id)}
                className="text-xs text-red-600 hover:text-red-500 dark:text-red-400 font-medium">Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sessions Tab ───────────────────────────────────────────────────────────

function SessionsTab() {
  const { getSessions, revokeSession } = useCorral();
  type SessionItem = { id: string; device?: string; ip?: string; lastActive?: string; current?: boolean };
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { setSessions(await getSessions()); setLoading(false); })();
  }, [getSessions]);

  const handleRevoke = async (id: string) => {
    await revokeSession(id);
    setSessions((s) => s.filter((x) => x.id !== id));
  };

  if (loading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>;
  }

  return (
    <div>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">No active sessions.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 dark:border-slate-700 dark:divide-slate-700">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {s.device || "Unknown device"}
                    {s.current && <span className="ml-2 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">Current</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {s.ip || "Unknown IP"}{s.lastActive ? ` · ${new Date(s.lastActive).toLocaleString()}` : ""}
                  </p>
                </div>
              </div>
              {!s.current && (
                <button onClick={() => handleRevoke(s.id)}
                  className="text-xs text-red-600 hover:text-red-500 dark:text-red-400 font-medium">Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
