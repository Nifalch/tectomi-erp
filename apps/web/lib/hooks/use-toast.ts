import { create } from "zustand";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastState {
  toasts: ToastData[];
  toast: (props: Omit<ToastData, "id">) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  toast: (props) => {
    const id = `toast-${++counter}`;
    const duration = props.duration ?? 5000;
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { ...props, id, duration }],
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function toast(props: Omit<ToastData, "id">) {
  useToastStore.getState().toast(props);
}
