import { Test } from "@nestjs/testing";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { MailService } from "../../src/common/mail/mail.service";
import { PortalAuthService } from "../../src/modules/client-portal/auth/portal-auth.service";
import { sha256 } from "../../src/modules/client-portal/token.util";

describe("PortalAuthService", () => {
  let svc: PortalAuthService;
  const prismaMock: any = {
    clientContact: { findFirst: jest.fn() },
    clientMagicLink: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    clientPortalSession: { create: jest.fn(), updateMany: jest.fn() },
  };
  // PortalAuthService.requestLink was refactored to use `sendGenericEmail`
  // (rich HTML template) instead of `sendTemplateEmail`. Mock both so the
  // test surface keeps working if either is reintroduced.
  const mailMock: any = {
    sendTemplateEmail: jest.fn().mockResolvedValue(undefined),
    sendGenericEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        PortalAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();
    svc = mod.get(PortalAuthService);
  });

  it("requestLink does nothing when contact missing (no enumeration)", async () => {
    prismaMock.clientContact.findFirst.mockResolvedValue(null);
    await svc.requestLink("nobody@example.com", "127.0.0.1");
    expect(prismaMock.clientMagicLink.create).not.toHaveBeenCalled();
    expect(mailMock.sendTemplateEmail).not.toHaveBeenCalled();
    expect(mailMock.sendGenericEmail).not.toHaveBeenCalled();
  });

  it("requestLink stores hashed token and sends email when contact exists", async () => {
    prismaMock.clientContact.findFirst.mockResolvedValue({ id: "c1", email: "a@b.com", name: "A" });
    prismaMock.clientMagicLink.create.mockResolvedValue({});
    await svc.requestLink("a@b.com", "127.0.0.1");
    const args = prismaMock.clientMagicLink.create.mock.calls[0][0].data;
    expect(args.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // Service now uses sendGenericEmail (rich template) instead of
    // sendTemplateEmail; either being called proves the mail side-effect ran.
    const emailed =
      mailMock.sendGenericEmail.mock.calls.length > 0 ||
      mailMock.sendTemplateEmail.mock.calls.length > 0;
    expect(emailed).toBe(true);
  });

  it("verify rejects expired link", async () => {
    prismaMock.clientMagicLink.findUnique.mockResolvedValue({
      id: "l1",
      contactId: "c1",
      tokenHash: sha256("x"),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    await expect(svc.verify("x", null, null)).rejects.toThrow();
  });

  it("verify rejects used link", async () => {
    prismaMock.clientMagicLink.findUnique.mockResolvedValue({
      id: "l1",
      contactId: "c1",
      tokenHash: sha256("y"),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });
    await expect(svc.verify("y", null, null)).rejects.toThrow();
  });

  it("verify consumes link single-use and creates a session", async () => {
    prismaMock.clientMagicLink.findUnique.mockResolvedValue({
      id: "l1",
      contactId: "c1",
      tokenHash: sha256("z"),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prismaMock.clientMagicLink.update.mockResolvedValue({});
    prismaMock.clientPortalSession.create.mockResolvedValue({});
    const result = await svc.verify("z", null, null);
    expect(prismaMock.clientMagicLink.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(prismaMock.clientPortalSession.create).toHaveBeenCalled();
    expect(typeof result.sessionRaw).toBe("string");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("revoke marks the matching unrevoked session as revoked", async () => {
    prismaMock.clientPortalSession.updateMany.mockResolvedValue({ count: 1 });
    await svc.revoke("raw-cookie-value");
    const call = prismaMock.clientPortalSession.updateMany.mock.calls[0][0];
    expect(call.where.tokenHash).toBe(sha256("raw-cookie-value"));
    expect(call.where.revokedAt).toBeNull();
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });
});
