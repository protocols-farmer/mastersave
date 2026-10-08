//src/features/auth/auth.types.ts

export type UserRole = "user" | "admin" | "super_admin";
export type AuthProvider = "local" | "google";

export interface User {
  id: string;
  email: string | null;
  phone_number: string | null;
  username: string;
  name: string | null;
  avatar_url: string;
  role: "super_admin" | "admin" | "user";
  password_hash: string | null;
  auth_provider: AuthProvider;
  provider_id: string | null;
  last_active_at: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface SocialLoginDTO {
  provider: "google";
  token?: string;
}

export interface RefreshTokenSession {
  id: string;
  user_id: string;
  token_hash: string;
  parent_token_id: string | null;
  is_revoked: boolean;
  revoked_reason: string | null;
  revoked_at: string | null;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface JWTPayload {
  id: string;
  username: string;
  role: UserRole;
  token_use: "access";
  iat?: number;
  exp?: number;
}

export interface SignupDTO {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export interface LoginDTO {
  identifier?: string; // This will handle email, username, or phone number from the frontend
  password?: string;
}

export interface ChangePasswordDTO {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  googleToken?: string; // Fresh Google ID token. Required when a Google account sets its FIRST password
  refreshToken?: string; // Current device's refresh token, so the other devices can be logged out
}

export interface UpdateAccountDTO {
  email?: string; // Added email for updates
  name?: string;
  username?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  currentPassword?: string; // Required if they are changing their email for security
}

export interface SessionResponseDTO {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  is_current_session: boolean;
}

export interface RevokeSpecificSessionDTO {
  sessionId?: string;
}
