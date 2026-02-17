import React, { useState, useRef, useEffect } from "react";
import { Settings, CreditCard, LogOut, ChevronDown } from "lucide-react";
import { useCorral } from "../context/CorralProvider";

export interface UserButtonProps {
  className?: string;
  onSettingsClick?: () => void;
  onBillingClick?: () => void;
  showPlanBadge?: boolean;
}

export function UserButton({ className = "", onSettingsClick, onBillingClick, showPlanBadge = true }: UserButtonProps) {
  const { user, subscription, signOut } = useCorral();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        {user.image ? (
          <img src={user.image} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            {initials}
          </div>
        )}
        <span className="hidden sm:block max-w-[120px] truncate text-slate-700 dark:text-slate-300">
          {user.name || user.email}
        </span>
        {showPlanBadge && subscription?.planName && (
          <span className="hidden sm:inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            {subscription.planName}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-50 dark:border-slate-700 dark:bg-slate-900">
          {/* User info */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.name || "User"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>

          {onSettingsClick && (
            <button onClick={() => { setOpen(false); onSettingsClick(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
              <Settings className="h-4 w-4" /> Settings
            </button>
          )}
          {onBillingClick && (
            <button onClick={() => { setOpen(false); onBillingClick(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
              <CreditCard className="h-4 w-4" /> Billing
            </button>
          )}

          <div className="border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => { setOpen(false); signOut(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
