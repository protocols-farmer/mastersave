// src/lib/api/apiClient.ts
import axios from "axios";
import { Mutex } from "async-mutex";
import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "../features/auth/authStore";
import { AuthResponse } from "../features/auth/authTypes";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  // We use console.error in React Native so it pops up visually in the Metro bundler overlay
  console.error(
    "[API_CLIENT FATAL ERROR]: EXPO_PUBLIC_API_URL is missing from your .env file. Network requests will fail.",
  );
}

const mutex = new Mutex();

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// REQUEST INTERCEPTOR: Attach access token to every request natively
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// RESPONSE INTERCEPTOR: Catch 401 Unauthorized errors and attempt Silent Refresh securely
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if the route is an auth route. If a login or signup fails with 401, we don't refresh. We just pass the error back.
    const isAuthEndpoint =
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/signup") ||
      originalRequest.url?.includes("/auth/social-login");

    if (
      error.response?.status !== 401 ||
      isAuthEndpoint ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    // If the refresh call ITSELF failed with a 401, the user's session is dead (e.g. security revocation or expiry).
    if (originalRequest.url?.includes("/auth/refresh")) {
      console.warn(
        "[API CLIENT] Refresh token was rejected by the server. Logging user out completely.",
      );
      await useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    // Attempt Silent Refresh
    if (!mutex.isLocked()) {
      const release = await mutex.acquire();
      try {
        originalRequest._retry = true;
        console.warn(
          "[API CLIENT] Access token expired (401). Attempting silent refresh...",
        );

        const storedRefreshToken =
          await SecureStore.getItemAsync("refreshToken");

        if (!storedRefreshToken) {
          console.warn(
            "[API CLIENT] No refresh token found in secure storage. Forcing logout.",
          );
          await useAuthStore.getState().logout();
          return Promise.reject(error);
        }

        const refreshResponse = await axios.post<AuthResponse>(
          `${BASE_URL}/auth/refresh`,
          {
            refreshToken: storedRefreshToken,
          },
          { timeout: 15000 },
        );

        const {
          user,
          accessToken,
          refreshToken: newRefreshToken,
        } = refreshResponse.data;

        console.log(
          "[API CLIENT] Token rotated successfully via backend. Retrying original request.",
        );
        await useAuthStore
          .getState()
          .setCredentials(user, accessToken, newRefreshToken);

        // Update the header on the original failed request and execute it again
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        const refreshStatus = refreshError.response?.status;
        console.error(
          `[API CLIENT] Silent refresh failed: ${refreshError.message} status=${refreshStatus} data=${JSON.stringify(refreshError.response?.data)}`,
        );
        if (refreshStatus === 401 || refreshStatus === 403) {
          // Server says the session is really dead
          await useAuthStore.getState().logout();
        }
        // Offline, timeout, 409 race, 5xx: keep the session, just fail this one request
        return Promise.reject(refreshError);
      } finally {
        release();
      }
    } else {
      originalRequest._retry = true;
      await mutex.waitForUnlock();
      const newAccessToken = useAuthStore.getState().accessToken;
      if (newAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      }
      return Promise.reject(error);
    }
  },
);
