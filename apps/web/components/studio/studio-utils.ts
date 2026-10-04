import type {
  MarketingIdeaPriority,
  MarketingIdeaStage,
  ProductIdeaStatus,
  SocialPlatform,
  SocialPostStatus,
  TeamToolCategory,
} from "@/lib/api/hooks";
import {
  Facebook,
  Globe,
  Hash,
  Instagram,
  Linkedin,
  MessageCircle,
  Music2,
  Pin,
  Send,
  Twitter,
  Youtube,
  AtSign,
  Camera,
  type LucideIcon,
} from "lucide-react";

// ── Marketing stages ──────────────────────────────────────────────────────────

export const MARKETING_STAGES: Array<{ key: MarketingIdeaStage; label: string; accent: string; chip: string }> = [
  { key: "IDEA",        label: "Idea",         accent: "bg-slate-400",   chip: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700" },
  { key: "PLANNED",     label: "Planned",      accent: "bg-blue-500",    chip: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-500/30" },
  { key: "IN_PROGRESS", label: "In progress",  accent: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30" },
  { key: "REVIEW",      label: "Review",       accent: "bg-violet-500",  chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30" },
  { key: "LIVE",        label: "Live",         accent: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30" },
  { key: "DONE",        label: "Done",         accent: "bg-slate-500",   chip: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700" },
  { key: "CANCELLED",   label: "Cancelled",    accent: "bg-red-400",     chip: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30" },
];

export const MARKETING_STAGE_OPTIONS = MARKETING_STAGES.map((s) => ({ value: s.key, label: s.label }));

export const MARKETING_PRIORITY_META: Record<MarketingIdeaPriority, { label: string; chip: string }> = {
  LOW:    { label: "Low",    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  MEDIUM: { label: "Medium", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200" },
  HIGH:   { label: "High",   chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200" },
};

// ── Product idea statuses ─────────────────────────────────────────────────────

export const PRODUCT_STATUSES: Array<{ key: ProductIdeaStatus; label: string; chip: string; accent: string }> = [
  { key: "IDEA",       label: "Idea",       accent: "bg-slate-400",   chip: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700" },
  { key: "VALIDATING", label: "Validating", accent: "bg-cyan-500",    chip: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-500/30" },
  { key: "PLANNED",    label: "Planned",    accent: "bg-blue-500",    chip: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-500/30" },
  { key: "BUILDING",   label: "Building",   accent: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30" },
  { key: "SHIPPED",    label: "Shipped",    accent: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30" },
  { key: "REJECTED",   label: "Rejected",   accent: "bg-red-400",     chip: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30" },
];

export const PRODUCT_STATUS_OPTIONS = PRODUCT_STATUSES.map((s) => ({ value: s.key, label: s.label }));

// ── Social platforms ──────────────────────────────────────────────────────────

export const SOCIAL_PLATFORM_META: Record<SocialPlatform, { label: string; icon: LucideIcon; hex: string; domain?: string }> = {
  TWITTER:   { label: "X / Twitter",         icon: Twitter,       hex: "#000000", domain: "x.com" },
  FACEBOOK:  { label: "Facebook",            icon: Facebook,      hex: "#1877F2", domain: "facebook.com" },
  INSTAGRAM: { label: "Instagram",           icon: Instagram,     hex: "#E4405F", domain: "instagram.com" },
  LINKEDIN:  { label: "LinkedIn",            icon: Linkedin,      hex: "#0A66C2", domain: "linkedin.com" },
  YOUTUBE:   { label: "YouTube",             icon: Youtube,       hex: "#FF0000", domain: "youtube.com" },
  TIKTOK:    { label: "TikTok",              icon: Music2,        hex: "#010101", domain: "tiktok.com" },
  THREADS:   { label: "Threads",             icon: AtSign,        hex: "#000000", domain: "threads.net" },
  PINTEREST: { label: "Pinterest",           icon: Pin,           hex: "#E60023", domain: "pinterest.com" },
  REDDIT:    { label: "Reddit",              icon: Hash,          hex: "#FF4500", domain: "reddit.com" },
  WHATSAPP:  { label: "WhatsApp Business",   icon: MessageCircle, hex: "#25D366", domain: "business.whatsapp.com" },
  TELEGRAM:  { label: "Telegram",            icon: Send,          hex: "#26A5E4", domain: "telegram.org" },
  OTHER:     { label: "Other",               icon: Globe,         hex: "#475569" },
};

export const SOCIAL_PLATFORM_OPTIONS = (Object.keys(SOCIAL_PLATFORM_META) as SocialPlatform[]).map(
  (k) => ({ value: k, label: SOCIAL_PLATFORM_META[k].label }),
);
void Camera; // pacify the unused import — kept for parity with the vault picker.

export const SOCIAL_STATUS_META: Record<SocialPostStatus, { label: string; chip: string; dot: string }> = {
  DRAFT:     { label: "Draft",     chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-400" },
  SCHEDULED: { label: "Scheduled", chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200", dot: "bg-blue-500" },
  PUBLISHED: { label: "Published", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200", dot: "bg-emerald-500" },
  FAILED:    { label: "Failed",    chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200", dot: "bg-red-500" },
  CANCELLED: { label: "Cancelled", chip: "bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400", dot: "bg-slate-400" },
};

export const SOCIAL_STATUS_OPTIONS = (Object.keys(SOCIAL_STATUS_META) as SocialPostStatus[]).map(
  (k) => ({ value: k, label: SOCIAL_STATUS_META[k].label }),
);

// ── Tool categories ───────────────────────────────────────────────────────────

export const TEAM_TOOL_CATEGORIES: Array<{ key: TeamToolCategory; label: string }> = [
  { key: "AI",            label: "AI" },
  { key: "DESIGN",        label: "Design" },
  { key: "DEVELOPMENT",   label: "Development" },
  { key: "MARKETING",     label: "Marketing" },
  { key: "PRODUCTIVITY",  label: "Productivity" },
  { key: "ANALYTICS",     label: "Analytics" },
  { key: "COMMUNICATION", label: "Communication" },
  { key: "RESEARCH",      label: "Research" },
  { key: "OTHER",         label: "Other" },
];

export const TEAM_TOOL_CATEGORY_OPTIONS = TEAM_TOOL_CATEGORIES.map((c) => ({ value: c.key, label: c.label }));

// ── Small helpers ─────────────────────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
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
  return `${Math.floor(days / 365)}y ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function getInitials(u: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const first = u.firstName?.[0] ?? "";
  const last = u.lastName?.[0] ?? "";
  if (first || last) return (first + last).toUpperCase();
  return (u.email?.slice(0, 2) ?? "??").toUpperCase();
}

export function faviconFor(url: string | null | undefined, iconUrl?: string | null): string | null {
  if (iconUrl) return iconUrl;
  if (!url) return null;
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return null;
  }
}
