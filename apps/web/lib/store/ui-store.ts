"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";
type ModalState = { type: string; props: Record<string, unknown> } | null;

type UiState = {
  sidebarOpen: boolean;
  theme: Theme;
  activeModal: ModalState;
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  openModal: (type: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: typeof window !== "undefined" ? window.innerWidth >= 768 : true,
      theme: "light",
      activeModal: null,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      openModal: (type, props = {}) => set({ activeModal: { type, props } }),
      closeModal: () => set({ activeModal: null }),
    }),
    {
      name: "nuro7-ui",
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
