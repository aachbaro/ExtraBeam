/**
 * src/context/UserContext.tsx
 * Layer  : Frontend — contexte global
 * Role   : Fournit l'état de l'utilisateur connecté à toute l'application.
 *          Persiste en localStorage (slug + token inclus).
 *          Expose setUser et clearUser.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { AuthUser } from "../types";
import { recruitmentApi } from '../recruitmentApi';

interface UserContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const STORAGE_KEY = "eb_user";

async function disconnectPush(token?: string | null) {
  if (!token || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await recruitmentApi('notifications/push/', token, 'DELETE', { endpoint: subscription.endpoint });
    }
  } catch { /* Local logout succeeds even if the browser or API is offline. */ }
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(loadUser);

  function setUser(next: AuthUser) {
    if (user && user.id !== next.id) void disconnectPush(user.token);
    setUserState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function clearUser() {
    setUserState(null);
    localStorage.removeItem(STORAGE_KEY);
    await Promise.race([disconnectPush(user?.token), new Promise<void>(resolve => window.setTimeout(resolve, 2000))]);
  }

  return (
    <UserContext.Provider value={{ user, setUser, clearUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUserContext must be used inside UserProvider.");
  return context;
}
