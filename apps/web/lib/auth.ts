export type AuthUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  roles: string[];
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};
