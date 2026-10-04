import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { RoleCode } from "@prisma/client";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { LogoutDto, RefreshTokenDto } from "./dto/refresh-token.dto";
import { RequestPasswordResetDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Admin-only — anyone could previously self-register with any role array
  // (including SUPER_ADMIN). The public onboarding flow now goes through
  // POST /users (also admin-gated) or email-invite; /auth/register stays
  // only as the programmatic equivalent for SUPER_ADMIN/ADMIN.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post("logout")
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @Post("forgot-password")
  forgotPassword(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post("verify-email")
  verifyEmail(@Query("token") token: string) {
    return this.authService.verifyEmail(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.authService.changeOwnPassword(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }
}
