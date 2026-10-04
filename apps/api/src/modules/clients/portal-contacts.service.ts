import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { PortalAuthService } from "../client-portal/auth/portal-auth.service";
import { env } from "../../config/env";

@Injectable()
export class PortalContactsService {
  private readonly logger = new Logger(PortalContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: PortalAuthService,
    private readonly mail: MailService,
  ) {}

  async list(clientId: string) {
    const contacts = await this.prisma.clientContact.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
    });
    // Surface active-session count per contact so staff can see whether
    // a contact has live logins before / after revoking. Without this,
    // clicking "Revoke sessions" feels invisible — nothing on the row
    // visibly changes.
    const counts = await this.prisma.clientPortalSession.groupBy({
      by: ["contactId"],
      where: {
        contactId: { in: contacts.map((c) => c.id) },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      _count: { contactId: true },
    });
    const byId = new Map(counts.map((c) => [c.contactId, c._count.contactId]));
    return contacts.map((c) => ({ ...c, activeSessionCount: byId.get(c.id) ?? 0 }));
  }

  /**
   * Create-or-reactivate a contact and mint a magic link for them.
   * Returns the link itself so the staff UI can offer a "Copy link" /
   * WhatsApp share — important when SMTP isn't set up or the client
   * prefers a non-email channel.
   *
   * Email behaviour:
   *  - Net-new contact → branded onboarding email (welcome + magic link
   *    CTA). The generic magic-link email is suppressed to avoid two
   *    emails landing back-to-back.
   *  - Existing/reactivated contact → standard magic-link email via
   *    PortalAuthService.requestLink (no welcome verbiage).
   */
  async invite(clientId: string, email: string, name: string | null) {
    const lc = email.toLowerCase();
    // We need to know whether the row already existed so we can pick
    // the right email template. `upsert` would mask this, so do it as
    // an explicit find + create/update.
    const existing = await this.prisma.clientContact.findUnique({
      where: { clientId_email: { clientId, email: lc } },
    });
    const isNew = !existing;
    const contact = existing
      ? await this.prisma.clientContact.update({
          where: { clientId_email: { clientId, email: lc } },
          data: { status: "ACTIVE", name },
        })
      : await this.prisma.clientContact.create({
          data: { clientId, email: lc, name },
        });

    // sendEmail=false on the requestLink call when we're going to send a
    // richer onboarding email ourselves. The link/expiry still come back
    // so the staff UI's copy/share affordance keeps working.
    const linkInfo = await this.auth.requestLink(lc, null, { sendEmail: !isNew });
    if (isNew && linkInfo) {
      await this.sendOnboardingEmail(clientId, contact.email, contact.name, linkInfo.link);
    }
    return {
      ...contact,
      magicLink: linkInfo?.link ?? null,
      magicLinkExpiresAt: linkInfo?.expiresAt ?? null,
    };
  }

  /**
   * Issue a fresh magic link for an existing contact without changing
   * any other fields. Used by the "New link" button on each contact row.
   */
  async resendLink(clientId: string, contactId: string) {
    const contact = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId, status: "ACTIVE" },
    });
    if (!contact) throw new NotFoundException();
    const info = await this.auth.requestLink(contact.email, null);
    return {
      magicLink: info?.link ?? null,
      magicLinkExpiresAt: info?.expiresAt ?? null,
    };
  }

  async setStatus(clientId: string, contactId: string, status: "ACTIVE" | "DISABLED") {
    const c = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId },
    });
    if (!c) throw new NotFoundException();
    return this.prisma.clientContact.update({
      where: { id: contactId },
      data: { status },
    });
  }

  async revokeAllSessions(clientId: string, contactId: string) {
    const c = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId },
    });
    if (!c) throw new NotFoundException();
    const result = await this.prisma.clientPortalSession.updateMany({
      where: { contactId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Return the number of sessions actually killed so the UI can show
    // "X sessions revoked" vs. "Already signed out — no active sessions".
    return { ok: true, revoked: result.count };
  }

  /**
   * Branded welcome email for a brand-new portal contact. Introduces
   * the portal and bundles the first magic link as the primary CTA so
   * the recipient doesn't need a separate sign-in step.
   */
  private async sendOnboardingEmail(
    clientId: string,
    email: string,
    name: string | null,
    magicLink: string,
  ): Promise<void> {
    try {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: { companyName: true },
      });
      await this.mail.sendOnboardingEmail(email, {
        recipientName: name,
        clientName: client?.companyName ?? "there",
        portalSignInUrl: magicLink,
        linkTtlMinutes: env.portalMagicLinkTtlMinutes,
      });
    } catch (err) {
      // Onboarding email is best-effort — the staff caller still got
      // back a magic link they can copy/paste manually.
      this.logger.warn(`Onboarding email to ${email} failed: ${(err as Error).message}`);
    }
  }
}
