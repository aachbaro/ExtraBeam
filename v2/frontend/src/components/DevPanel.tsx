/**
 * src/components/DevPanel.tsx
 * Panneau de développement — visible uniquement en mode dev (import.meta.env.DEV).
 * Permet de créer des comptes fictifs et de s'y connecter sans passer par l'OIDC.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { devDeleteAccount, devListAccounts, devLogin, type DevAccount } from "../api";
import { useUserContext } from "../context/UserContext";
import { getDefaultAppPath } from "../api";
import type { AccountRole } from "../types";

const ROLES: { value: AccountRole; label: string }[] = [
  { value: "freelance", label: "Freelance" },
  { value: "client", label: "Restaurateur" },
  { value: "admin", label: "Admin" },
];

const ROLE_BADGE: Record<string, string> = {
  freelance: "bg-blue-100 text-blue-700",
  client: "bg-purple-100 text-purple-700",
  admin: "bg-red-100 text-red-700",
};

export default function DevPanel() {
  const { setUser, clearUser } = useUserContext();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<DevAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AccountRole>("freelance");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setAccounts(await devListAccounts());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open]);

  async function handleLogin(account: DevAccount) {
    setBusy(`login-${account.username}`);
    try {
      const res = await devLogin(account.username, account.display_name, account.role);
      const nextUser = { ...res.user, token: res.access_token };
      setUser(nextUser);
      setOpen(false);
      navigate(getDefaultAppPath(nextUser), { replace: true });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(account: DevAccount) {
    setBusy(`delete-${account.username}`);
    try {
      await devDeleteAccount(account.username);
      setAccounts((prev) => prev.filter((a) => a.username !== account.username));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate() {
    const username = newName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!username) return;
    setBusy("create");
    try {
      const res = await devLogin(username, newName.trim() || username, newRole);
      const nextUser = { ...res.user, token: res.access_token };
      setUser(nextUser);
      setNewName("");
      setOpen(false);
      navigate(getDefaultAppPath(nextUser), { replace: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {open && (
        <div className="w-72 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-[13px] font-semibold text-gray-700">Comptes de dev</span>
            <button
              onClick={() => { clearUser(); }}
              className="text-[11px] text-gray-400 hover:text-gray-600"
              title="Se déconnecter"
            >
              déconnecter
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto px-3 py-2">
            {loading ? (
              <p className="py-4 text-center text-[12px] text-gray-400">Chargement…</p>
            ) : accounts.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-gray-400">Aucun compte dev</p>
            ) : (
              <ul className="space-y-1">
                {accounts.map((account) => (
                  <li key={account.username} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-gray-800">{account.display_name}</p>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE[account.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {account.role}
                      </span>
                    </div>
                    <button
                      disabled={busy !== null}
                      onClick={() => void handleLogin(account)}
                      className="shrink-0 rounded bg-eb-primary px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === `login-${account.username}` ? "…" : "Login"}
                    </button>
                    <button
                      disabled={busy !== null}
                      onClick={() => void handleDelete(account)}
                      className="shrink-0 rounded px-1.5 py-1 text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Nouveau compte</p>
            <input
              type="text"
              placeholder="Nom (ex: Alice)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              className="mb-2 w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] text-gray-700 outline-none focus:border-eb-primary"
            />
            <div className="mb-2 flex gap-1">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setNewRole(r.value)}
                  className={`flex-1 rounded py-1 text-[11px] font-medium transition-colors ${newRole === r.value ? "bg-eb-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              disabled={!newName.trim() || busy !== null}
              onClick={() => void handleCreate()}
              className="w-full rounded bg-eb-primary py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy === "create" ? "Création…" : "Créer & se connecter"}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-full bg-gray-800 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg hover:bg-gray-700"
        title="Panneau dev"
      >
        <span>🛠</span>
        <span>Dev</span>
      </button>
    </div>
  );
}
