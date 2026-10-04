# Nuro7 Free Deployment Guide (മലയാളം)

**No cards, no dollar bills, no GCP** — 10 പേർക്കായി **100% free** deployment.

## 🎯 Stack

| Layer | Service | Free Limit | Card വേണോ? |
|---|---|---|---|
| Frontend (Next.js) | **Vercel** | 100 GB/മാസം | ❌ GitHub login |
| Backend API (NestJS) | **Render** | 750 hrs/മാസം | ❌ No card |
| Database (Postgres) | **Supabase** | 500 MB, Mumbai | ❌ No card |
| File uploads | **Supabase Storage** | 1 GB | ❌ No card |
| Keep API awake | **UptimeRobot** | 50 monitors | ❌ No card |
| Email | **Resend** | 3k emails/മാസം | ❌ No card |

**ആകെ ചെലവ്: ₹0/മാസം forever** — എവിടെയും card prompt വരില്ല ✅

## 🚀 Latency (India users)

| Service | Region | Latency from India |
|---|---|---|
| Vercel | Mumbai edge | ~30-50 ms |
| Render | **Singapore** | ~60-100 ms |
| Supabase | Mumbai | ~30 ms |

**Total API roundtrip: ~100-150 ms** — much better than GCP US (~250 ms) ✅

## ⚠️ ഒരേയൊരു Trade-off

Render free tier: **15 minutes idle → service sleeps → 30s cold start when wakes**.

**Fix**: UptimeRobot 5-minute pings → never sleeps. Free tier 750 hrs/month = exactly 24/7 ✅

---

## 📋 Phase 0: Prerequisites

- ✅ Custom domain (e.g. `nuro7.com`) — Cloudflare-ൽ already setup ഉണ്ടെങ്കിൽ better
- ✅ GitHub account with the nuro repo pushed
- ✅ ~1 hour സമയം

---

## 📌 Phase 1: All Accounts Create (15 മിനിറ്റ്)

ഒരുപാട് tabs open ചെയ്ത് എല്ലാം ഒറ്റ session-ൽ sign up ചെയ്യുക:

| # | Service | URL | Card വേണോ? |
|---|---|---|---|
| 1 | Supabase | https://supabase.com/dashboard/sign-up | ❌ |
| 2 | Render | https://render.com/register | ❌ |
| 3 | Vercel | https://vercel.com/signup → "Continue with GitHub" | ❌ |
| 4 | Resend | https://resend.com/signup | ❌ |
| 5 | UptimeRobot | https://uptimerobot.com/signUp | ❌ |
| 6 | cron-job.org | https://cron-job.org/en/signup/ | ❌ (Backup cron) |

എല്ലാം GitHub or Google sign-in support ചെയ്യും, fast signup.

---

## 📌 Phase 2: Supabase Setup (10 മിനിറ്റ്)

### 2.1 — Project Create

1. Supabase Dashboard → **New Project**
2. Settings:
   - Organization: നിങ്ങളുടെ org
   - Name: `nuro7`
   - Database Password: **strong password generate ചെയ്ത് save ചെയ്യുക** (പിന്നെ recover ചെയ്യാൻ പറ്റില്ല)
   - Region: **South Asia (Mumbai) — `ap-south-1`**
   - Plan: **Free**
3. **Create New Project**. ~2 മിനിറ്റ് wait.

### 2.2 — Database Connection String

1. Project Dashboard → **Settings** (gear) → **Database**
2. **Connection string** section → **URI** tab → **Transaction** mode (port 6543)
3. Copy ചെയ്യുക. Format:
   ```
   postgresql://postgres.xxxxxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```
4. `[YOUR-PASSWORD]` സ്ഥാനത്ത് password paste ചെയ്യുക
5. **അവസാനത്തിൽ `?pgbouncer=true` add ചെയ്യുക**:
   ```
   postgresql://...:6543/postgres?pgbouncer=true
   ```
6. ഈ string save ചെയ്യുക. ഇത് `DATABASE_URL`.

### 2.3 — Storage Bucket Create

1. Sidebar → **Storage**
2. **New bucket**
3. Name: `nuro-uploads`
4. **Public bucket**: ✅ enable (uploaded files-ലേക്ക് URL വഴി access ചെയ്യാൻ)
5. **Create bucket**

### 2.4 — Storage S3 Credentials

1. Storage page → **Settings** (top right) → **S3 Connection**
2. **Enable S3 connection** toggle on ചെയ്യുക
3. **New Access Key**
4. Description: `nuro-api`
5. Save:
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (e.g., `https://xxxxxxxxxxxx.supabase.co/storage/v1/s3`)

### 2.5 — Run Database Migrations

നിങ്ങളുടെ laptop-ൽ:

```bash
cd /Users/nifal/Documents/nuro

# Export the URL (പിന്നെ shell exit ചെയ്താൽ വീണ്ടും export ചെയ്യണം)
export DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Prisma generate
npm run db:generate

# Migrations apply
cd packages/db
npx prisma migrate deploy

# Optional: seed initial data
npx prisma db seed
```

Supabase Dashboard-ൽ Table Editor-ൽ പോയി tables എല്ലാം created ആണോ verify ചെയ്യുക.

---

## 📌 Phase 3: Code Push to GitHub (5 മിനിറ്റ്)

ഞങ്ങൾ already code-ൽ ഈ changes ചെയ്തു:

| File | What changed |
|---|---|
| `apps/api/src/main.ts` | `PORT` env var listen ചെയ്യാൻ |
| `apps/api/src/health.controller.ts` | **New** — `/health` endpoint |
| `apps/api/src/app.module.ts` | HealthController register |
| `apps/api/src/config/env.ts` | S3 config fields |
| `apps/api/src/common/storage/storage.service.ts` | S3 upload implementation |
| `apps/api/src/modules/documents/documents.controller.ts` | Memory storage + S3 |
| `apps/api/src/modules/notifications/notifications.gateway.ts` | Env CORS |
| `apps/api/package.json` | `@aws-sdk/client-s3` |
| `.env.example` | Production vars |
| `render.yaml` | **New** — Render Blueprint |

Push to GitHub:
```bash
cd /Users/nifal/Documents/nuro
git add .
git commit -m "feat: production deployment for Render + Vercel + Supabase"
git push origin main
```

---

## 📌 Phase 4: Deploy API to Render (15 മിനിറ്റ്)

### 4.1 — Blueprint Apply

1. https://dashboard.render.com → **Blueprints** → **New Blueprint Instance**
2. Connect GitHub → nuro repository select ചെയ്യുക
3. Branch: `main`
4. Render `render.yaml` automatic detect ചെയ്യും
5. Service name: `nuro-api` (default OK)
6. **Apply**

### 4.2 — Environment Variables Set

Service creation page-ൽ Render-ൽ pending env vars ask ചെയ്യും. ഈ values fill ചെയ്യുക:

| Key | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler URL (with `?pgbouncer=true`) |
| `JWT_ACCESS_SECRET` | Generate: `openssl rand -hex 32` (laptop terminal-ൽ) |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 32` (different value) |
| `AWS_ACCESS_KEY_ID` | Supabase Storage S3 Access Key |
| `AWS_SECRET_ACCESS_KEY` | Supabase Storage S3 Secret |
| `AWS_S3_ENDPOINT` | `https://xxx.supabase.co/storage/v1/s3` |
| `AWS_S3_PUBLIC_URL` | `https://xxx.supabase.co/storage/v1/object/public/nuro-uploads` |
| `SMTP_PASS` | Resend API key (Phase 5-ൽ create ചെയ്യും — temporary `re_test` value vech-സ്ഥാപിക്കാം) |
| `CORS_ORIGIN` | Initially `https://temporary.com` — Vercel deploy-നു ശേഷം update ചെയ്യാം |
| `APP_URL` | Initially `https://temporary.com` — same |
| `API_URL` | Render service URL/api/v1 (next step-ൽ കിട്ടും) |

### 4.3 — First Deploy

**Create Web Service** click ചെയ്യുക. Render Docker image build ചെയ്യും — ~5-10 മിനിറ്റ്.

Build logs watch ചെയ്യുക. "Live" status വന്നാൽ ✅

Service URL format: `https://nuro-api-xxxx.onrender.com`

### 4.4 — Verify API Live

```bash
curl https://nuro-api-xxxx.onrender.com/api/v1/health
```

Expected output:
```json
{"status":"ok","timestamp":"2026-...","uptime":12.34}
```

`status: ok` കണ്ടാൽ ✅ API live ആണ്.

---

## 📌 Phase 5: Resend Email Setup (5 മിനിറ്റ്)

### 5.1 — API Key Create

1. Resend Dashboard → **API Keys** → **Create API Key**
2. Name: `nuro-api`
3. Permission: Sending access
4. Domain: All domains (default)
5. **Create** → API key copy ചെയ്യുക (`re_...`)

### 5.2 — Render-ൽ Update

1. Render Dashboard → `nuro-api` → **Environment** tab
2. `SMTP_PASS` → Resend API key paste ചെയ്യുക
3. Save → service auto-redeploys

### 5.3 — Domain Verify (Optional, എന്നാൽ recommended)

1. Resend → **Domains** → **Add Domain** → `nuro7.com`
2. DNS records കാണിക്കും (3 TXT/CNAME records)
3. Cloudflare DNS-ൽ ഈ records add ചെയ്യുക
4. **Verify** click ചെയ്യുക

Verify ചെയ്തില്ലെങ്കിലും `onboarding@resend.dev` address-ൽ നിന്ന് emails പോകും.

---

## 📌 Phase 6: Vercel-ൽ Frontend Deploy (10 മിനിറ്റ്)

### 6.1 — Import Project

1. https://vercel.com/new
2. GitHub repo `nuro` import ചെയ്യുക
3. Configure project:
   - **Framework Preset**: Next.js (auto)
   - **Root Directory**: `apps/web` → **Edit** click ചെയ്ത് `apps/web` select ചെയ്യുക
   - **Build Command**: default (`next build`)
   - **Output Directory**: default

### 6.2 — Environment Variables

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://nuro-api-xxxx.onrender.com/api/v1` (Render URL) |

### 6.3 — Deploy

**Deploy** button click ചെയ്യുക. ~3 മിനിറ്റ്.

Vercel ഒരു URL തരും: `https://nuro-xxxx.vercel.app` — open ചെയ്ത് app load ആകുന്നുണ്ടോ check ചെയ്യുക.

### 6.4 — Custom Domain Add

1. Vercel project → **Settings** → **Domains**
2. Add: `nuro7.com` (or your domain)
3. DNS records കാണിക്കും — domain registrar-ൽ add ചെയ്യുക
4. Verify ആകാൻ 5-30 മിനിറ്റ്

---

## 📌 Phase 7: CORS Update (5 മിനിറ്റ്)

ഇപ്പോൾ Vercel URL ഉണ്ട്. Render-ൽ CORS update ചെയ്യണം.

1. Render Dashboard → `nuro-api` → **Environment**
2. `CORS_ORIGIN` → update ചെയ്യുക:
   ```
   https://nuro7.com,https://www.nuro7.com,https://nuro-xxxx.vercel.app
   ```
3. `APP_URL` → `https://nuro7.com`
4. `API_URL` → `https://nuro-api-xxxx.onrender.com/api/v1`
5. Save → Render auto-redeploys (~2 മിനിറ്റ്)

---

## 📌 Phase 8: UptimeRobot Keep-Alive Setup (5 മിനിറ്റ്) — Critical!

Render free 15 min idle-ൽ sleep ആകും. UptimeRobot 5 മിനിറ്റിൽ ഒരിക്കൽ ping ചെയ്താൽ never sleep ✅

### 8.1 — API Monitor

1. UptimeRobot Dashboard → **+ Add New Monitor**
2. Settings:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `Nuro API Keep-Alive`
   - URL: `https://nuro-api-xxxx.onrender.com/api/v1/health`
   - Monitoring Interval: **5 minutes**
   - Alert contacts: നിങ്ങളുടെ email
3. **Create Monitor**

### 8.2 — Frontend Monitor

1. **+ Add New Monitor**
2. Settings:
   - Type: HTTP(s)
   - Name: `Nuro Frontend`
   - URL: `https://nuro7.com`
   - Interval: 5 minutes
3. **Create**

ഇപ്പോൾ 24/7 monitoring + API auto-keep-alive ✅

---

## 📌 Phase 9: Final Testing (10 മിനിറ്റ്)

ഈ tests എല്ലാം പാസ് ആകണം:

| Test | Steps | Expected |
|---|---|---|
| Frontend loads | `https://nuro7.com` | Login page |
| API health | `https://nuro-api-xxxx.onrender.com/api/v1/health` | `{"status":"ok"...}` |
| Login | Existing user-ൽ login ചെയ്യുക | Dashboard കാണുന്നു |
| API connection | Browser DevTools → Network tab | API calls 200 status |
| WebSocket | Console-ൽ socket.io connection log | "connected" message |
| File upload | Documents → upload file | Supabase Storage bucket-ൽ file appear ആകുന്നു |
| File view | Uploaded file URL click | File download/view ആകുന്നു |
| PDF generation | Invoice/proposal → Download PDF | Download ആകുന്നു |
| Cold start (test) | UptimeRobot disable ചെയ്ത് 20 min wait → first request | Slow (~30s) → after warm, fast |

---

## 📌 Phase 10: Daily Backup (Optional but Recommended)

Supabase free tier-ൽ daily auto-backup ഉണ്ട് (7 days retention). പുറത്ത് backup വേണമെങ്കിൽ:

### Local Backup Script (laptop-ൽ)

```bash
# ~/backup-nuro.sh
#!/bin/bash
DATABASE_URL="<your-supabase-url>"
mkdir -p ~/nuro-backups
TIMESTAMP=$(date +%F)
pg_dump "$DATABASE_URL" | gzip > ~/nuro-backups/db-$TIMESTAMP.sql.gz
# 30 days-നു മേലെ delete
find ~/nuro-backups -name "db-*.sql.gz" -mtime +30 -delete
```

```bash
chmod +x ~/backup-nuro.sh
# Mac cron: crontab -e → Daily 2 AM
0 2 * * * /Users/nifal/backup-nuro.sh
```

---

## 🎉 Done! Architecture Summary

```
                Users (10 teammates, India)
                        │
                        ▼
            ┌──────────────────────┐
            │  https://nuro7.com   │
            │   Vercel (Mumbai)    │  ← Next.js, fast static
            └──────────┬───────────┘
                       │ API calls
                       ▼
       ┌───────────────────────────────┐
       │ nuro-api.onrender.com         │
       │ Render free (Singapore)       │  ← NestJS + WebSocket + cron
       │ Kept awake by UptimeRobot     │
       └─────┬─────────────────────┬───┘
             │                     │
             ▼                     ▼
    ┌────────────────┐   ┌──────────────────┐
    │ Supabase DB    │   │ Supabase Storage │
    │ Postgres       │   │ 1 GB free        │
    │ Mumbai region  │   │ S3-compatible    │
    └────────────────┘   └──────────────────┘
                       │
                       ▼
                ┌──────────────┐
                │ Resend SMTP  │
                │ 3k/mo free   │
                └──────────────┘
```

**Total monthly cost: ₹0** ✅
**India API latency: ~100-150ms** ✅
**All features work**: WebSocket, cron, uploads, PDF, email ✅

---

## 🆘 Troubleshooting

### "Service Unavailable" / 502 from Render
- Render Dashboard → service → **Logs** tab → check errors
- Most common: `DATABASE_URL` wrong, or missing env var
- Fix env var → Manual Deploy → "Deploy latest commit"

### Frontend shows "Failed to fetch"
- Render service running ആണോ check ചെയ്യുക
- `NEXT_PUBLIC_API_URL` correct ആണോ Vercel-ൽ check ചെയ്യുക
- `CORS_ORIGIN` Vercel domain include ചെയ്തിട്ടുണ്ടോ Render-ൽ check ചെയ്യുക
- Browser DevTools → Network tab → exact error കാണുക

### Render service keeps sleeping despite UptimeRobot
- UptimeRobot interval **5 min** ആണോ check ചെയ്യുക (15+ ആയാൽ sleep ആകും)
- Monitor URL `/api/v1/health` ആണോ confirm ചെയ്യുക
- UptimeRobot monitor "Up" status കാണിക്കുന്നുണ്ടോ

### File upload fails
- Supabase Storage bucket **Public** ആണോ check ചെയ്യുക
- S3 credentials Render env vars-ൽ correct ആണോ
- Endpoint URL format: `https://xxx.supabase.co/storage/v1/s3` (trailing slash ഇല്ലാതെ)

### WebSocket connection failure
- Browser console-ൽ exact error കാണുക
- `CORS_ORIGIN` Vercel/custom domain include ചെയ്തിട്ടുണ്ടോ
- Render dashboard → service → **Settings** → "Health Check Path" `/api/v1/health` ആണോ

### Database "Too many connections"
- Pooler URL ഉപയോഗിക്കുന്നുണ്ടോ check ചെയ്യുക (port **6543**, അല്ലാതെ 5432 വേണ്ട)
- `?pgbouncer=true` query param add ചെയ്തിട്ടുണ്ടോ

---

## 💡 Tips

1. **Code update ചെയ്യാൻ**: GitHub-ലേക്ക് push ചെയ്യുക → Render + Vercel auto-deploy ആകും
2. **Logs കാണാൻ**: Render Dashboard → service → Logs tab (real-time)
3. **DB inspect ചെയ്യാൻ**: Supabase Dashboard → Table Editor (visual GUI)
4. **Free tier limits monitor ചെയ്യാൻ**:
   - Render: Dashboard → Service → Metrics
   - Supabase: Dashboard → Settings → Usage
   - Vercel: Dashboard → Project → Analytics
5. **10+ users-ലേക്ക് scale ചെയ്യാൻ**: Render Starter ($7/mo, no sleep) + Supabase Pro ($25/mo) — total ~$32/mo

---

## 📊 What to Monitor Weekly

| Metric | Where | OK Range |
|---|---|---|
| Render uptime | UptimeRobot | >99% |
| Render hours used | Render → Metrics | <750/month |
| Supabase DB size | Supabase → Settings → Usage | <400 MB |
| Supabase Storage | Supabase → Storage | <800 MB |
| Vercel bandwidth | Vercel → Analytics | <50 GB/month |
| Resend emails sent | Resend → Logs | <2,500/month |
