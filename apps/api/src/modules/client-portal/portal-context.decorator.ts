import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type PortalContext = { contactId: string; clientId: string };

export const Portal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.portal;
  },
);
