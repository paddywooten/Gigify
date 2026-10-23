"use client";

// Global session state for the client-side app.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "./api-client";
import type { NotificationDTO, SessionUser } from "./types";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  notifications: NotificationDTO[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);

  const refresh = useCallback(async () => {
    try {
      const me = await api<SessionUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await api<{ items: NotificationDTO[] }>("/notifications");
      setNotifications(res.items);
    } catch {
      setNotifications([]);
    }
  }, []);

  const markNotificationsRead = useCallback(async () => {
    await api("/notifications", { method: "PATCH" });
    await refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (user) void refreshNotifications();
  }, [user, refreshNotifications]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (err) {
      // Surface nothing: the session is cleared server-side regardless.
      console.warn(errorMessage(err));
    }
    setUser(null);
    setNotifications([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      refresh,
      logout,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      refreshNotifications,
      markNotificationsRead,
    }),
    [user, loading, refresh, logout, notifications, refreshNotifications, markNotificationsRead],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
