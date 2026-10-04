import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MailService } from "../../../common/mail/mail.service";
import { env } from "../../../config/env";
import { generateToken, sha256 } from "../token.util";

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  /**
   * Generate (and optionally email) a one-time magic link for the given
   * contact email. Returns the fully-qualified URL + expiry so staff
   * callers can present "Copy link" / WhatsApp-share affordances when
   * email delivery isn't possible — useful when SMTP isn't configured
   * yet or the client prefers a different channel.
   *
   * Returns `null` for unknown / disabled contacts so the public
   * `/portal/auth/request` route can still avoid leaking existence —
   * callers that only need the side-effect (the email) can ignore the
   * return value.
   */
  async requestLink(
    email: string,
    ip: string | null,
    opts: { sendEmail?: boolean } = {},
  ): Promise<{ link: string; expiresAt: Date } | null> {
    const sendEmail = opts.sendEmail ?? true;
    const contact = await this.prisma.clientContact.findFirst({
      where: { email: email.toLowerCase(), status: "ACTIVE" },
    });
    if (!contact) {
      // do not leak existence
      return null;
    }

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + env.portalMagicLinkTtlMinutes * 60 * 1000);
    await this.prisma.clientMagicLink.create({
      data: { contactId: contact.id, tokenHash: hash, expiresAt, ip },
    });

    // Magic link points at the API verify endpoint, not the SPA. The
    // API exchanges the token for a session cookie and then redirects
    // the browser to the portal home — that way the cookie is set on
    // the API's origin (where it'll be sent on subsequent fetches) and
    // we don't depend on a placeholder frontend page to handle auth.
    const link = `${env.apiUrl}/client-portal/auth/verify?token=${raw}`;
    // Email send is best-effort: if SMTP is misconfigured we still want
    // the staff caller to receive the link so they can share manually.
    // Callers can suppress the email (e.g. PortalContactsService when
    // it's about to send a richer onboarding email itself) by passing
    // sendEmail=false — that way the contact doesn't get two pings.
    if (sendEmail) {
      try {
        await this.mail.sendGenericEmail(contact.email, "Sign in to your portal", {
          kicker: "Client portal · Sign in",
          documentTitle: "Client portal",
          headline: "Your one-tap sign-in link.",
          greeting: contact.name ? `Hi ${contact.name.split(" ")[0]},` : "Hi there,",
          intro:
            "Tap the button below to sign in. The link is single-use and expires shortly — request a new one any time from the portal sign-in page if it lapses.",
          cta: { label: "Sign in", url: link },
          footerNote: `This link expires in ${env.portalMagicLinkTtlMinutes} minutes. If you didn't request it, you can safely ignore this email — no further action is needed.`,
        });
      } catch (err) {
        this.logger.warn(`Magic-link email failed for ${contact.email}: ${(err as Error).message}`);
      }
    }
    return { link, expiresAt };
  }

  async verify(rawToken: string, ip: string | null, ua: string | null): Promise<{ sessionRaw: string; expiresAt: Date }> {
    const hash = sha256(rawToken);
    const link = await this.prisma.clientMagicLink.findUnique({ where: { tokenHash: hash } });
    if (!link) throw new Error("invalid");
    if (link.usedAt) throw new Error("invalid");
    if (link.expiresAt < new Date()) throw new Error("invalid");

    await this.prisma.clientMagicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });

    const session = generateToken();
    const expiresAt = new Date(Date.now() + env.portalSessionTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.clientPortalSession.create({
      data: { contactId: link.contactId, tokenHash: session.hash, expiresAt, ip, userAgent: ua },
    });

    return { sessionRaw: session.raw, expiresAt };
  }

  async revoke(rawSession: string): Promise<void> {
    const hash = sha256(rawSession);
    await this.prisma.clientPortalSession.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
