import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        card: "hsl(var(--card))",
        muted: "hsl(var(--muted))",
        primary: "hsl(var(--primary))",
        accent: "hsl(var(--accent))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        destructive: "hsl(var(--destructive))",
        module: {
          dashboard: "hsl(var(--module-dashboard))",
          projects: "hsl(var(--module-projects))",
          tasks: "hsl(var(--module-tasks))",
          clients: "hsl(var(--module-clients))",
          hr: "hsl(var(--module-hr))",
          attendance: "hsl(var(--module-attendance))",
          leave: "hsl(var(--module-leave))",
          time: "hsl(var(--module-time))",
          accounts: "hsl(var(--module-accounts))",
          invoices: "hsl(var(--module-invoices))",
          proposals: "hsl(var(--module-proposals))",
          reports: "hsl(var(--module-reports))",
          settings: "hsl(var(--module-settings))",
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        panel: "0 18px 70px rgba(15, 23, 42, 0.12)",
      },
      backgroundImage: {
        grid: "linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.08) 1px, transparent 1px)",
      },
    },
  },
  plugins: [animate],
};

export default config;

