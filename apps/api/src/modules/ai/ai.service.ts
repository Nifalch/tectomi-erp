import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

/**
 * Output schema returned by the AI to pre-fill the New Proposal form.
 *
 * Mirrors the proposal create DTO so the frontend can drop the result
 * straight into form state without further mapping.
 *
 * Phase structure note — the model returns each phase as four discrete
 * fields (summary, deliverables[], acceptance, plus optional traceFrom
 * for auditability). `content` is composed server-side in `normalize`
 * from those structured fields and is the line-broken bullet list the
 * printed proposal already knows how to parse. Returning structure
 * (not prose) is the single biggest lever for faithful output —
 * Gemini will reliably fill an array of short strings; it drifts when
 * asked to "write a paragraph with bullets inside".
 */
export interface GeneratedProposal {
  projectName: string;
  description: string;
  projectUnderstanding: string;
  pricing: string;
  paymentTermsText: string;
  /** Total estimated effort in hours across all phases. Used so the user can sanity-check the quote. */
  totalHours?: number;
  /** Hourly rate the quote was built on (so the user can cross-check the math). */
  hourlyRate?: number;
  /** 3–5 outcome statements the engagement delivers (used in the cover summary). */
  keyOutcomes?: string[];
  blocks: Array<{
    heading: string;
    /** One-sentence summary of what this phase accomplishes. */
    summary?: string;
    /** Concrete deliverables for this phase. Each becomes one bullet in the printed proposal. */
    deliverables?: string[];
    /** Acceptance criterion — how the client verifies the phase is "done". */
    acceptance?: string;
    /** Phrase from the client brief this phase traces back to (auditability). */
    traceFrom?: string;
    /** Composed line-broken bullet text — generated in `normalize` from the structured fields above. */
    content: string;
    durationWeeks: number;
    /** Estimated effort for this phase in hours. The sum across all phases drives `pricing`. */
    hoursEstimate?: number;
  }>;
  deliverables: Array<{
    kind: "INCLUDED" | "EXCLUDED";
    title: string;
    description: string;
    amount?: number;
  }>;
}

/**
 * AiService — talks to Google Gemini (free tier) and returns structured
 * proposal content from a free-text client requirement.
 *
 * Why Gemini? Generous free tier (1M tokens/day on gemini-1.5-flash),
 * solid JSON-mode support, and a stable REST endpoint — no SDK weight needed.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** Primary model — gemini-2.5-flash gives the best quality on Google's
   *  free tier for structured proposal/plan generation. It can hit 503
   *  "high demand" at peak hours; the fallback chain below catches that. */
  private readonly MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  /** Fallback models to try in order when the primary returns 503 (high
   *  demand) or 429 (rate-limited). Ordered "next-best quality first" so
   *  the user gets the strongest output Gemini can give them at any moment.
   *  All are real production Gemini models with structured-output support. */
  private readonly FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
  ];

  /**
   * Generate a complete proposal payload from a client requirement.
   *
   * @param requirement Free-text description of what the client needs.
   *                    Can include client name, project goals, scope hints, anything.
   * @param hints       Optional structured hints (clientName, projectName, durationWeeks)
   *                    that nudge the model toward consistent details.
   */
  async generateProposal(
    requirement: string,
    hints: {
      clientName?: string;
      projectName?: string;
      durationWeeks?: number;
      hourlyRate?: number;
      currency?: string;
    } = {},
  ): Promise<GeneratedProposal> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "AI generation is not configured. Set GEMINI_API_KEY in the API environment.",
      );
    }

    const trimmed = requirement.trim();
    if (trimmed.length < 12) {
      throw new BadGatewayException("Please describe the client requirement in more detail (at least a sentence or two).");
    }
    // Hard cap on the size of free-text we hand to the model. Prevents
    // both runaway token cost and trivial prompt-injection escapes that
    // would require many thousands of chars to stage. 5k chars is more
    // than any legitimate scoping note.
    if (trimmed.length > 5000) {
      throw new BadGatewayException("Requirement is too long. Please trim it to 5000 characters or fewer.");
    }

    const prompt = this.buildPrompt(trimmed, hints);
    const { text } = await this.callGeminiWithFallback(apiKey, {
      prompt,
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        // Force structured JSON output — Gemini honours responseMimeType.
        responseMimeType: "application/json",
        responseSchema: this.responseSchema(),
        maxOutputTokens: 4096,
      },
    });

    let parsed: GeneratedProposal;
    try {
      parsed = JSON.parse(text) as GeneratedProposal;
    } catch (err) {
      this.logger.error("Could not parse AI response as JSON", err as Error);
      this.logger.debug(`Raw response: ${text.slice(0, 500)}`);
      throw new BadGatewayException("AI returned malformed content. Please retry.");
    }

    return this.normalize(parsed, hints);
  }

  /**
   * Calls the Gemini API and auto-falls-back to alternate models when the
   * primary one returns 503 (UNAVAILABLE — "high demand") or 429 (rate
   * limited). The Gemini free tier moves capacity around between models
   * frequently, so this lets all our AI features keep working when one
   * specific model is hot.
   *
   * Returns the candidate text AND its finishReason (callers need the
   * latter to detect MAX_TOKENS truncation). Throws BadGatewayException
   * with a human-readable message when every model attempt fails.
   */
  private async callGeminiWithFallback(
    apiKey: string,
    args: {
      prompt: string;
      generationConfig: Record<string, unknown>;
    },
  ): Promise<{ text: string; finishReason: string | undefined; modelUsed: string }> {
    // Build the model rotation: try the env-configured primary first, then
    // the documented fallbacks (dedupe so we don't try the same model twice).
    const order = Array.from(new Set([this.MODEL, ...this.FALLBACK_MODELS]));

    let lastStatus = 0;
    let lastBody = "";
    for (const model of order) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: args.prompt }] }],
            generationConfig: args.generationConfig,
          }),
        });
      } catch (err) {
        this.logger.warn(`Gemini ${model} fetch failed: ${(err as Error).message}`);
        lastStatus = 0;
        lastBody = (err as Error).message;
        continue; // try the next model
      }

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text ?? "";
        if (!text) {
          throw new BadGatewayException("AI service returned an empty response. Please retry.");
        }
        if (model !== this.MODEL) {
          this.logger.log(`Gemini fallback succeeded on ${model} (primary ${this.MODEL} was unavailable)`);
        }
        return { text, finishReason: candidate?.finishReason, modelUsed: model };
      }

      lastStatus = response.status;
      lastBody = await response.text().catch(() => "");
      // 503 / 429 are recoverable on a different model. Anything else is a
      // hard error (bad request, auth, model not found) and won't get better
      // by trying a different model — fail fast.
      const isRecoverable = response.status === 503 || response.status === 429;
      this.logger.warn(`Gemini ${model} returned ${response.status}: ${lastBody.slice(0, 200)}`);
      if (!isRecoverable) break;
    }

    // Specialized error messages so the user knows whether to retry, fix
    // their key, or call support.
    const lower = lastBody.toLowerCase();
    const isAuthError =
      lastStatus === 400 || lastStatus === 401 || lastStatus === 403 ||
      lower.includes("api_key_invalid") || lower.includes("api key not valid");
    // "Quota exceeded ... limit: 0" means the key has no free-tier allowance
    // provisioned — not a transient rate limit. Tell the user to regenerate
    // their key via AI Studio (which auto-attaches free quota).
    const isQuotaZero =
      lastStatus === 429 &&
      (lower.includes("limit: 0") || lower.includes("quota exceeded"));

    if (isQuotaZero) {
      throw new BadGatewayException(
        "Your Gemini key has no free-tier quota allocated (limit: 0). The key was likely created via Google Cloud Console instead of AI Studio. Create a fresh key at https://aistudio.google.com/apikey (use 'Create API key in new project'), paste it into apps/api/.env, then restart the API.",
      );
    }
    if (isAuthError) {
      throw new BadGatewayException(
        "Gemini rejected the API key. Open apps/api/.env, paste a fresh key from https://aistudio.google.com/apikey (no quotes, no trailing space), then restart the API.",
      );
    }
    if (lastStatus === 503) {
      throw new BadGatewayException(
        "All AI models are at capacity right now. Try again in 1–2 minutes — Gemini's free-tier capacity fluctuates throughout the day.",
      );
    }
    if (lastStatus === 429) {
      throw new BadGatewayException(
        "AI rate limit hit across all fallback models. Wait a minute and retry.",
      );
    }
    throw new BadGatewayException(
      lastBody
        ? `AI service error (${lastStatus}): ${lastBody.slice(0, 200)}`
        : "Could not reach the AI service. Check your network and try again.",
    );
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The prompt brief. The single most important rule here is FAITHFULNESS:
   * the model must extract phases and deliverables from the actual client
   * brief, not pad with generic agency boilerplate. Structure (an array
   * of short strings per phase) is enforced at the schema level so the
   * model can't return prose where bullets are expected.
   */
  private buildPrompt(
    requirement: string,
    hints: { clientName?: string; projectName?: string; durationWeeks?: number; hourlyRate?: number; currency?: string },
  ): string {
    const hourlyRate = hints.hourlyRate ?? 900;
    const currency = hints.currency ?? "INR";
    const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "AED" ? "AED " : currency + " ";
    const rateLabel = `${symbol}${hourlyRate.toLocaleString("en-IN")}/hour`;

    const hintLines = [
      hints.clientName ? `Client name: ${hints.clientName}` : null,
      hints.projectName ? `Project name: ${hints.projectName}` : null,
      hints.durationWeeks ? `Target duration: ${hints.durationWeeks} weeks` : null,
      `Hourly rate (your billing rate): ${rateLabel}`,
    ]
      .filter(Boolean)
      .join("\n");

    return `You are a senior project lead at Tectomi (software, AI automation, e-commerce, cybersecurity) writing a real client-facing proposal. The brief below was scribbled by a salesperson during a discovery call — it will be casual, may contain typos, and may use the client's informal phrasing. Your job is to TRANSLATE it into a polished, standardised consulting proposal. Reflect the SUBSTANCE of the brief, but never the literal wording.

═══ BRIEF (substance only — do NOT echo the wording) ═══
"""
${requirement}
"""

${hintLines ? `═══ CONTEXT ═══\n${hintLines}\n` : ""}
═══ THE THREE RULES (READ TWICE) ═══

RULE 1 · FAITHFUL TO SUBSTANCE, NOT TO PHRASING
Identify what the brief is ASKING FOR (the problem, the goal, the constraints, the tech mentioned, the budget/timeline hints). Then rewrite ALL of that in professional consulting prose. Forbidden behaviors:
  • Copying sentences, fragments, or distinctive phrases from the brief verbatim. If a phrase from the brief appears word-for-word in the output, you have failed Rule 1.
  • Echoing typos, casual abbreviations, slang, or chat-style punctuation ("plz", "asap", "tbh", multiple exclamation marks, ALL-CAPS shouting).
  • Quoting the client back to themselves. Restate the problem in YOUR language — the language of a senior consultant who has read 100 similar briefs.
However: every phase, deliverable and outcome you generate MUST trace back to something in the brief — fill \`traceFrom\` with a SHORT PARAPHRASE of the underlying ask (e.g. "client wants mobile checkout to convert better", NOT "fix the slow checkout man pls"). Banned scope additions unless the brief explicitly names them: SEO, analytics dashboards, loyalty programs, email automation, multi-language, native mobile apps, generic "future-proofing" / "scalability" work.

RULE 2 · STRUCTURE OVER PROSE
Each phase is composed of FOUR distinct fields — do not write paragraphs in any of them:
  • heading           — short title (max 60 chars). Name the actual work (e.g. "Shopify Checkout Rebuild & Cart Liquid Refactor").
  • summary           — ONE sentence on what the phase accomplishes.
  • deliverables[]    — 4–7 short strings. Each is one concrete artefact: an API endpoint, screen, integration, schema, runbook, test plan. Name the technology / vendor where relevant (e.g. "Razorpay webhook handler with retry + dead-letter queue", "PostgreSQL schema for analytics aggregates"). NO sub-bullets, NO paragraphs.
  • acceptance        — ONE sentence on how the client verifies "done" (e.g. "QA pass on staging + green canary deploy with <0.5% checkout-error rate over 48h").

RULE 3 · MATH MUST HOLD
Sum each phase's \`hoursEstimate\` to get totalHours. Total cost = totalHours × ${hourlyRate}. Round headline to the nearest ${symbol}${currency === "INR" ? "5,000" : "500"}. The \`pricing\` string is "${symbol}{total} · {totalHours} hours @ ${rateLabel}". Don't fabricate prices — they must follow from the work.

═══ KERALA-CALIBRATED ESTIMATES (use the LEAN half — internal scaffolding exists for auth, schema, payment webhooks, dashboard shells, Shopify starters) ═══
• Bug fix / config tweak: 0.5–2h · New screen + API + tests: 4–8h · CRUD module: 8–16h
• Auth (email+JWT or OAuth): 6–12h · Payments (Stripe/Razorpay + webhook + portal): 12–24h
• AI/RAG pipeline v1: 24–48h · Production-grade RAG: 40–80h · Agent (3–5 tools + UI): 40–80h
• Shopify section/block: 2–5h · Full custom Shopify theme: 40–80h · Headless storefront: 20–40h
• Next.js dashboard (10–20 screens): 40–80h · Migration + dry-run + cutover: 10–24h
• QA pass + e2e suite: 12–24h · Launch checklist + canary deploy: 1–3h
1 week = 42 productive hours (Mon–Sat, 7h/day). hoursEstimate / 42 ≤ durationWeeks.

═══ HOUSE STYLE (apply to every text field) ═══
• Voice: senior consultant talking to a peer. Confident, specific, never breathless.
• Sentence shape: short, declarative, third-person ("We will…", "The team will…"). No "you guys", no second-person finger-wagging.
• Vocabulary: precise technical/business terms. Drop "world-class", "leverage", "synergy", "cutting-edge", "robust", "seamless", "best-in-class", "next-gen". Drop emojis and exclamation marks entirely.
• Capitalisation: Title Case for headings, sentence case for descriptions. Never ALL-CAPS for emphasis (the layout handles emphasis).
• Numbers: Indian numbering with the ${symbol} symbol where amounts appear. Spell out durations as "4 weeks", not "4w".
• Polish defense: imagine a partner at McKinsey reads the output before it's sent. Every line must survive that read.

FIELD GUIDANCE — apply the house style strictly:
• projectName (≤ 80 chars) — Title Case, names the deliverable + client (e.g. "Shopify Checkout Rebuild — Acme Retail Co.").
• description (2–3 sentences, ~50–80 words) — Lead with the OUTCOME, then how it's reached, then the concrete artefact the client receives. Rewritten consultant prose, never a paraphrase of the brief's sentences.
• projectUnderstanding (3–4 sentences, ~80–120 words) — Restate the client's situation in YOUR language: their current state, the friction or risk, the underlying business goal, and the implicit requirements. Where the brief gave concrete numbers ("12 hours/week", "8% drop-off"), use them; where it didn't, describe friction qualitatively — never invent metrics the brief didn't state. This paragraph proves the team understood the problem; it must NOT contain any sentence that could be mistaken for a copy-paste from the brief.
• keyOutcomes (3–5 short strings) — Outcome statements only, not features. ("Mobile checkout completion ≥ 75%", "Order-sync to OMS within 60s", "Operations team reclaims ~8 hours/week"). Only outcomes the brief implies.
• paymentTermsText — exactly 3 lines, one milestone per line, "{percent}% — {label}". Default 50/30/20 unless the brief explicitly specifies otherwise.

═══ EXCLUDED LIST (scope-creep protection) ═══
Include 8–14 EXCLUDED items. Always cover these categories where they plausibly apply: Hosting & Domain · Third-Party API/SaaS costs (Stripe/Razorpay/OpenAI/Twilio/SendGrid/Klaviyo/cloud bills) · Content & Copywriting · Photography & Video · Graphic Design & Branding · Translation & Localisation · Paid Marketing & SEO services · Long-term Maintenance (beyond 14-day warranty) · Native Mobile Apps · Data Migration beyond stated volumes · Third-Party Platform admin access · Out-of-Hours work (billed 1.5×) · plus engagement-specific exclusions (e.g. if it's a SaaS build: "Native iOS app"; if it's a Shopify build: "Magento migration").

The FINAL EXCLUDED item must be titled exactly "Anything not listed above" with description: "Any feature, integration, or scope addition not explicitly listed in the Included Deliverables is treated as a new feature and quoted separately as a Change Request."

═══ INCLUDED DELIVERABLES ═══
6–10 INCLUDED items — these are the headline things the client receives. Each may carry an \`amount\` (integer ${currency}); when amounts are present, the sum should land within ±5% of the headline price.

═══ PHASE 1 GUARANTEE (non-negotiable) ═══
The first phase's \`acceptance\` field MUST contain the exact risk-reversal language: "If we don't surface 3+ automation/optimisation opportunities worth more than the phase fee, the phase fee is refunded."

Return ONLY the JSON object. No markdown, no preamble, no commentary.`;
  }

  /** JSON schema that Gemini honours for structured output.
   *  Note `content` is INTENTIONALLY omitted from the model's output —
   *  we compose it server-side in `normalize` from summary/deliverables/
   *  acceptance so the model can't dump prose where bullets are required. */
  private responseSchema(): unknown {
    return {
      type: "object",
      properties: {
        projectName: { type: "string" },
        description: { type: "string" },
        projectUnderstanding: { type: "string" },
        pricing: { type: "string" },
        paymentTermsText: { type: "string" },
        totalHours: { type: "integer" },
        hourlyRate: { type: "integer" },
        keyOutcomes: {
          type: "array",
          items: { type: "string" },
        },
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              summary: { type: "string" },
              deliverables: {
                type: "array",
                items: { type: "string" },
              },
              acceptance: { type: "string" },
              traceFrom: { type: "string" },
              durationWeeks: { type: "integer" },
              hoursEstimate: { type: "integer" },
            },
            required: [
              "heading",
              "summary",
              "deliverables",
              "acceptance",
              "durationWeeks",
              "hoursEstimate",
            ],
          },
        },
        deliverables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["INCLUDED", "EXCLUDED"] },
              title: { type: "string" },
              description: { type: "string" },
              amount: { type: "number" },
            },
            required: ["kind", "title", "description"],
          },
        },
      },
      required: [
        "projectName",
        "description",
        "projectUnderstanding",
        "pricing",
        "paymentTermsText",
        "totalHours",
        "hourlyRate",
        "blocks",
        "deliverables",
      ],
    };
  }

  /** Defensive normalization — clamp values, strip empties, apply hints, and
   *  derive missing fields server-side so the user can always cross-check the math.
   *
   *  Critical responsibility: COMPOSE the legacy `content` string from the
   *  structured per-phase fields (summary, deliverables[], acceptance). The
   *  printed proposal parses `content` line-by-line for bullets, so we emit:
   *      <summary>
   *      • <deliverable 1>
   *      • <deliverable 2>
   *      ...
   *      Acceptance: <acceptance>
   *  …which is exactly what the existing renderer expects.
   */
  private normalize(
    p: GeneratedProposal,
    hints: {
      clientName?: string;
      projectName?: string;
      durationWeeks?: number;
      hourlyRate?: number;
      currency?: string;
    },
  ): GeneratedProposal {
    const hourlyRate = hints.hourlyRate ?? p.hourlyRate ?? 900;
    const symbol = (hints.currency ?? "INR") === "INR" ? "₹"
                  : (hints.currency ?? "INR") === "USD" ? "$"
                  : (hints.currency ?? "INR") + " ";

    const blocks = (p.blocks ?? [])
      .filter((b) => b.heading?.trim())
      .map((b) => {
        const durationWeeks = Math.max(1, Math.min(12, Math.round(b.durationWeeks ?? 1)));
        // If the model didn't provide hours, infer from durationWeeks × 42h/week
        // (Kerala team works Mon–Sat, 7h productive/day).
        const hoursEstimate = Math.max(
          1,
          Math.round(typeof b.hoursEstimate === "number" && b.hoursEstimate > 0 ? b.hoursEstimate : durationWeeks * 42),
        );

        // Compose the bullet-list `content` from the structured fields. We
        // first honour the model's `content` if (legacy) provided, otherwise
        // build it from summary + deliverables + acceptance.
        const summary = (b.summary ?? "").trim();
        const acceptance = (b.acceptance ?? "").trim();
        const phaseDeliverables = Array.isArray(b.deliverables)
          ? b.deliverables.map((d) => (d ?? "").toString().trim()).filter(Boolean)
          : [];

        let content = (b.content ?? "").trim();
        if (!content) {
          const lines: string[] = [];
          if (summary) lines.push(summary);
          for (const d of phaseDeliverables) {
            // strip any existing leading bullet/dash to avoid "• • Item"
            const clean = d.replace(/^[•\-*▸►]\s*/, "").trim();
            if (clean) lines.push(`• ${clean}`);
          }
          if (acceptance) {
            // The renderer doesn't need a "Acceptance:" prefix; it just renders
            // each non-empty line as a bullet. Keep the label so the human
            // reader sees the same intent as in the AI brief.
            lines.push(`Acceptance: ${acceptance.replace(/^acceptance[:\s]*/i, "")}`);
          }
          content = lines.join("\n");
        }

        return {
          heading: b.heading.trim().slice(0, 120),
          summary: summary || undefined,
          deliverables: phaseDeliverables.length ? phaseDeliverables : undefined,
          acceptance: acceptance || undefined,
          traceFrom: (b.traceFrom ?? "").trim() || undefined,
          content,
          durationWeeks,
          hoursEstimate,
        };
      })
      .slice(0, 6);

    const totalHours = blocks.reduce((s, b) => s + (b.hoursEstimate ?? 0), 0)
      || Math.round(p.totalHours ?? 0)
      || 0;

    // Round headline price to a clean ₹5,000 step in INR (better optics on a quote).
    const rawPrice = totalHours * hourlyRate;
    const roundStep = (hints.currency ?? "INR") === "INR" ? 5000 : 500;
    const total = Math.max(roundStep, Math.round(rawPrice / roundStep) * roundStep);

    // Always derive the canonical pricing string from our (validated) math.
    // If the model gave us one, prefer it ONLY when it already matches our
    // computed total — otherwise the salesperson sees two conflicting numbers.
    const canonicalPricing = `${symbol}${total.toLocaleString("en-IN")} · ${totalHours} hours @ ${symbol}${hourlyRate.toLocaleString("en-IN")}/hour`;
    const modelPricing = (p.pricing ?? "").trim();
    const pricing =
      modelPricing && modelPricing.includes(total.toLocaleString("en-IN"))
        ? modelPricing
        : canonicalPricing;

    const keyOutcomes = Array.isArray(p.keyOutcomes)
      ? p.keyOutcomes.map((o) => (o ?? "").toString().trim()).filter(Boolean).slice(0, 6)
      : undefined;

    return {
      projectName: (hints.projectName?.trim() || p.projectName || "Untitled Project").slice(0, 120),
      description: (p.description ?? "").trim(),
      projectUnderstanding: (p.projectUnderstanding ?? "").trim(),
      pricing,
      paymentTermsText:
        (p.paymentTermsText ?? "").trim() ||
        "50% Advance — Project kick-off\n30% Mid-project — End of design phase\n20% Final — On launch & handoff",
      totalHours,
      hourlyRate,
      keyOutcomes: keyOutcomes && keyOutcomes.length ? keyOutcomes : undefined,
      blocks,
      deliverables: (p.deliverables ?? [])
        .filter((d) => d.title?.trim() && (d.kind === "INCLUDED" || d.kind === "EXCLUDED"))
        .map((d) => ({
          kind: d.kind,
          title: d.title.trim(),
          description: (d.description ?? "").trim(),
          amount: d.kind === "INCLUDED" && typeof d.amount === "number" && d.amount > 0
            ? Math.round(d.amount)
            : undefined,
        }))
        .slice(0, 28),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT PLAN GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a full project plan — milestones + tasks with assignments
   * + due dates — from a free-text requirement plus structured context
   * about the project (budget, dates, team).
   *
   * The plan is for *preview*: the caller (ProjectsController) does not
   * persist anything until the user has reviewed/edited the result and
   * sent it back via the apply endpoint.
   */
  async generateProjectPlan(input: GenerateProjectPlanInput): Promise<GeneratedProjectPlan> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "AI generation is not configured. Set GEMINI_API_KEY in the API environment.",
      );
    }
    const requirement = (input.requirement ?? "").trim();
    if (requirement.length < 12) {
      throw new BadGatewayException("Please describe the project requirement in more detail (at least a sentence or two).");
    }
    if (requirement.length > 5000) {
      throw new BadGatewayException("Requirement is too long. Please trim it to 5000 characters or fewer.");
    }

    const prompt = this.buildPlanPrompt(requirement, input);
    const { text, finishReason } = await this.callGeminiWithFallback(apiKey, {
      prompt,
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        responseMimeType: "application/json",
        responseSchema: this.planResponseSchema(),
        // gemini-2.5-flash supports up to 65k output tokens. A full
        // project plan with 25 detailed tasks comfortably sits below
        // 16k, but we leave headroom so descriptions don't get
        // truncated mid-string (truncation = unparseable JSON).
        maxOutputTokens: 32768,
      },
    });

    const parsed = this.parsePlanJson(text);
    if (!parsed) {
      // If Gemini hit the output token cap mid-stream the JSON is
      // truncated and won't parse. Log the finish reason + a snippet
      // from BOTH ends of the response so we can confirm.
      const head = text.slice(0, 400);
      const tail = text.length > 400 ? `\n…[${text.length - 800} chars]…\n${text.slice(-400)}` : "";
      this.logger.error(
        `Could not parse AI plan response. finishReason=${finishReason ?? "unknown"}, len=${text.length}. Raw:\n${head}${tail}`,
      );
      const truncated = finishReason === "MAX_TOKENS" || finishReason === "LENGTH";
      throw new BadGatewayException(
        truncated
          ? "The plan was too long for one response and got cut off. Try a shorter requirement, or retry — sometimes a fresh attempt produces a tighter plan."
          : "AI returned malformed content. Please retry.",
      );
    }
    return this.normalizePlan(parsed, input);
  }

  /**
   * Pull a parseable plan object out of whatever Gemini sent back.
   * Newer models occasionally wrap JSON in markdown fences (```json ... ```)
   * or prepend a single-sentence preamble — even when responseSchema is set.
   * We try, in order: raw parse, fenced-code-block extract, first-balanced-
   * brace extract. Returns null on total failure (caller retries).
   */
  private parsePlanJson(text: string): GeneratedProjectPlan | null {
    const tryParse = (s: string): GeneratedProjectPlan | null => {
      try { return JSON.parse(s) as GeneratedProjectPlan; } catch { return null; }
    };

    // 1) Straight parse — covers the happy path.
    const direct = tryParse(text);
    if (direct) return direct;

    // 2) Markdown code fence — strip ```json ... ``` or ``` ... ```.
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      const fenced = tryParse(fence[1].trim());
      if (fenced) return fenced;
    }

    // 3) Last resort — slice from the first { to the last } and parse that.
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) {
      const sliced = tryParse(text.slice(first, last + 1));
      if (sliced) return sliced;
    }
    return null;
  }

  /**
   * Lightweight AI-powered enrichment for the proposal cover copy.
   * Generates `description` (the elevator pitch) and
   * `projectUnderstanding` (the "we get your problem" paragraph) from
   * the requirement + plan context. Both are tuned for conversion —
   * specific outcomes, quantified pain where possible, peer-to-peer
   * tone — not generic agency boilerplate.
   *
   * Plan blocks, deliverables, pricing and timeline stay derived from
   * the saved plan (so the user-approved scope is never overwritten).
   * Only the two prose fields come from this call.
   */
  async generateProposalCopy(input: {
    projectName: string;
    requirement: string;
    clientName?: string;
    totalHours: number;
    milestoneTitles: string[];
    budget: number;
    currency: string;
  }): Promise<{ description: string; projectUnderstanding: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    if (!input.requirement || input.requirement.trim().length < 12) return null;

    const symbol = input.currency === "INR" ? "₹" : input.currency === "USD" ? "$" : input.currency + " ";
    const milestonesLabel = input.milestoneTitles.length
      ? input.milestoneTitles.join(" → ")
      : "phased delivery";
    const prompt = `ROLE
You are a senior consultant at Tectomi (software + AI automation + e-commerce) writing the cover paragraphs of a client proposal. The brief below was scribbled by a salesperson — it is OFTEN VERY SHORT (3–20 words) and may have typos or chat-style phrasing. Your job is to EXPAND THAT ROUGH BRIEF INTO RICH, REQUIREMENT-AWARE PARAGRAPHS that read like you just finished a 30-minute discovery call with the client. Sparse input is expected — your value is in turning it into something professional.

CONTEXT (use to anchor concrete prose — these are the load-bearing facts)
- Project name: ${input.projectName}
- Client: ${input.clientName ?? "the client"}
- Total effort: ${input.totalHours} engineering hours
- Investment: ${symbol}${input.budget.toLocaleString("en-IN")}
- Milestones: ${milestonesLabel}

THE BRIEF (the rough input from the salesperson — EXPAND, don't quote)
"""
${input.requirement.trim()}
"""

HOW TO EXPAND A SPARSE BRIEF
The brief is a starting point, not the final text. Reason about it before writing:

  1. IDENTIFY THE DOMAIN named in the brief or implied by the project / milestone names — e.g. "shopify store" → direct-to-consumer e-commerce SMB · "AI agent" → operations automation · "dashboard" → internal analytics for an operations team · "SaaS app" → multi-tenant product · "Shiprocket integration" → Indian D2C logistics. Use the milestone titles as additional domain signal.
  2. INFER THE TYPICAL BUSINESS MOTIVATION for that domain. e.g. "basic shopify store" implies a brand getting ready to sell DTC, needing payments + shipping + tax + product catalog from day one to start running paid acquisition and capturing real-buyer feedback. An "AI agent" implies an ops team drowning in manual triage that needs to be automated end-to-end.
  3. INFER THE TYPICAL FRICTION OR RISK for the named domain — what does "broken today" look like for a brand without that thing? What is the cost of delay or doing nothing?
  4. WRITE THE PARAGRAPHS as if you'd interviewed the client. Be specific about the domain and the type of buyer; be vague only when the brief truly is. Never invent specific metrics ("8% drop-off", "₹2L/month wasted") UNLESS the brief named them — qualitative friction is fine when numbers aren't given.

WORKED EXAMPLE — brief = "basic shopify store" (3 words, sparse)
projectUnderstanding (~110 words):
"${input.clientName ?? "The client"} is preparing to launch a direct-to-consumer brand and needs a production-grade Shopify storefront live within a defined window. Without an established store, paid-acquisition campaigns cannot run, early-buyer feedback cannot be captured, and pricing or merchandising hypotheses cannot be tested — every week of delay is a week of compounding opportunity cost while the brand sits idle. The launch needs the operational essentials configured end-to-end: catalog, payments, shipping, and tax compliance, all working from day one rather than as a months-long custom build. The team is looking for an experienced studio that can stand up the store predictably and hand it back ready for marketing, not a half-finished theme that they then have to fix."

description (~75 words):
"A production-ready Shopify storefront, configured end-to-end in ${input.totalHours > 0 ? `${Math.max(1, Math.ceil(input.totalHours / 42))} weeks` : "a single focused engagement"}. The team handles store setup, theme customisation, product import, payments and shipping integration, and a full QA-and-launch cycle — each phase closing with a working demo and written sign-off. At handover ${input.clientName ?? "the client"} receives a live store, configured admin access, and a tested checkout flow ready for the first paid campaign."

(Use that example as a TEMPLATE for the voice, depth, and structure — but rewrite for THIS brief and project name. Do not reuse the Shopify content unless this brief is also about a Shopify store.)

OUTPUT — return JSON with TWO fields, in this order:

1. \`projectUnderstanding\` — 3–5 sentences, ~100–160 words. The "we get your problem" paragraph. Describe the client's situation, what they're trying to achieve, why now, and what is typically at stake for this domain. Use the project name AND the milestone names to make it concrete. Anchored in the domain — never generic agency copy.

2. \`description\` — 2–4 sentences, ~60–110 words. The "here's the solution" elevator pitch. Lead with the OUTCOME the client gets, briefly note HOW the team will get there, and end with the CONCRETE ARTEFACT they will receive at handover. Third-person, declarative.

HOUSE STYLE (mandatory)
- Voice: confident, specific, third-person. Sentences are declarative ("The team will…", "${input.clientName ?? "The client"} will…").
- Drop emojis, exclamation marks, ALL-CAPS for emphasis, and agency clichés ("world-class", "leverage", "synergy", "robust", "seamless", "best-in-class", "next-gen", "cutting-edge").
- Title Case for any named artefact. Sentence case for prose.
- Use the technologies/vendors/domain words from the brief and milestone names. Do not introduce technologies the brief did not imply (e.g. don't add Stripe if Razorpay is the inferred fit; don't add Snowflake to a Shopify build).
- DO NOT mention pricing or hours — those facts live elsewhere on the proposal page.
- Never echo a sentence or phrase from the brief verbatim. Rewrite everything in consultant voice.

Return ONLY a JSON object with the two keys. No markdown fences, no preamble.`;

    // Use the multi-model fallback chain so a 503 / 429 on the
    // primary model doesn't blow up the whole proposal generation.
    // Wrapped in try/catch so this stays a soft-fail (returns null);
    // the caller has a polished metadata fallback ready to go.
    try {
      const { text } = await this.callGeminiWithFallback(apiKey, {
        prompt,
        generationConfig: {
          temperature: 0.65,
          topP: 0.9,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              projectUnderstanding: { type: "string" },
              description: { type: "string" },
            },
            required: ["projectUnderstanding", "description"],
          },
          // The new prompt asks for two longer paragraphs
          // (110+75 ≈ 185 words target). 2048 gives headroom for
          // JSON wrapping overhead so the second paragraph never clips.
          maxOutputTokens: 2048,
        },
      });
      const parsed = JSON.parse(text) as { description?: string; projectUnderstanding?: string };
      const description = (parsed.description ?? "").trim().slice(0, 1200);
      const projectUnderstanding = (parsed.projectUnderstanding ?? "").trim().slice(0, 2000);
      if (!description || !projectUnderstanding) return null;
      return { description, projectUnderstanding };
    } catch (err) {
      this.logger.warn(`generateProposalCopy failed: ${(err as Error).message}`);
      return null;
    }
  }

  private buildPlanPrompt(requirement: string, ctx: GenerateProjectPlanInput): string {
    const team = (ctx.team ?? []).map((m, i) => {
      const committed = m.existingCommittedHours ?? 0;
      const load = committed > 0
        ? ` — already committed: ${committed}h (${m.existingOpenTasks ?? 0} open tasks on other active projects)`
        : " — fully available";
      return `  [${i}] ${m.name} — ${m.role ?? "Team member"} (id: ${m.id})${load}`;
    }).join("\n");
    const today = new Date().toISOString().slice(0, 10);
    // The earliest date the AI may use. If the caller's startDate is
    // in the past (typical when a project was created weeks ago and
    // someone is planning it just now), fall forward to today — past
    // dueDates are useless on a fresh plan.
    const start = (ctx.startDate && ctx.startDate >= today) ? ctx.startDate : today;
    const end = ctx.endDate && ctx.endDate >= start ? ctx.endDate : "";
    const budgetLine = ctx.budget && ctx.budget > 0 ? `Budget: ₹${ctx.budget.toLocaleString("en-IN")}` : "Budget not specified";
    const teamSize = ctx.team?.length ?? 0;

    return `You are a SENIOR FULL-STACK ENGINEER and PROJECT MANAGER at Tectomi — a software-engineering + AI-automation studio that ALSO does e-commerce builds. You have 10+ years of hands-on delivery experience and you treat all three domains as first-class — your plan must match whatever this requirement actually needs, not default to a Shopify template.

YOUR DOMAINS (read the requirement first, then pull from whichever domains apply):

  • SOFTWARE ENGINEERING / SAAS: TypeScript / Node, NestJS, Next.js, Express / Fastify, Go, Python (FastAPI / Django), Postgres + Prisma / Drizzle, MySQL, Redis, MongoDB, REST + GraphQL APIs, websockets, background workers (BullMQ, Inngest, Sidekiq), payments (Stripe, Razorpay, Cashfree), authn/authz (JWT, OAuth, SSO, SAML, RBAC), multi-tenancy, observability (Sentry, Datadog), cloud (AWS, GCP, Azure), IaC (Terraform, CDK), CI/CD, design systems.

  • AI / AUTOMATION: LLM apps (OpenAI, Anthropic, Gemini), RAG pipelines (pgvector, Pinecone, Qdrant, Weaviate), agent orchestration (LangChain, LangGraph, AutoGen, CrewAI), workflow automation (n8n, Zapier, Make, Temporal), prompt engineering, function calling, tool use, evals, vector DB sizing, fine-tuning, voice agents (Twilio + Deepgram), document understanding (Tesseract, AWS Textract), browser automation (Playwright, browserbase), speech (Whisper, ElevenLabs).

  • E-COMMERCE (when the requirement is one): Shopify (Liquid, theme dev, app extensions, Storefront API, Plus), Magento 2, WooCommerce, custom Next.js + Stripe storefronts, headless commerce (Hydrogen, Medusa), Razorpay / Stripe / Cashfree, Shiprocket / Delhivery shipping, GST tax setup, multi-currency, COD flows.

Read the requirement carefully and pick the domain that fits. If they describe a SaaS app, do NOT cargo-cult Shopify terminology. If they describe an internal AI agent, do NOT add e-commerce phases. If it's e-commerce, do NOT pretend it's a SaaS rebuild. You are the expert — match your vocabulary and reference points to what they actually need.

You are planning the delivery board for the project below. Your output drives milestones, sprints, tasks, assignees, and due dates that the team will actually work against. Be specific, realistic, and operationally complete — no fluff tasks, no vague titles.

PROJECT
- Name: ${ctx.projectName}
- ${budgetLine}
- TODAY'S DATE: ${today} (NEVER produce a dueDate or sprint date before today — every date you emit must be ≥ ${today})
- Start date: ${start}
- Target end date: ${end || "not set (you choose a realistic one)"}

REQUIREMENT
"""
${requirement}
"""

TEAM AVAILABLE (${teamSize} ${teamSize === 1 ? "person" : "people"})
${team || "  (no team members assigned — leave all assignees null)"}

CALIBRATION — DELIVERY BENCHMARKS (CRITICAL)
Tectomi has senior full-stack engineers who have shipped each of the patterns in the reference table many times — they already have internal templates for: NestJS auth + RBAC, Prisma schema + migrations, Next.js dashboard shells, Tailwind component primitives, React Query data hooks, Razorpay / Stripe webhook handlers, Shopify theme starter, n8n workflow templates. So for commodity work (a CRUD form, a JWT login, a Stripe webhook, a Shopify section) the team is roughly **2× faster than Western big-tech benchmarks** because they're assembling, not inventing.

Reflect this in your estimates. The reference tables BELOW are already calibrated for a Kerala senior dev — use them as your ceiling, not your floor. A bug fix is hours, not days. A login screen is half a day, not three. Do NOT pad time for "project bootstrap", "set up repo", "wire auth from scratch", or "build a CRUD form from zero" — those are minutes-to-hours given the org's scaffolding.

CAPACITY MODEL
Each employee is in the office 8 hours per workday, Mon–Sat (the org's default). After meetings, code review, blockers, and context switching, a Kerala senior engineer averages **7 productive hours per workday** = ~42h/week. Use 7h/day when computing how long a task takes in calendar time:
  • A 7-hour task takes 1 workday. dueDate = startDay + 1.
  • A 14-hour task takes 2 workdays.
  • A 28-hour task takes 4 workdays.
  • A 42-hour task takes 6 workdays = ~1 week.

EXISTING COMMITMENTS — every team member's line above lists "already committed: Xh" — that's hours already owed to OTHER active projects. SUBTRACT that from each person's available capacity before assigning anything. If someone is more than 75% loaded across the timeline, prefer to assign less work to them and shift to less-loaded teammates.

When you set each task's \`dueDate\`, mentally simulate scheduling: walk through tasks in dependency order, assign each one to a person, and increment that person's running cursor by ceil(estimatedHrs / 7) workdays. The dueDate is the day the task should be DONE — not the day the person picks it up. Two tasks assigned to the same person should NEVER have overlapping windows. Skip Sundays (non-working).

INSTRUCTIONS

1. MILESTONES (3–5): pick the right phases for THIS work — don't copy-paste generic "Design / Build / Launch". Each milestone has \`title\`, 1-sentence \`description\`, and a \`dueDate\` (YYYY-MM-DD).

2. SPRINTS (2–6, two-week cycles): break the timeline into back-to-back 2-week sprints between \`start\` and \`end\`. Each sprint has a \`name\` (e.g. "Sprint 1 · Foundations"), a 1-sentence \`goal\` describing the user-visible outcome by the end of the sprint, plus \`startDate\` and \`endDate\` (YYYY-MM-DD).

3. TASKS (8–30 total): one tasks array, each with:
   - \`title\`: action-shaped — "Build / Audit / Refactor / Integrate / Test / Launch X". No vague titles.
   - \`description\`: 1–2 sentences. State what's being built AND the acceptance criterion ("done when ___").
   - \`subtasks\` (optional array, 0–5 items): break a parent task into smaller pieces ONLY when the work is non-trivial (parent ≥ 16h) OR multiple distinct skills are needed. Each subtask is { title, estimatedHrs }. Subtask hours must sum to the parent's estimatedHrs ±10%. Don't subdivide small tasks just to pad the list.
   - \`estimatedHrs\`: integer hours of focused engineering. KERALA-CALIBRATED — these numbers assume the team has internal scaffolding for auth, schema, UI primitives, payment webhooks, etc. They're already 30–50% leaner than Western benchmarks. Do NOT add buffer; use the LOWER half of each range unless the requirement explicitly says "novel" / "from scratch" / "no existing template". Use the reference table for the domain that fits THIS requirement:

       ── SOFTWARE / SAAS ──
       Bug fix / config tweak: 0.5–2 h
       Simple form / new screen wired to existing API: 2–4 h
       New screen + simple API endpoint with tests: 4–8 h
       CRUD module (DB schema + API + UI + tests): 8–16 h
       Authentication (email/password + JWT or OAuth provider): 6–12 h
       Multi-tenancy / org-isolation refactor: 20–40 h
       Real-time feature (websockets + UI + reconnect): 10–20 h
       Background-job queue setup (BullMQ / Inngest + retries + dashboard): 6–12 h
       Stripe / Razorpay subscriptions (plans + checkout + webhooks + billing portal): 12–24 h
       Admin panel (10–15 screens, role-gated, data tables): 30–60 h
       Mobile-responsive Next.js dashboard (10–20 screens with charts): 40–80 h
       Migration of legacy data (schema + script + dry-run + cutover): 10–24 h
       Performance optimisation pass (DB indexes, query tuning, N+1 fixes): 6–14 h
       Audit logging + retention: 6–14 h

       ── AI / AUTOMATION ──
       Single-purpose LLM call wired into an existing API (with eval): 3–6 h
       Function-calling tool integration (1 tool, end-to-end): 3–8 h
       RAG pipeline v1 (load + chunk + embed + retrieve + simple UI): 24–48 h
       RAG production-grade (eval harness, reranker, query rewriting): 40–80 h
       Agent with 3–5 tools + memory + UI: 40–80 h
       n8n / Zapier workflow (5–10 steps, integrations, error handling): 3–10 h
       Document understanding pipeline (OCR + extraction + structured output): 16–32 h
       Browser-automation agent (Playwright + LLM planner): 24–48 h
       Voice agent (telephony + ASR + LLM + TTS): 40–80 h
       Fine-tune + serve a small model (data prep + train + eval + deploy): 28–56 h
       Eval harness + dashboards for prompt regression: 10–20 h

       ── E-COMMERCE (only when this is an e-commerce build) ──
       Shopify section / theme block (responsive + a11y): 2–5 h
       Razorpay / Stripe / Shiprocket integration: 4–10 h
       Multi-step checkout customisation: 8–18 h
       Full custom Shopify theme: 40–80 h
       Storefront API + headless setup: 20–40 h

       ── CROSS-DOMAIN ──
       Full QA pass + bug-fix sweep: 6–12 h
       Launch checklist + DNS + canary deploy: 1–3 h
       Design system / component library bootstrapping: 12–24 h
       Cypress / Playwright e2e suite (10–20 flows): 12–24 h
   - \`milestoneIndex\`: 0-based index into the milestones array.
   - \`sprintIndex\`: 0-based index into the sprints array. ALL tasks must belong to exactly one sprint.
   - \`assigneeIndex\`: 0-based index into the team list above. Match skills if obvious (designer → UI tasks, backend engineer → API/integration tasks). Leave null only if team is empty.
   - \`priority\`: "URGENT" only for known crises; "HIGH" for critical-path / blocking work; "MEDIUM" default; "LOW" for nice-to-have polish.
   - \`dueDate\`: YYYY-MM-DD. MUST sit inside its sprint window AND on or before its milestone's dueDate. Compute via the capacity model above — do not just spread evenly.

4. WORKLOAD BALANCE — HARD CONSTRAINT YOU MUST OBEY
   Number of team members: ${teamSize}. Target hours per person = total project hours ÷ ${teamSize}.
   • EVERY person on the team list MUST be assigned at least one task. Leaving someone with 0 tasks while another has 12 is a defect — fix it before you respond.
   • No single person may own more than 60% of total estimatedHrs across the project. If you computed that someone exceeds 60%, MOVE TASKS to others until you're under.
   • Within a single sprint, a person's total estimatedHrs ≤ 60.
   • Match skills WHERE OBVIOUS (designer → UI tasks, engineer → API/code, QA → testing). If skills are unclear, assign by least-loaded-first round-robin.
   • Walk through your own plan before responding: count tasks per person, sum hours, verify the 60% cap and that every person has ≥1 task.

5. NO PADDING. Skip "Set up Slack channel" / "Schedule kickoff" / "Buy domain" / "Daily standup" / "Project documentation" / generic admin work unless the requirement specifically calls for them. Every task should be a real delivery deliverable.

6. SEQUENCING. Dependencies run serially. If "Build cart" depends on "Design cart", the design task's dueDate must come before the build task's startable day. Use sprint ordering to enforce phase order — foundations → features → polish/launch. Within each milestone, tasks should be roughly in execution order (earliest dueDate first).

7. SCOPE LOCK — HARDEST CONSTRAINT (READ TWICE)
   Build EXACTLY what the requirement asks for. Nothing more.
   • Every task MUST trace to a specific phrase, feature, or deliverable in the CLIENT REQUIREMENT above. Re-read the requirement before finalising your list.
   • FORBIDDEN unless the requirement explicitly mentions them by name:
     – Generic infrastructure: "Set up Git", "Configure CI/CD", "Bootstrap repo", "Project kickoff", "Stakeholder workshop", "Architecture review", "Write technical docs", "Onboarding session".
     – Bonus features the client didn't ask for. If they want a store with cart + Razorpay + Shiprocket, do NOT add "Loyalty programme", "Email automation", "Customer dashboard", "Analytics integration", "SEO optimisation", or "Multi-language" — those are upsells, NOT scope. Quote a leaner project and let sales upsell separately.
     – Speculative engineering: caching layers, microservices splits, "future-proofing" refactors, "scalability" tasks for a v1 that doesn't yet have users.
     – Duplicate / renamed work: don't have "Build cart" AND "Implement add-to-cart flow" — pick one.
     – "Buffer" / "Contingency" / "Polish" / "Tech debt" placeholder tasks. If it's real work, name it; if not, drop it.
   • Acceptance criteria (the "done when" clause in every description) must reference the requirement language directly — not a generic "tested and deployed".
   • For EACH task ask: "Which sentence in the requirement does this fulfil?" If you cannot point to one, DELETE the task before responding.

8. ESTIMATE SELF-CHECK (DO THIS BEFORE RESPONDING)
   Walk your final task list once more and verify, task by task:
   (a) Is this in the requirement? — name the phrase it traces to. If you can't, delete it.
   (b) Is the hour estimate in the LOWER half of the reference range? Kerala calibration says lean. If you wrote the upper end, justify it with a phrase like "from scratch" or "novel"; otherwise lower it.
   (c) Does the dueDate respect the per-person scheduling cursor? (7h/day, skip Sundays, no overlaps for one person)
   (d) Does the assignment match the person's role? (designer ≠ backend integration)
   (e) Is the total project hours sensible vs the budget hint? (totalHours × hourlyRate should land near the budget, not 2× or 0.5×)
   Fix anything that fails before responding.

Return ONLY the JSON object — no commentary, no markdown fences.`;
  }

  private planResponseSchema(): unknown {
    return {
      type: "object",
      properties: {
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              dueDate: { type: "string" },
            },
            required: ["title"],
          },
        },
        sprints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              goal: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
            },
            required: ["name", "startDate", "endDate"],
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              milestoneIndex: { type: "integer" },
              sprintIndex: { type: "integer" },
              assigneeIndex: { type: "integer" },
              estimatedHrs: { type: "number" },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
              dueDate: { type: "string" },
              subtasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    estimatedHrs: { type: "number" },
                  },
                  required: ["title"],
                },
              },
            },
            required: ["title", "milestoneIndex"],
          },
        },
      },
      required: ["milestones", "sprints", "tasks"],
    };
  }

  private normalizePlan(plan: GeneratedProjectPlan, ctx: GenerateProjectPlanInput): GeneratedProjectPlan {
    const teamLen = ctx.team?.length ?? 0;
    const teamIds = (ctx.team ?? []).map((m) => m.id);
    const todayStr = new Date().toISOString().slice(0, 10);
    const earliest = (ctx.startDate && ctx.startDate >= todayStr) ? ctx.startDate : todayStr;

    // Clamp any past date forward to the earliest allowed value. The
    // prompt forbids past dates but Gemini occasionally violates that
    // for very tight schedules — silently fix instead of failing.
    const clampDate = (d?: string): string | undefined => {
      if (!d || !d.match(/^\d{4}-\d{2}-\d{2}$/)) return undefined;
      return d >= earliest ? d : earliest;
    };

    const milestones = (plan.milestones ?? [])
      .filter((m) => m.title?.trim())
      .map((m) => ({
        title: m.title.trim().slice(0, 200),
        description: (m.description ?? "").trim().slice(0, 1000) || undefined,
        dueDate: clampDate(m.dueDate),
      }))
      .slice(0, 8);

    const sprints = (plan.sprints ?? [])
      .filter((s) => s.name?.trim() && (s.startDate ?? "").match(/^\d{4}-\d{2}-\d{2}$/) && (s.endDate ?? "").match(/^\d{4}-\d{2}-\d{2}$/))
      .map((s) => {
        const startDate = clampDate(s.startDate) ?? earliest;
        // End date must come after start. If clamping start pushed it
        // past the original end, recompute end = start + 13 days (a
        // 2-week sprint window — preserves the intent).
        let endDate = clampDate(s.endDate) ?? earliest;
        if (endDate < startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + 13);
          endDate = d.toISOString().slice(0, 10);
        }
        return {
          name: s.name.trim().slice(0, 120),
          goal: (s.goal ?? "").trim().slice(0, 500) || undefined,
          startDate,
          endDate,
        };
      })
      .slice(0, 12);

    const tasks = (plan.tasks ?? [])
      .filter((t) => t.title?.trim())
      .map((t) => {
        const milestoneIndex = Math.max(0, Math.min(Math.max(0, milestones.length - 1), Math.round(t.milestoneIndex ?? 0)));
        const sIdx = typeof t.sprintIndex === "number" ? Math.round(t.sprintIndex) : -1;
        const sprintIndex = sprints.length > 0 && sIdx >= 0 && sIdx < sprints.length ? sIdx : (sprints.length > 0 ? 0 : undefined);
        const aIdx = typeof t.assigneeIndex === "number" ? Math.round(t.assigneeIndex) : -1;
        const assignedToId = teamLen > 0 && aIdx >= 0 && aIdx < teamLen ? teamIds[aIdx] : undefined;
        const estimatedHrs = Math.max(0.5, Math.min(200, Number(t.estimatedHrs ?? 4)));
        const priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" =
          t.priority && ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(t.priority) ? t.priority : "MEDIUM";
        const dueDate = clampDate(t.dueDate);
        const subtasks = Array.isArray(t.subtasks)
          ? t.subtasks
              .filter((st) => st?.title?.trim())
              .map((st) => ({
                title: st.title.trim().slice(0, 300),
                estimatedHrs:
                  typeof st.estimatedHrs === "number" && st.estimatedHrs > 0
                    ? Math.max(0.25, Math.min(80, st.estimatedHrs))
                    : undefined,
              }))
              .slice(0, 8)
          : undefined;
        return {
          title: t.title.trim().slice(0, 300),
          description: (t.description ?? "").trim().slice(0, 2000) || undefined,
          milestoneIndex,
          sprintIndex,
          assignedToId,
          estimatedHrs,
          priority,
          dueDate,
          subtasks: subtasks && subtasks.length ? subtasks : undefined,
        };
      })
      .slice(0, 40);

    // Workload rebalancing — Gemini often dumps everything on one
    // person despite the prompt. After normalization, if anyone holds
    // more than 60% of total hours, redistribute their excess tasks to
    // the least-loaded teammate(s) round-robin until no one exceeds
    // 60%. This is a hard guarantee that the prompt can't always
    // deliver on its own.
    this.rebalanceWorkload(tasks, ctx.team ?? []);

    return { milestones, sprints, tasks };
  }

  /**
   * In-place reassignment so no single team member carries more than
   * `MAX_SHARE` of the total estimated hours. Picks the least-loaded
   * teammate as the new owner for each overflow task.
   *
   * Skipped when the team has fewer than 2 people, or when no task
   * has an assignee (e.g. team list was empty at generation time).
   */
  private rebalanceWorkload(
    tasks: GeneratedProjectPlan["tasks"],
    team: Array<{ id: string }>,
  ): void {
    if (team.length < 2) return;
    const MAX_SHARE = 0.6; // any single person caps at 60% of total

    const totalHrs = tasks.reduce((s, t) => s + (t.estimatedHrs ?? 0), 0);
    if (totalHrs <= 0) return;

    // Sum per-person hours. Initialise every team member at 0 so even
    // people with no assigned tasks are picked when redistributing.
    const loadById = new Map<string, number>();
    for (const m of team) loadById.set(m.id, 0);
    for (const t of tasks) {
      if (!t.assignedToId) continue;
      loadById.set(t.assignedToId, (loadById.get(t.assignedToId) ?? 0) + (t.estimatedHrs ?? 0));
    }

    const cap = totalHrs * MAX_SHARE;
    // Find the heaviest-loaded person; if they're under cap we're done.
    const heaviest = () => {
      let id: string | null = null;
      let max = 0;
      for (const [k, v] of loadById) {
        if (v > max) { max = v; id = k; }
      }
      return { id, hrs: max };
    };
    const lightest = (excludeId: string) => {
      let id: string | null = null;
      let min = Infinity;
      for (const [k, v] of loadById) {
        if (k === excludeId) continue;
        if (v < min) { min = v; id = k; }
      }
      return id;
    };

    let safetyIterations = 0;
    while (safetyIterations++ < 50) {
      const heavy = heaviest();
      if (!heavy.id || heavy.hrs <= cap) break;
      // Pick the heaviest's biggest task — moving big tasks moves the
      // needle fastest. Skip subtask-bearing parents would be ideal,
      // but the cap is soft enough that ANY swap helps.
      const candidates = tasks
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.assignedToId === heavy.id)
        .sort((a, b) => (b.t.estimatedHrs ?? 0) - (a.t.estimatedHrs ?? 0));
      if (candidates.length === 0) break;
      const newOwner = lightest(heavy.id);
      if (!newOwner) break;
      const moved = candidates[0].t;
      const hrs = moved.estimatedHrs ?? 0;
      moved.assignedToId = newOwner;
      loadById.set(heavy.id, (loadById.get(heavy.id) ?? 0) - hrs);
      loadById.set(newOwner, (loadById.get(newOwner) ?? 0) + hrs);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Plan generation — types
// ══════════════════════════════════════════════════════════════════════════

export interface GenerateProjectPlanInput {
  projectName: string;
  requirement: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  team?: Array<{
    id: string;
    name: string;
    role?: string;
    /** Hours of OPEN task estimates this person already owes on other active projects. */
    existingCommittedHours?: number;
    existingOpenTasks?: number;
  }>;
}

export interface GeneratedProjectPlan {
  milestones: Array<{
    title: string;
    description?: string;
    dueDate?: string;
  }>;
  sprints: Array<{
    name: string;
    goal?: string;
    startDate: string;
    endDate: string;
  }>;
  tasks: Array<{
    title: string;
    description?: string;
    milestoneIndex: number;
    /** index into the sprints array — every task lives in one sprint. */
    sprintIndex?: number;
    /** index into the input.team array — resolved to assignedToId by `normalizePlan`. */
    assigneeIndex?: number;
    /** Resolved assignee id (post-normalization). */
    assignedToId?: string;
    estimatedHrs?: number;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string;
    /** Optional child tasks — saved as Task rows with parentId pointing to the parent task. */
    subtasks?: Array<{ title: string; estimatedHrs?: number }>;
  }>;
}
