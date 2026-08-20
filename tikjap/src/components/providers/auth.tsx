"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, configureApiClient } from "@/lib/api";
import type { LoginInput, SignupInput, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (input: LoginInput) => Promise<User>;
  signup: (input: SignupInput) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    configureApiClient({
      onUnauthorized: () => {
        setUser(null);
        setStatus("unauthenticated");
      },
    });
    let active = true;
    api.auth
      .session()
      .then(({ user: sessionUser }) => {
        if (!active) return;
        setUser(sessionUser);
        setStatus(sessionUser ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { user: loggedIn } = await api.auth.login(input);
    setUser(loggedIn);
    setStatus("authenticated");
    return loggedIn;
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const { user: created } = await api.auth.signup(input);
    setUser(created);
    setStatus("authenticated");
    return created;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refresh = useCallback(async () => {
    const { user: sessionUser } = await api.auth.session();
    setUser(sessionUser);
    setStatus(sessionUser ? "authenticated" : "unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, signup, logout, refresh }),
    [user, status, login, signup, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}