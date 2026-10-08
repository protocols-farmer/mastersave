// src/app/_layout.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/api/queryClient";
import { useAuthStore } from "../lib/features/auth/authStore";

// 1. Tell the native OS to hold the splash screen!
SplashScreen.preventAutoHideAsync();

// 3. Explicitly pull the API URL
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  console.error("FATAL: EXPO_PUBLIC_API_URL missing.");
}

function RootNavigationGuard() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setCredentials = useAuthStore((state) => state.setCredentials);
  const logout = useAuthStore((state) => state.logout);
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [bootFailedTemporarily, setBootFailedTemporarily] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        console.log(
          "[Boot] Holding splash screen. Checking secure device storage...",
        );
        const storedRefreshToken =
          await SecureStore.getItemAsync("refreshToken");

        if (storedRefreshToken && BASE_URL) {
          console.log(`[Boot] Found token. Handshaking with backend...`);

          const response = await axios.post(
            `${BASE_URL}/auth/refresh`,
            { refreshToken: storedRefreshToken },
            { timeout: 15000 },
          );

          const {
            user,
            accessToken,
            refreshToken: newRefreshToken,
          } = response.data;
          await setCredentials(user, accessToken, newRefreshToken);
          console.log("[Boot] Handshake successful. User authenticated.");
        } else {
          console.log("[Boot] No token found. User is anonymous.");
        }
      } catch (error: any) {
        console.error(
          `[Boot ERROR]: ${error.message}\nStack: ${error.stack}\nStatus: ${error.response?.status}\nResponse: ${JSON.stringify(error.response?.data)}`,
        );

        const status = error.response?.status;
        if (error?.code === "SECURE_STORE_SAVE_FAILED") {
          // The server accepted the refresh but this phone could not save the new token.
          // setCredentials already wiped the old token and the auth state, so the user is
          // signed out locally and the router sends them to the Welcome screen.
          // This is NOT a network problem, so we must not show the "Can't connect" screen.
          console.error(
            "[Boot] Refresh succeeded on the server but the new token could not be saved. User signed out locally.",
          );
        } else if (status === 401 || status === 403) {
          // The server told us the token is really dead. Now it is safe to wipe it.
          await logout();
        } else {
          // Offline, timeout, 5xx, maintenance, 409... The token may be perfectly valid.
          // Keep it and let the user retry. Do NOT log them out.
          setBootFailedTemporarily(true);
        }
      } finally {
        setIsReady(true);
      }
    };

    hydrateSession();
  }, [bootAttempt]);

  useEffect(() => {
    if (!isReady) return;

    if (bootFailedTemporarily) {
      SplashScreen.hideAsync();
      return;
    }

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      console.log("[Router] Unauthenticated -> Sending to Welcome screen.");
      // CHANGED: Send to welcome instead of login
      router.replace("/(auth)/welcome");
    } else if (isAuthenticated && inAuthGroup) {
      console.log("[Router] Authenticated -> Sending to App.");
      router.replace("/(tabs)/profile");
    }

    // Now that we have routed them to the correct screen, hide the native splash screen!
    SplashScreen.hideAsync();
  }, [isAuthenticated, isReady, segments, bootFailedTemporarily]);

  // Don't render the Stack until the auth check is completely finished
  if (!isReady) {
    // First launch: native splash is still visible. On a retry it is already hidden.
    if (bootAttempt === 0) return null;
    return (
      <View style={bootStyles.container}>
        <ActivityIndicator color="#111827" />
      </View>
    );
  }

  if (bootFailedTemporarily) {
    return (
      <View style={bootStyles.container}>
        <Text style={bootStyles.title}>Can't connect</Text>
        <Text style={bootStyles.message}>
          We couldn't reach MasterSave. Check your internet connection and try
          again. You're still signed in.
        </Text>
        <TouchableOpacity
          style={bootStyles.button}
          activeOpacity={0.8}
          onPress={() => {
            setBootFailedTemporarily(false);
            setIsReady(false);
            setBootAttempt((n) => n + 1);
          }}
        >
          <Text style={bootStyles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigationGuard />
    </QueryClientProvider>
  );
}
const bootStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#111827", marginBottom: 8 },
  message: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#111827",
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
