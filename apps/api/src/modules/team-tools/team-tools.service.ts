import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamToolCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateTeamToolDto,
  ListTeamToolsQueryDto,
  UpdateTeamToolDto,
} from "./dto/team-tool.dto";

const TOOL_INCLUDE = {
  addedBy: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
} satisfies Prisma.TeamToolInclude;

/**
 * Starter directory tuned to Tectomi's stack — AI coding assistants, UI/UX
 * design tools, AI image/video, the hosting/infra they actually deploy to,
 * and the productivity stack the team uses day-to-day. Pin the ones you
 * use weekly; the rest sit in the directory as a reference for the team.
 *
 * The seeder is idempotent: re-running it adds any rows that don't yet
 * exist (matched by name) and leaves existing ones untouched. That means
 * a future expansion to this list can be pulled in by anyone with the
 * seed permission without nuking the team's curated additions.
 */
const STARTER_TOOLS: Array<Omit<Prisma.TeamToolCreateManyInput, "addedById">> = [
  // ── AI coding assistants ─────────────────────────────────────────────────
  { name: "Claude",          description: "Anthropic's AI assistant. Long-context, code-aware, great at refactors, research, and writing.", url: "https://claude.ai",                  category: TeamToolCategory.AI,          isAi: true, tags: ["ai","code","writing","reasoning"] },
  { name: "ChatGPT",         description: "OpenAI's chat assistant. Good for brainstorming, quick drafts, and code snippets.",               url: "https://chat.openai.com",            category: TeamToolCategory.AI,          isAi: true, tags: ["ai","brainstorm","code"] },
  { name: "Cursor",          description: "AI-native code editor. Multi-file edits, agent mode, codebase-aware completions.",                url: "https://cursor.com",                 category: TeamToolCategory.DEVELOPMENT, isAi: true, tags: ["ai","ide","code"] },
  { name: "GitHub Copilot",  description: "Inline AI autocomplete inside VS Code / JetBrains. Pair-programmer for everyday tasks.",          url: "https://github.com/features/copilot",category: TeamToolCategory.DEVELOPMENT, isAi: true, tags: ["ai","autocomplete","ide"] },
  { name: "v0",              description: "Vercel's UI generator. Type a prompt, get production-ready Tailwind + React components.",         url: "https://v0.dev",                     category: TeamToolCategory.AI,          isAi: true, tags: ["ai","ui","frontend","tailwind"] },
  { name: "Bolt.new",        description: "Full-stack AI app builder. Spins up working Next/Express scaffolds from a single prompt.",        url: "https://bolt.new",                   category: TeamToolCategory.AI,          isAi: true, tags: ["ai","scaffold","prototype"] },
  { name: "Phind",           description: "AI search built for developers — pulls cited code-aware answers from docs and StackOverflow.",    url: "https://www.phind.com",              category: TeamToolCategory.AI,          isAi: true, tags: ["ai","search","docs"] },
  { name: "Codeium",         description: "Free AI code completion + chat across most editors. Self-host option for sensitive repos.",       url: "https://codeium.com",                category: TeamToolCategory.DEVELOPMENT, isAi: true, tags: ["ai","autocomplete","free"] },
  { name: "Perplexity",      description: "AI research engine with citations. Use for technical lookups and competitive research.",          url: "https://www.perplexity.ai",          category: TeamToolCategory.RESEARCH,    isAi: true, tags: ["ai","search","research"] },
  { name: "NotebookLM",      description: "Google's AI notebook — upload PDFs/docs and chat with them, generate audio overviews.",           url: "https://notebooklm.google.com",      category: TeamToolCategory.RESEARCH,    isAi: true, tags: ["ai","research","docs"] },

  // ── UI / UX design ───────────────────────────────────────────────────────
  { name: "Figma",           description: "Collaborative design — UI mockups, design systems, prototypes, dev-handoff with inspect mode.",   url: "https://www.figma.com",              category: TeamToolCategory.DESIGN,                   tags: ["design","ui","prototype"] },
  { name: "Figma Make",      description: "Figma's AI design-to-code feature. Generate components straight from the canvas.",                url: "https://www.figma.com/make/",        category: TeamToolCategory.DESIGN,      isAi: true, tags: ["design","ai","code"] },
  { name: "Framer",          description: "Design + build + publish responsive websites with CMS and motion built in.",                       url: "https://www.framer.com",             category: TeamToolCategory.DESIGN,                   tags: ["design","prototype","web"] },
  { name: "Excalidraw",      description: "Hand-drawn-style whiteboard for diagrams, flows, and quick architecture sketches.",                url: "https://excalidraw.com",             category: TeamToolCategory.DESIGN,                   tags: ["design","diagram","whiteboard"] },
  { name: "Whimsical",       description: "Wireframes, flowcharts, sticky-notes, mind-maps — fast UX exploration in one canvas.",             url: "https://whimsical.com",              category: TeamToolCategory.DESIGN,                   tags: ["design","wireframe","flowchart"] },
  { name: "Canva",           description: "Quick graphics for social posts, decks, brochures, and marketing collateral.",                     url: "https://www.canva.com",              category: TeamToolCategory.DESIGN,                   tags: ["design","marketing","social"] },

  // ── AI design / image / video ────────────────────────────────────────────
  { name: "Midjourney",      description: "Image generation via Discord. Strong stylistic control and consistency.",                          url: "https://www.midjourney.com",         category: TeamToolCategory.AI,          isAi: true, tags: ["ai","image","branding"] },
  { name: "Leonardo.ai",     description: "Production-licensed AI image generation with model fine-tuning and brand consistency tools.",     url: "https://leonardo.ai",                category: TeamToolCategory.AI,          isAi: true, tags: ["ai","image","brand"] },
  { name: "Ideogram",        description: "AI image generator with the best text-in-image rendering. Great for posters and banners.",         url: "https://ideogram.ai",                category: TeamToolCategory.AI,          isAi: true, tags: ["ai","image","typography"] },
  { name: "Krea AI",         description: "Real-time AI image + video — sketch, render, and iterate fast without long generations.",          url: "https://www.krea.ai",                category: TeamToolCategory.AI,          isAi: true, tags: ["ai","image","video","realtime"] },
  { name: "Recraft",         description: "AI vectors + brand-consistent design assets. Maintains a single style across icon/illustration sets.", url: "https://www.recraft.ai",          category: TeamToolCategory.AI,          isAi: true, tags: ["ai","vector","brand","icons"] },
  { name: "Magnific",        description: "AI image upscaler with creative re-interpretation — turn rough mockups into hero-quality renders.", url: "https://magnific.ai",                category: TeamToolCategory.AI,          isAi: true, tags: ["ai","image","upscale"] },
  { name: "Galileo AI",      description: "Prompt-to-UI design — describe a screen, get a Figma-ready mockup.",                              url: "https://www.usegalileo.ai",          category: TeamToolCategory.AI,          isAi: true, tags: ["ai","ui","figma"] },
  { name: "Khroma",          description: "AI color palette generator trained on the palettes you like.",                                     url: "https://www.khroma.co",              category: TeamToolCategory.DESIGN,      isAi: true, tags: ["design","color","ai"] },
  { name: "Coolors",         description: "Fast palette generator. Hit space, build a brand palette in 10 seconds.",                          url: "https://coolors.co",                 category: TeamToolCategory.DESIGN,                   tags: ["design","color"] },
  { name: "Runway",          description: "AI creative video — text-to-video, motion brush, green-screen, lip-sync.",                         url: "https://runwayml.com",               category: TeamToolCategory.AI,          isAi: true, tags: ["ai","video"] },
  { name: "Synthesia",       description: "AI avatar videos for product walkthroughs without a camera.",                                      url: "https://www.synthesia.io",           category: TeamToolCategory.AI,          isAi: true, tags: ["ai","video","avatar"] },
  { name: "Descript",        description: "Edit video/podcasts by editing the transcript. AI overdub fixes mistakes without re-recording.",   url: "https://www.descript.com",           category: TeamToolCategory.AI,          isAi: true, tags: ["ai","video","podcast"] },
  { name: "Gamma",           description: "AI-generated decks, docs, and one-pagers. Replaces the first hour of slide work.",                 url: "https://gamma.app",                  category: TeamToolCategory.MARKETING,   isAi: true, tags: ["ai","decks","marketing"] },

  // ── Development infrastructure ───────────────────────────────────────────
  { name: "GitHub",          description: "Source control + reviews + CI. Where Tectomi code lives.",                                          url: "https://github.com",                 category: TeamToolCategory.DEVELOPMENT,              tags: ["code","ci","reviews"] },
  { name: "Vercel",          description: "Frontend hosting + serverless functions. Default choice for Next.js deploys.",                     url: "https://vercel.com",                 category: TeamToolCategory.DEVELOPMENT,              tags: ["hosting","frontend","next"] },
  { name: "Netlify",         description: "Static + serverless hosting. Good for marketing sites and JAMstack apps.",                         url: "https://www.netlify.com",            category: TeamToolCategory.DEVELOPMENT,              tags: ["hosting","static","jamstack"] },
  { name: "Supabase",        description: "Postgres + auth + storage + edge functions. Backend in a box for prototypes and real apps.",       url: "https://supabase.com",               category: TeamToolCategory.DEVELOPMENT,              tags: ["backend","postgres","baas"] },
  { name: "Railway",         description: "One-click backend deploys with managed Postgres, Redis, and services.",                            url: "https://railway.app",                category: TeamToolCategory.DEVELOPMENT,              tags: ["hosting","backend"] },
  { name: "Neon",            description: "Serverless Postgres with branching — spin up a per-PR database in seconds.",                       url: "https://neon.tech",                  category: TeamToolCategory.DEVELOPMENT,              tags: ["postgres","database","serverless"] },
  { name: "Stripe",          description: "Payments + billing + invoicing. International cards + UPI + auto-tax.",                            url: "https://stripe.com",                 category: TeamToolCategory.DEVELOPMENT,              tags: ["payments","billing"] },
  { name: "Linear",          description: "Issue tracker + roadmap. Fast keyboard-first UX, good for product/engineering rituals.",          url: "https://linear.app",                 category: TeamToolCategory.DEVELOPMENT,              tags: ["issues","roadmap","sprints"] },
  { name: "Sentry",          description: "Production error tracking + performance. Catch JS / API errors before users do.",                  url: "https://sentry.io",                  category: TeamToolCategory.DEVELOPMENT,              tags: ["monitoring","errors","apm"] },
  { name: "PostHog",         description: "Self-hostable product analytics, session replay, feature flags, A/B tests in one tool.",           url: "https://posthog.com",                category: TeamToolCategory.ANALYTICS,                tags: ["analytics","sessions","flags"] },
  { name: "Google Analytics",description: "Website + funnel analytics. Source of truth for marketing-site traffic.",                          url: "https://analytics.google.com",       category: TeamToolCategory.ANALYTICS,                tags: ["analytics","web"] },

  // ── Productivity / communication ─────────────────────────────────────────
  { name: "Notion",          description: "Docs, wikis, and lightweight databases. Where cross-team knowledge lives.",                        url: "https://www.notion.so",              category: TeamToolCategory.PRODUCTIVITY,             tags: ["docs","wiki","knowledge"] },
  { name: "Slack",           description: "Team chat. Sync moments, quick threads, channel-per-topic.",                                       url: "https://slack.com",                  category: TeamToolCategory.COMMUNICATION,            tags: ["chat"] },
  { name: "Discord",         description: "Community + team chat. Use for client communities and async voice rooms.",                         url: "https://discord.com",                category: TeamToolCategory.COMMUNICATION,            tags: ["community","chat"] },
  { name: "Loom",            description: "Quick screen-recordings for async walkthroughs, bug demos, and pitches.",                          url: "https://www.loom.com",               category: TeamToolCategory.COMMUNICATION,            tags: ["video","async"] },

  // ── Social media management (pairs with the Social Planner) ──────────────
  { name: "Buffer",          description: "Cross-platform social scheduler — drafts, calendar, analytics for organic posts.",                 url: "https://buffer.com",                 category: TeamToolCategory.MARKETING,                tags: ["social","scheduler","marketing"] },
  { name: "Meta Business Suite", description: "Free Facebook + Instagram scheduler and inbox. Use for paid + organic on Meta channels.",     url: "https://business.facebook.com",      category: TeamToolCategory.MARKETING,                tags: ["social","facebook","instagram"] },
];

@Injectable()
export class TeamToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTeamToolsQueryDto) {
    const where: Prisma.TeamToolWhereInput = {
      AND: [
        query.category ? { category: query.category } : {},
        query.isAi !== undefined ? { isAi: query.isAi } : {},
        query.isPinned !== undefined ? { isPinned: query.isPinned } : {},
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { url: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    return this.prisma.teamTool.findMany({
      where,
      orderBy: [
        // Pinned first, then alphabetic — gives a stable, scannable directory.
        { isPinned: "desc" },
        { name: "asc" },
      ],
      include: TOOL_INCLUDE,
    });
  }

  async get(id: string) {
    const tool = await this.prisma.teamTool.findUnique({
      where: { id },
      include: TOOL_INCLUDE,
    });
    if (!tool) throw new NotFoundException("Tool not found");
    return tool;
  }

  create(userId: string, dto: CreateTeamToolDto) {
    return this.prisma.teamTool.create({
      data: {
        name: dto.name,
        description: dto.description,
        url: dto.url,
        iconUrl: dto.iconUrl,
        category: dto.category,
        isPinned: dto.isPinned ?? false,
        isAi: dto.isAi ?? false,
        tags: dto.tags ?? [],
        addedById: userId,
      },
      include: TOOL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTeamToolDto) {
    return this.prisma.teamTool.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
        ...(dto.isAi !== undefined && { isAi: dto.isAi }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
      include: TOOL_INCLUDE,
    });
  }

  async togglePin(id: string) {
    const tool = await this.prisma.teamTool.findUnique({ where: { id }, select: { isPinned: true } });
    if (!tool) throw new NotFoundException("Tool not found");
    return this.prisma.teamTool.update({
      where: { id },
      data: { isPinned: !tool.isPinned },
      include: TOOL_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.prisma.teamTool.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Seeds any starter tools that aren't already in the workspace. Matches
   * existing rows by name (case-insensitive) so re-running the seed after
   * we expand the curated list pulls in the additions without duplicating
   * what the team already has, and without overwriting their tweaks.
   */
  async seedStarterCatalog(userId: string) {
    const existing = await this.prisma.teamTool.findMany({ select: { name: true } });
    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));
    const fresh = STARTER_TOOLS.filter((t) => !existingNames.has(t.name.toLowerCase()));
    if (fresh.length === 0) {
      return {
        skipped: true,
        imported: 0,
        message: "All catalog tools already exist — nothing new to seed.",
      };
    }
    await this.prisma.teamTool.createMany({
      data: fresh.map((t) => ({ ...t, addedById: userId })),
    });
    return {
      skipped: false,
      imported: fresh.length,
      message: `Imported ${fresh.length} new tool${fresh.length === 1 ? "" : "s"}.`,
    };
  }
}
