"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AuthUser, LoginResponse } from "@/lib/auth";

const REMEMBER_FLAG = "tectomi-remember";

/**
 * The login form sets this flag *before* calling `setSession`, so the
 * persist middleware writes the resulting state to the right store.
 * Default = remember (localStorage) — preserves the previous behaviour
 * for any user who logged in before this toggle existed.
 */
export function setRememberPreference(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMEMBER_FLAG, remember ? "true" : "false");
  } catch {
    /* private-mode / quota — fall through to defaults */
  }
}

/**
 * Storage adapter that routes reads/writes to either localStorage
 * (persistent across browser restarts) or sessionStorage (cleared
 * when the browser closes) based on the `nuro7-remember` flag.
 *
 * Reads check sessionStorage first so a session-only login takes
 * precedence over a stale localStorage value from a prior persistent
 * login on the same machine — that way clicking Logout-then-login
 * "for this session only" doesn't accidentally revive the older
 * persistent token.
 */
const dynamicStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(name) ?? window.localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    const remember = window.localStorage.getItem(REMEMBER_FLAG) !== "false";
    if (remember) {
      window.localStorage.setItem(name, value);
      window.sessionStorage.removeItem(name);
    } else {
      window.sessionStorage.setItem(name, value);
      window.localStorage.removeItem(name);
    }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  setSession: (session: LoginResponse) => void;
  clearSession: () => void;
  markHydrated: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setSession: (session) =>
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user,
        }),
      clearSession: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
        });
        // Belt-and-braces: drop the remember flag on logout so the next
        // login starts fresh from the user's checkbox choice.
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(REMEMBER_FLAG);
          } catch {
            /* ignore */
          }
        }
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "tectomi-auth",
      storage: createJSONStorage(() => dynamicStorage),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
