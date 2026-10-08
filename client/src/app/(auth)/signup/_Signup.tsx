// src/app/(auth)/signup/_Signup.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
// import { Ionicons } from "@expo/vector-icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signupSchema } from "../../../lib/features/auth/authSchema";
import {
  useSignupMutation,
  useGoogleLoginMutation,
} from "../../../lib/features/auth/authQueries";
import { Ionicons } from "@expo/vector-icons";
import { getErrorMessage } from "../../../lib/api/getErrorMessage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
type SignupFormValues = z.infer<typeof signupSchema>;

export default function Signup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [serverError, setServerError] = useState<string | null>(null);

  // 1. Setup React Hook Form with Zod schema
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const signupMutation = useSignupMutation();
  const googleMutation = useGoogleLoginMutation();

  // 3. Submit Handler
  const onSubmit = (data: SignupFormValues) => {
    setServerError(null); // Clear previous server errors

    signupMutation.mutate(data, {
      onError: (error: any) => {
        // Developers: full detail stays in the console
        console.error(
          "[SIGNUP UI ERROR]:",
          error.message,
          error.response?.status,
          error.response?.data,
        );
        // Users: one clean sentence
        setServerError(
          getErrorMessage(
            error,
            "We couldn't create your account. Please try again.",
          ),
        );
      },
    });
  };

  const onGooglePress = () => {
    setServerError(null);

    googleMutation.mutate(undefined, {
      onError: (error: any) => {
        console.error(
          "[GOOGLE SIGNUP UI ERROR]:",
          error.message,
          error.response?.status,
          error.response?.data,
        );
        setServerError(
          getErrorMessage(
            error,
            "We couldn't sign you up with Google. Please try again.",
          ),
        );
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerSection}>
          <View style={styles.logoRow}>
            <View style={styles.redBlock} />
            <Text style={styles.logoText}>MasterSave</Text>
          </View>
          <Text style={styles.title}>Create account.</Text>
          <Text style={styles.subTitle}>Start automating your wealth.</Text>
        </View>

        <View style={styles.formSection}>
          {/* SERVER ERROR ALERT BOX */}
          {serverError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{serverError}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="name@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            {/* ZOD VALIDATION ERROR */}
            {errors.email && (
              <Text style={styles.errorText}>{errors.email.message}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.password && styles.inputError]}
                  placeholder="Create a strong password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            {/* ZOD VALIDATION ERROR */}
            {errors.password && (
              <Text style={styles.errorText}>{errors.password.message}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.input,
                    errors.confirmPassword && styles.inputError,
                  ]}
                  placeholder="Confirm your password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            {/* ZOD VALIDATION ERROR */}
            {errors.confirmPassword && (
              <Text style={styles.errorText}>
                {errors.confirmPassword.message}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.8}
            onPress={handleSubmit(onSubmit)}
            disabled={signupMutation.isPending || googleMutation.isPending}
          >
            {signupMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign Up</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.googleBtn}
          activeOpacity={0.8}
          onPress={onGooglePress}
          disabled={googleMutation.isPending || signupMutation.isPending}
        >
          {googleMutation.isPending ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#111827" />
              <Text style={styles.googleBtnText}>Sign up with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: {
    padding: 24,
    paddingTop: Platform.OS === "ios" ? 80 : 60,
    paddingBottom: 40,
  },

  headerSection: { marginBottom: 40 },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  redBlock: {
    width: 16,
    height: 16,
    backgroundColor: "#DC2626",
    borderRadius: 4,
  },
  logoText: { fontSize: 20, fontWeight: "900", color: "#111827" },

  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -1,
    marginBottom: 8,
  },
  subTitle: { fontSize: 15, color: "#6B7280", fontWeight: "500" },

  formSection: { marginBottom: 32 },
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  inputError: {
    borderColor: "#DC2626",
    borderWidth: 1,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    marginLeft: 4,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    marginBottom: 20,
  },
  errorBoxText: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  primaryBtn: {
    backgroundColor: "#111827",
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },

  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#F3F4F6" },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
  },

  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    gap: 12,
    marginBottom: 32,
  },
  googleBtnText: { fontSize: 16, fontWeight: "800", color: "#111827" },

  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  footerLink: { fontSize: 14, fontWeight: "800", color: "#111827" },
});
