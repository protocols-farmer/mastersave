// src/lib/features/auth/authQueries.ts
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { AuthResponse } from "./authTypes";
import { useAuthStore } from "./authStore";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { getGoogleIdToken } from "./googleSignIn";
export const useLoginMutation = () => {
  const router = useRouter();
  const setCredentials = useAuthStore((state) => state.setCredentials);

  return useMutation({
    mutationFn: async (credentials: {
      identifier?: string;
      password?: string;
    }) => {
      try {
        const response = await apiClient.post<AuthResponse>(
          "/auth/login",
          credentials,
        );
        return response.data;
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Login]: ${error.message}`);
        if (error.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(error.response.data),
          );
        }
        throw error;
      }
    },
    // EXPLICIT TYPE ADDED HERE
    onSuccess: async (data: AuthResponse) => {
      await setCredentials(data.user, data.accessToken, data.refreshToken);
      router.replace("/(tabs)/profile");
    },
  });
};

export const useSignupMutation = () => {
  const router = useRouter();
  const setCredentials = useAuthStore((state) => state.setCredentials);

  return useMutation({
    mutationFn: async (credentials: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    }) => {
      try {
        const response = await apiClient.post<AuthResponse>(
          "/auth/signup",
          credentials,
        );
        return response.data;
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Signup]: ${error.message}`);
        if (error.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(error.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: async (data: AuthResponse) => {
      try {
        await setCredentials(data.user, data.accessToken, data.refreshToken);
      } catch (credentialsError: any) {
        console.error(
          `[API QUERY ERROR - setCredentials after login/signup]: ${credentialsError.message}\nStack: ${credentialsError.stack}`,
        );
        // The server created a session but this phone could not store its refresh token.
        // Revoke that session so it does not stay in the active sessions list.
        try {
          await apiClient.post("/auth/logout", {
            refreshToken: data.refreshToken,
          });
        } catch (revokeError: any) {
          console.error(
            `[API QUERY ERROR - Revoke orphan session]: ${revokeError.message}\nStack: ${revokeError.stack}`,
          );
          if (revokeError.response) {
            console.error(
              `[API QUERY ERROR DETAILS]:`,
              JSON.stringify(revokeError.response.data),
            );
          }
        }
        throw credentialsError;
      }
      router.replace("/(tabs)/profile");
    },
  });
};

export const useUpdateAccountMutation = () => {
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: async (payload: {
      username?: string;
      name?: string;
      phoneNumber?: string;
      email?: string;
      currentPassword?: string;
      avatarUrl?: string; // <-- 1. ADD THIS LINE
    }) => {
      try {
        const cleanPayload = {
          ...payload,
          email: payload.email === "" ? undefined : payload.email,
        };
        const response = await apiClient.patch<{ message: string; user: any }>(
          "/auth/update",
          cleanPayload,
        );
        return response.data;
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Update Account]: ${error.message}`);
        throw error;
      }
    },
    onSuccess: (data: { message: string; user: any }) => {
      updateUser(data.user);
    },
  });
};

export const useLogoutMutation = () => {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  return useMutation({
    mutationFn: async () => {
      try {
        const storedRefreshToken =
          await SecureStore.getItemAsync("refreshToken");
        await apiClient.post("/auth/logout", {
          refreshToken: storedRefreshToken,
        });
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Logout]: ${error.message}`);
        if (error.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(error.response.data),
          );
        }
      }
    },
    onSettled: async () => {
      await logout();
      router.replace("/(auth)/login");
    },
  });
};

export const useUploadAvatarMutation = () => {
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: async (formData: FormData) => {
      try {
        const response = await apiClient.post<{ url: string }>(
          "/auth/upload-avatar",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          },
        );
        return response.data;
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Upload Avatar]: ${error.message}`);
        if (error.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(error.response.data),
          );
        }
        throw error;
      }
    },
    // EXPLICIT TYPE ADDED HERE (This fixes the 'unknown' error)
    onSuccess: (data: { url: string }) => {
      updateUser({ avatar_url: data.url });
    },
  });
};
// Add this to the bottom of src/lib/features/auth/authQueries.ts

export const useChangePasswordMutation = () => {
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: async (payload: {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
      googleToken?: string;
    }) => {
      try {
        // Send the current refresh token so the server keeps THIS device
        // logged in and only logs out the other devices.
        const storedRefreshToken =
          await SecureStore.getItemAsync("refreshToken");
        const response = await apiClient.patch<{ message: string }>(
          "/auth/change-password",
          payload,
          {
            headers: { "x-refresh-token": storedRefreshToken ?? "" },
          },
        );
        return response.data;
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Change Password]: ${error.message}`);
        throw error;
      }
    },
    onSuccess: () => {
      updateUser({ has_local_password: true });
    },
  });
};
export const useGoogleLoginMutation = () => {
  const router = useRouter();
  const setCredentials = useAuthStore((state) => state.setCredentials);

  return useMutation({
    // Used by BOTH the login and the signup screen: the backend creates the
    // account if it is new (201) and logs in if it already exists (200).
    mutationFn: async (): Promise<AuthResponse | null> => {
      const idToken = await getGoogleIdToken();

      // The user closed the Google picker. Not an error.
      if (!idToken) return null;

      try {
        const response = await apiClient.post<AuthResponse>(
          "/auth/social-login",
          { provider: "google", token: idToken },
        );
        return response.data;
      } catch (error: any) {
        console.error(`[API QUERY ERROR - Google Login]: ${error.message}`);
        if (error.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(error.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: async (data: AuthResponse | null) => {
      if (!data) return;
      try {
        await setCredentials(data.user, data.accessToken, data.refreshToken);
      } catch (credentialsError: any) {
        console.error(
          `[API QUERY ERROR - setCredentials after Google login]: ${credentialsError.message}\nStack: ${credentialsError.stack}`,
        );
        try {
          await apiClient.post("/auth/logout", {
            refreshToken: data.refreshToken,
          });
        } catch (revokeError: any) {
          console.error(
            `[API QUERY ERROR - Revoke orphan session]: ${revokeError.message}\nStack: ${revokeError.stack}`,
          );
          if (revokeError.response) {
            console.error(
              `[API QUERY ERROR DETAILS]:`,
              JSON.stringify(revokeError.response.data),
            );
          }
        }
        throw credentialsError;
      }
      router.replace("/(tabs)/profile");
    },
  });
};
