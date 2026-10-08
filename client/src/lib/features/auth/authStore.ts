// src/lib/features/auth/authStore.ts
import { create } from "zustand";
import { User } from "./authTypes";

import * as SecureStore from "expo-secure-store";
import { queryClient } from "../../api/queryClient";
import { signOutOfGoogle } from "./googleSignIn";
interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  // Actions
  setCredentials: (
    user: User,
    accessToken: string,
    refreshToken: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  setCredentials: async (
    user: User,
    accessToken: string,
    refreshToken: string,
  ) => {
    let refreshTokenSaved = false;

    // 1. Save the refresh token to device encrypted storage (attempt 1 of 2)
    try {
      await SecureStore.setItemAsync("refreshToken", refreshToken);
      refreshTokenSaved = true;
    } catch (firstError: any) {
      console.error(
        `[AUTH STORE ERROR] Failed to securely save refresh token (attempt 1 of 2): ${firstError.message}\nStack: ${firstError.stack}`,
      );
    }

    // 2. Attempt 2 of 2, after a short pause. Some keystore failures are momentary.
    if (!refreshTokenSaved) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await SecureStore.setItemAsync("refreshToken", refreshToken);
        refreshTokenSaved = true;
      } catch (secondError: any) {
        console.error(
          `[AUTH STORE ERROR] Failed to securely save refresh token (attempt 2 of 2): ${secondError.message}\nStack: ${secondError.stack}`,
        );
      }
    }

    // 3. Both attempts failed. The server has already rotated the old token away, so the
    // token still on disk is dead. If we kept it, the next refresh would look like token
    // reuse and the server would sign this user out of ALL their devices.
    // So we remove it, sign out locally, and tell the caller.
    if (!refreshTokenSaved) {
      try {
        await SecureStore.deleteItemAsync("refreshToken");
      } catch (deleteError: any) {
        console.error(
          `[AUTH STORE ERROR] Failed to delete the stale refresh token after save failure: ${deleteError.message}\nStack: ${deleteError.stack}`,
        );
      }

      await signOutOfGoogle();
      queryClient.clear();
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      });

      const saveFailedError: any = new Error("SECURE_STORE_SAVE_FAILED");
      saveFailedError.code = "SECURE_STORE_SAVE_FAILED";
      saveFailedError.userMessage =
        "We couldn't securely save your login on this phone. Please log in again.";
      throw saveFailedError;
    }
    set({
      user,
      accessToken,
      isAuthenticated: true,
    });
  },
  logout: async () => {
    try {
      // 1. Wipe the encrypted storage
      await SecureStore.deleteItemAsync("refreshToken");
    } catch (error: any) {
      console.error(
        `[AUTH STORE ERROR] Failed to delete refresh token: ${error.message}\nStack: ${error.stack}`,
      );
    }

    // 2. Sign out of Google too, so the next login shows the account picker
    await signOutOfGoogle();

    // 3. Wipe cached server data so the next person never sees it
    queryClient.clear();

    // 4. Wipe memory state
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });
  },

  updateUser: (data: Partial<User>) => {
    set((state) => {
      if (!state.user) return state;
      return {
        user: { ...state.user, ...data },
      };
    });
  },
}));
