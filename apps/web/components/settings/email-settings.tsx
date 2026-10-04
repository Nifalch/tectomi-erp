"use client";

import { useEffect, useState } from "react";
import { Mail, Send, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/state";
import { apiFetch } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";

interface MailSettings {
  host: string;
  port: number;
  user: string;
  passSet: boolean;
  from: string;
  enabled: boolean;
  status: string | null;
  transportReady: boolean;
}

// Common SMTP presets so a user can pick one and only enter user/password.
// "Custom" leaves the host/port fields blank for full manual entry.
const PRESETS: Record<string, { host: string; port: number; label: string }> = {
  custom:    { host: "",                       port: 587, label: "Custom" },
  hostinger: { host: "smtp.titan.email",       port: 587, label: "Hostinger / Titan Email" },
  gmail:     { host: "smtp.gmail.com",         port: 587, label: "Gmail (App Password)" },
  brevo:     { host: "smtp-relay.brevo.com",   port: 587, label: "Brevo (Sendinblue)" },
  resend:    { host: "smtp.resend.com",        port: 587, label: "Resend" },
  zoho:      { host: "smtp.zeptomail.in",      port: 587, label: "Zoho ZeptoMail" },
  office365: { host: "smtp.office365.com",     port: 587, label: "Microsoft 365" },
};

export function EmailSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [host, setHost] = useState("");
  const [port, setPort] = useState<number>(587);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState(""); // empty = "leave unchanged"
  const [from, setFrom] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [passSet, setPassSet] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transportReady, setTransportReady] = useState(false);

  const [testTo, setTestTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MailSettings>("/mail/settings");
      setHost(data.host); setPort(data.port); setUser(data.user);
      setFrom(data.from); setEnabled(data.enabled);
      setPassSet(data.passSet); setStatus(data.status);
      setTransportReady(data.transportReady);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p || key === "custom") return;
    setHost(p.host); setPort(p.port);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        host: host.trim(), port, user: user.trim(),
        from: from.trim(), enabled,
      };
      // Empty pass = "keep existing" so users can edit other fields
      // without retyping the credential.
      if (pass.trim()) body.pass = pass.trim();
      const res = await apiFetch<{ ok: boolean; passSet: boolean; enabled: boolean; status: string | null; transportReady: boolean }>(
        "/mail/settings",
        { method: "PUT", body: JSON.stringify(body) },
      );
      toast({ variant: "success", title: "Email settings saved" });
      setPassSet(res.passSet); setEnabled(res.enabled);
      setStatus(res.status); setTransportReady(res.transportReady);
      setPass("");
    } catch (err) {
      toast({ variant: "error", title: "Failed to save", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast({ variant: "error", title: "Enter a recipient first" });
      return;
    }
    setTesting(true);
    try {
      // Send candidate creds along too so the user can verify a change
      // before they hit Save.
      const body: Record<string, unknown> = { to: testTo.trim() };
      if (host.trim()) body.host = host.trim();
      if (port) body.port = port;
      if (user.trim()) body.user = user.trim();
      if (pass.trim()) body.pass = pass.trim();
      if (from.trim()) body.from = from.trim();
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        "/mail/test",
        { method: "POST", body: JSON.stringify(body) },
      );
      if (res.ok) {
        toast({ variant: "success", title: "Test email sent", description: `Check ${testTo} now.` });
      } else {
        toast({ variant: "error", title: "Test failed", description: res.error ?? "Unknown error" });
      }
    } catch (err) {
      toast({ variant: "error", title: "Test failed", description: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <LoadingState label="Loading email settings..." />;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {/* Config form — 2/3 width */}
      <div className="xl:col-span-2 space-y-6">
        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
              <Mail className="size-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="flex-1">
              <CardTitle>SMTP Configuration</CardTitle>
              <CardDescription>
                Used for portal login invites, password resets, task notifications, and request updates. Credentials are stored encrypted on the server — only SUPER_ADMIN can view this page.
              </CardDescription>
            </div>
            <Badge
              tone={transportReady ? "positive" : "warning"}
              size="sm"
              dot
            >
              {transportReady ? "Active" : "Disabled"}
            </Badge>
          </div>

          {/* Status line */}
          {status && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${
              transportReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-200"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200"
            }`}>
              {transportReady ? <CheckCircle2 className="size-4 shrink-0 mt-0.5" /> : <AlertCircle className="size-4 shrink-0 mt-0.5" />}
              <span>{status}</span>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <FormField label="Provider preset">
              <Select
                value="custom"
                onValueChange={applyPreset}
                placeholder="Pick a preset to auto-fill host/port"
                options={Object.entries(PRESETS).map(([k, v]) => ({ value: k, label: v.label }))}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="SMTP host" required>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.titan.email"
                />
              </FormField>
              <FormField label="Port" required>
                <Input
                  type="number"
                  value={String(port)}
                  onChange={(e) => setPort(Number(e.target.value) || 587)}
                  placeholder="587"
                />
              </FormField>
            </div>

            <FormField label="Username (full email address)" required>
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="hello@yourdomain.com"
                autoComplete="username"
              />
            </FormField>

            <FormField label={passSet ? "Password (leave blank to keep current)" : "Password"} required={!passSet}>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={passSet ? "•••••••• (saved — type to replace)" : "Your SMTP password / app password"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FormField>

            <FormField label='From (e.g. "Tectomi ERP <noreply@yourdomain.com>")'>
              <Input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Defaults to the username address"
              />
            </FormField>

            <FormField label="Sending status">
              <Select
                value={enabled ? "true" : "false"}
                onValueChange={(v) => setEnabled(v === "true")}
                options={[
                  { value: "true", label: "Enabled — send real emails" },
                  { value: "false", label: "Disabled — log only, do not send" },
                ]}
              />
            </FormField>

            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => void load()}>Reset</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Test panel */}
        <Card>
          <CardTitle>Send a test email</CardTitle>
          <CardDescription>
            Verify your configuration before saving — uses the values currently in the form (typed password too), falling back to the saved credentials.
          </CardDescription>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField label="Send to">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                />
              </FormField>
            </div>
            <Button onClick={sendTest} disabled={testing || !testTo.trim()}>
              <Send className="mr-1 size-4" />
              {testing ? "Sending…" : "Send test"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Right rail — quick provider hints */}
      <div className="space-y-4">
        <Card>
          <CardTitle>Provider tips</CardTitle>
          <CardDescription>Quick setup notes for common providers.</CardDescription>
          <ul className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <li>
              <strong>Hostinger / Titan</strong> — Host <code>smtp.titan.email</code>, port 587. Use the mailbox password from hPanel → Emails, not your Hostinger account password.
            </li>
            <li>
              <strong>Gmail</strong> — Generate an{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
              >
                App Password
              </a>
              {" "}and use that instead of your account password. Requires 2FA on the Google account.
            </li>
            <li>
              <strong>Brevo</strong> — Free 300/day. SMTP key from <em>SMTP &amp; API → SMTP</em>; login is shown in the same panel.
            </li>
            <li>
              <strong>Office 365</strong> — User must have <em>Authenticated SMTP</em> enabled and use a real mailbox license. Port 587.
            </li>
          </ul>
        </Card>

        <Card>
          <CardTitle>What this powers</CardTitle>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <li>• Client-portal magic-link invites</li>
            <li>• Task assignment & comment notifications</li>
            <li>• Staff-request status updates</li>
            <li>• Password reset & welcome emails</li>
            <li>• Test emails from this page</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
