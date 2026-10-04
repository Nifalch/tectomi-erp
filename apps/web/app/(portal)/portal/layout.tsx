"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Layers, FileText, Sparkles, LogOut, Menu, X, Mail, Phone, Globe } from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { PortalChatWidget } from "@/components/portal/portal-chat-widget";
import "./portal-theme.css";

// Standard professional sans. Inter is the most familiar/legible choice
// for a B2B portal; replaces the editorial Fraunces/Geist pair so the
// portal reads as straightforwardly professional.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-portal-sans",
  display: "swap",
});

interface Me {
  name: string | null;
  email: string;
  orgName: string;
  orgLogoUrl: string | null;
  orgEmail: string | null;
  orgPhone: string | null;
  orgWebsite: string | null;
  orgAddress: string | null;
}

// Requests removed from the nav — messaging lives in the floating chat
// widget mounted in the layout. The /portal/requests/* routes stay live
// so existing bookmarks and notification links still work.
const NAV = [
  { href: "/portal", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/portal/projects", label: "Projects", icon: Layers },
  { href: "/portal/invoices", label: "Invoices", icon: FileText },
  { href: "/portal/proposals", label: "Proposals", icon: Sparkles },
];

/**
 * Renders the Nuro 7 wordmark (or the org's uploaded logo). Defaults to
 * the dark-on-transparent wordmark at /logo-white.png (counter-intuitive
 * filename, but it's the canonical black mark used across the app —
 * same one the invoice/proposal PDFs and the staff sidebar use). Height
 * controls the rendered height; width is auto.
 */
function Brand({
  me,
  height,
  className,
}: {
  me: Me | null;
  /** Pixel height. Skip when passing a responsive `className` for h-X. */
  height?: number;
  /** Responsive size via Tailwind (`h-8 sm:h-9`). Overrides `height`. */
  className?: string;
}) {
  const logo = me?.orgLogoUrl?.trim() || "/logo-white.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo}
      alt={me?.orgName ?? "Tectomi ERP"}
      className={className}
      style={className ? { width: "auto", objectFit: "contain" } : { height, width: "auto", objectFit: "contain" }}
    />
  );
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthPage =
    pathname === "/portal/login" || pathname?.startsWith("/portal/auth/verify");

  useEffect(() => {
    if (isAuthPage) return;
    portalApi.me().then((m) => setMe(m as Me)).catch(() => {});
  }, [isAuthPage]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const logout = async () => {
    await portalApi.auth.logout().catch(() => {});
    router.push("/portal/login");
  };

  if (isAuthPage) {
    return (
      <div className={`${inter.variable} portal-shell min-h-screen`}>
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="Tectomi ERP" style={{ height: 36, width: "auto", objectFit: "contain" }} />
            <div className="portal-eyebrow">Client Portal</div>
          </div>
          {children}
        </main>
      </div>
    );
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className={`${inter.variable} portal-shell min-h-screen`}>
      {/* Sticky brand header — wordmark only. Tagline lives in the footer.
          Padding + logo scale down on mobile so phones don't waste 84px
          of vertical real estate on chrome. */}
      <header className="sticky top-0 z-30 backdrop-blur-md" style={{ background: "rgba(251, 250, 248, 0.9)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:gap-3 sm:px-5 sm:py-6">
          <Link href="/portal" aria-label="Home" className="flex items-center">
            <Brand me={me} className="h-7 w-auto object-contain sm:h-9" />
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="portal-nav-item"
                  data-active={active}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right leading-tight">
              <div className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {me?.name || me?.email}
              </div>
              {me?.name && (
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {me.email}
                </div>
              )}
            </div>
            <button onClick={logout} className="portal-btn-ghost">
              <LogOut className="size-3.5" /> Logout
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex size-11 items-center justify-center rounded-full transition active:scale-95 md:hidden"
            style={{ color: "var(--ink)" }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <div className="portal-hairline" />

        {menuOpen && (
          <nav className="portal-mobile-menu px-4 py-4 md:hidden">
            <div className="mb-3 pb-3" style={{ borderBottom: "1px solid var(--rule)" }}>
              <div className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>{me?.name || me?.email}</div>
              {me?.name && <div className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>{me.email}</div>}
            </div>
            <div className="space-y-0.5">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] font-medium transition active:scale-[0.98]"
                    style={{
                      background: active ? "var(--ink)" : "transparent",
                      color: active ? "var(--paper)" : "var(--ink-soft)",
                    }}
                  >
                    <Icon className="size-4" /> {item.label}
                  </Link>
                );
              })}
            </div>
            <button
              onClick={logout}
              className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[14px] font-medium transition active:scale-[0.98]"
              style={{ color: "var(--rose)" }}
            >
              <LogOut className="size-4" /> Logout
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-5 sm:py-8">{children}</main>

      {/*
        Footer — compact 4-column grid. Brand block on the left carries
        the wordmark + tagline at refined scale; three utility columns
        follow with even rhythm. Slim bottom strip carries © + signed-in
        identity. Layout collapses gracefully on mobile.
      */}
      <footer className="mt-8 sm:mt-14" style={{ borderTop: "1px solid var(--rule)", background: "var(--paper-2)" }}>
        <div className="mx-auto max-w-6xl px-4 pt-7 pb-5 sm:px-5 sm:pt-10 sm:pb-6">
          {/* One grid for everything. On mobile (2 cols): brand spans both
              columns and Navigate + Reach us sit side-by-side underneath
              so the footer doesn't become a long vertical scroll. On md+
              (12 cols): brand on the left half, Nav + Reach on the right
              — original desktop rhythm. */}
          <div className="grid grid-cols-2 gap-6 sm:gap-10 md:grid-cols-12">
            <div className="col-span-2 md:col-span-6">
              <Brand me={me} className="h-7 w-auto object-contain sm:h-10" />
              <p
                className="portal-title mt-3 text-[16px] leading-[1.3] tracking-[-0.01em] sm:mt-5 sm:text-[20px]"
                style={{ color: "var(--ink)" }}
              >
                Think <span style={{ color: "var(--accent)" }}>AI</span>. Think {me?.orgName ?? "Tectomi ERP"}.
              </p>
              <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
                Your private portal — every project, invoice, and conversation in one place.
              </p>
            </div>

            <div className="md:col-span-3">
              <div className="portal-eyebrow">Navigate</div>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="transition hover:opacity-70"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-3">
              <div className="portal-eyebrow">Reach us</div>
              <div className="mt-3 space-y-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>
                {me?.orgEmail && (
                  <a href={`mailto:${me.orgEmail}`} className="flex items-center gap-2 hover:opacity-70">
                    <Mail className="size-3.5 shrink-0" style={{ color: "var(--muted-2)" }} />
                    <span className="truncate">{me.orgEmail}</span>
                  </a>
                )}
                {me?.orgPhone && (
                  <a href={`tel:${me.orgPhone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:opacity-70">
                    <Phone className="size-3.5 shrink-0" style={{ color: "var(--muted-2)" }} />
                    <span>{me.orgPhone}</span>
                  </a>
                )}
                {me?.orgWebsite && (
                  <a
                    href={me.orgWebsite.startsWith("http") ? me.orgWebsite : `https://${me.orgWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:opacity-70"
                  >
                    <Globe className="size-3.5 shrink-0" style={{ color: "var(--muted-2)" }} />
                    <span className="truncate">{me.orgWebsite.replace(/^https?:\/\//, "")}</span>
                  </a>
                )}
                {!me?.orgEmail && !me?.orgPhone && (
                  <span style={{ color: "var(--muted)" }}>Ask your account manager.</span>
                )}
              </div>
            </div>
          </div>

          <div className="portal-hairline mt-6 sm:mt-8" />
          <div className="mt-4 flex flex-col items-start gap-1 text-[11px] sm:flex-row sm:items-center sm:justify-between sm:gap-2" style={{ color: "var(--muted)" }}>
            <span>© {new Date().getFullYear()} {me?.orgName ?? "Tectomi ERP"}. All rights reserved.</span>
            {me?.email && <span className="truncate font-medium">{me.email}</span>}
          </div>
        </div>
      </footer>

      {/* Floating chat widget — pop-up backed by the requests endpoints.
          Skipped on auth pages by the early-return above. */}
      <PortalChatWidget orgName={me?.orgName} />
    </div>
  );
}
