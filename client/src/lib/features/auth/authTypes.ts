// src/lib/features/auth/authTypes.ts

export type UserRole = "user" | "admin" | "super_admin";

export interface User {
  id: string;
  username: string;
  email?: string | null;
  phone_number?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  has_local_password?: boolean;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string; // The backend returns this specifically for Expo Secure Store
  user: User;
  message?: string;
}
