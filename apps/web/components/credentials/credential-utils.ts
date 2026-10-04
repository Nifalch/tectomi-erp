import {
  AtSign,
  Camera,
  CreditCard,
  Database,
  FileText,
  Globe,
  Facebook,
  Hash,
  Instagram,
  KeyRound,
  Linkedin,
  Lock,
  Mail,
  MessageCircle,
  Music2,
  Pin,
  PlaySquare,
  Send,
  Server,
  Share2,
  ShieldCheck,
  StickyNote,
  Terminal,
  Twitter,
  Users,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import type { CredentialType } from "@/lib/api/hooks";

export interface CredentialTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the tinted icon chip. */
  chip: string;
  /** Tailwind classes for a small text badge. */
  badge: string;
  description: string;
}

export const CREDENTIAL_TYPE_META: Record<CredentialType, CredentialTypeMeta> = {
  PASSWORD: {
    label: "Password",
    icon: Lock,
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    badge: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30",
    description: "Username + password for a website or app login.",
  },
  API_KEY: {
    label: "API Key",
    icon: KeyRound,
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    badge: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30",
    description: "Token issued by a third-party service (Stripe, OpenAI, etc.).",
  },
  SSH_KEY: {
    label: "SSH Key",
    icon: Terminal,
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    badge: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-200 dark:ring-slate-500/30",
    description: "Private key for SSH access. Public key is plaintext metadata.",
  },
  DATABASE: {
    label: "Database",
    icon: Database,
    chip: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
    badge: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-500/30",
    description: "Connection string + credentials for a database server.",
  },
  CERTIFICATE: {
    label: "Certificate",
    icon: ShieldCheck,
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30",
    description: "TLS/code-signing certificate with its private key.",
  },
  ENV_FILE: {
    label: "Env File",
    icon: Server,
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-500/30",
    description: ".env contents for a project. Stored as one encrypted blob.",
  },
  CARD: {
    label: "Card",
    icon: CreditCard,
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
    badge: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30",
    description: "Debit / credit card details. Keep card numbers off chat.",
  },
  NOTE: {
    label: "Secure Note",
    icon: StickyNote,
    chip: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    badge: "bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-200 dark:ring-yellow-500/30",
    description: "Free-form text encrypted at rest. Recovery codes, PINs, etc.",
  },
  SOCIAL_MEDIA: {
    label: "Social Media",
    icon: Share2,
    chip: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300",
    badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:ring-fuchsia-500/30",
    description: "Brand-channel logins. Recovery email, phone, 2FA backup codes are stored encrypted too.",
  },
  EMAIL_ACCOUNT: {
    label: "Email Account",
    icon: Mail,
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    badge: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-500/30",
    description: "Mailbox login + app passwords. Doubles as the recovery point for other accounts — protect accordingly.",
  },
  GENERIC: {
    label: "Generic",
    icon: FileText,
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    badge: "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-200 dark:ring-slate-500/30",
    description: "Anything that doesn't fit another category.",
  },
};

export const CREDENTIAL_TYPE_OPTIONS = (Object.keys(CREDENTIAL_TYPE_META) as CredentialType[]).map(
  (key) => ({ value: key, label: CREDENTIAL_TYPE_META[key].label }),
);

/**
 * Strong password generator — 16-character default, mixed case + digits + symbols.
 * The character pool intentionally drops ambiguous glyphs (0/O, l/1) so users
 * who have to type the password somewhere don't get confused.
 */
export function generatePassword(length = 20): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.?";
  const pool = lower + upper + digits + symbols;
  const arr = new Uint32Array(length);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 2 ** 32);
  }
  let out = "";
  // Force one of each character class to guarantee complexity, then fill.
  out += lower[arr[0] % lower.length];
  out += upper[arr[1] % upper.length];
  out += digits[arr[2] % digits.length];
  out += symbols[arr[3] % symbols.length];
  for (let i = 4; i < length; i++) out += pool[arr[i] % pool.length];
  // Shuffle so the guaranteed chars aren't always at the start.
  const chars = out.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - d) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function getInitials(u: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const first = u.firstName?.[0] ?? "";
  const last = u.lastName?.[0] ?? "";
  if (first || last) return (first + last).toUpperCase();
  return (u.email?.slice(0, 2) ?? "??").toUpperCase();
}

/**
 * Catalog of common social/web platforms used to seed the SOCIAL_MEDIA
 * credential type. The `key` is what gets stored in `metadata.platform` —
 * stable, lowercase, slug-ish so an external tool could reason about it.
 * The icon + brand color are display-only.
 *
 * Lucide doesn't ship every brand mark (e.g. WhatsApp, X, TikTok) so the
 * closest semantic icon is used as a fallback. The brand color still makes
 * each platform recognizable at a glance.
 */
export interface PlatformMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  hex: string;
  domain?: string;
}

export const SOCIAL_PLATFORMS: PlatformMeta[] = [
  { key: "twitter",   label: "X / Twitter",  icon: Twitter,      hex: "#000000", domain: "x.com" },
  { key: "facebook",  label: "Facebook",     icon: Facebook,     hex: "#1877F2", domain: "facebook.com" },
  { key: "instagram", label: "Instagram",    icon: Instagram,    hex: "#E4405F", domain: "instagram.com" },
  { key: "linkedin",  label: "LinkedIn",     icon: Linkedin,     hex: "#0A66C2", domain: "linkedin.com" },
  { key: "youtube",   label: "YouTube",      icon: Youtube,      hex: "#FF0000", domain: "youtube.com" },
  { key: "tiktok",    label: "TikTok",       icon: Music2,       hex: "#010101", domain: "tiktok.com" },
  { key: "threads",   label: "Threads",      icon: AtSign,       hex: "#000000", domain: "threads.net" },
  { key: "pinterest", label: "Pinterest",    icon: Pin,          hex: "#E60023", domain: "pinterest.com" },
  { key: "reddit",    label: "Reddit",       icon: Hash,         hex: "#FF4500", domain: "reddit.com" },
  { key: "snapchat",  label: "Snapchat",     icon: Camera,       hex: "#FFFC00", domain: "snapchat.com" },
  { key: "whatsapp",  label: "WhatsApp Business", icon: MessageCircle, hex: "#25D366", domain: "business.whatsapp.com" },
  { key: "telegram",  label: "Telegram",     icon: Send,         hex: "#26A5E4", domain: "telegram.org" },
  { key: "discord",   label: "Discord",      icon: Users,        hex: "#5865F2", domain: "discord.com" },
  { key: "youtube_music", label: "YouTube Music", icon: PlaySquare, hex: "#FF0000", domain: "music.youtube.com" },
  { key: "other",     label: "Other platform", icon: Globe,      hex: "#475569" },
];

export const SOCIAL_PLATFORM_OPTIONS = SOCIAL_PLATFORMS.map((p) => ({ value: p.key, label: p.label }));

export function getPlatformMeta(key?: string | null): PlatformMeta | null {
  if (!key) return null;
  return SOCIAL_PLATFORMS.find((p) => p.key === key) ?? null;
}

/**
 * Reveal auto-lock window. High-security credentials lock faster so a
 * casually-left-open tab doesn't expose plaintext for long. Returned in ms.
 */
export function getRevealTtlMs(c: { highSecurity?: boolean; type: CredentialType }): number {
  if (c.highSecurity) return 30_000;
  if (c.type === "SOCIAL_MEDIA" || c.type === "EMAIL_ACCOUNT") return 30_000;
  return 60_000;
}
