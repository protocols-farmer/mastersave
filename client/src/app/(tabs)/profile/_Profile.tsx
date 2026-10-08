import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../../lib/features/auth/authStore";
import {
  useUpdateAccountMutation,
  useChangePasswordMutation,
  useUploadAvatarMutation,
  useLogoutMutation,
} from "../../../lib/features/auth/authQueries";
import { getErrorMessage } from "../../../lib/api/getErrorMessage";
import { getGoogleIdToken } from "../../../lib/features/auth/googleSignIn";
export default function Profile() {
  const user = useAuthStore((state) => state.user);
  const logoutMutation = useLogoutMutation();
  const updateAccountMutation = useUpdateAccountMutation();
  const changePasswordMutation = useChangePasswordMutation();
  const uploadAvatarMutation = useUploadAvatarMutation();

  // --- ACCOUNT EDIT STATE ---
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [phone, setPhone] = useState(user?.phone_number || "");
  const [email, setEmail] = useState(user?.email || "");
  const [emailPassword, setEmailPassword] = useState("");
  const [updateError, setUpdateError] = useState("");

  // --- CHANGE PASSWORD MODAL STATE ---
  const [isPassModalVisible, setPassModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");

  // Notifications State (UI only for now)
  const [pushOn, setPushOn] = useState(true);
  const [alertsOn, setAlertsOn] = useState(true);
  const [marketingOn, setMarketingOn] = useState(false);

  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    const first = parts[0] ?? "";
    const second = parts[1] ?? "";
    if (second.length > 0) {
      return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
    }
    return first.substring(0, 2).toUpperCase();
  };

  // --- HANDLERS ---
  const handleAvatarUpload = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("We need access to your photos to change your avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const formData = new FormData();
      formData.append("avatar", {
        uri: result.assets[0].uri,
        name: "avatar.jpg",
        type: "image/jpeg",
      } as any);

      // The backend saves the new avatar URL on the user row during the upload itself,
      // and the upload mutation already updates the local store. No second call needed.
      uploadAvatarMutation.mutate(formData, {
        onError: (error: any) => {
          console.error(
            "[PROFILE AVATAR ERROR]:",
            error.message,
            error.response?.status,
            error.response?.data,
          );
          alert(
            getErrorMessage(
              error,
              "We couldn't upload your photo. Please try again.",
            ),
          );
        },
      });
    }
  };

  const handleSaveProfile = () => {
    setUpdateError("");

    const currentName = user?.name || "";
    const currentUsername = user?.username || "";
    const currentPhone = user?.phone_number || "";
    const currentEmail = user?.email || "";

    // 1. Build a payload containing ONLY the fields that actually changed
    const payload: any = {};
    if (name.trim() !== currentName) payload.name = name.trim();
    if (username.trim() !== currentUsername) payload.username = username.trim();
    if (phone.trim() !== currentPhone) payload.phoneNumber = phone.trim();
    if (email.trim() !== currentEmail) payload.email = email.trim();

    // Changing the email address or the phone number needs the current password
    if (payload.email !== undefined || payload.phoneNumber !== undefined) {
      if (!emailPassword) {
        setUpdateError(
          "Your current password is required to change your email address or phone number.",
        );
        return;
      }
      payload.currentPassword = emailPassword;
    }

    // 2. If nothing changed, just exit edit mode without hitting the API
    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      return;
    }

    // 3. Send the optimized payload to the backend
    updateAccountMutation.mutate(payload, {
      onSuccess: () => {
        setIsEditing(false);
        setEmailPassword("");
      },
      onError: (error: any) => {
        console.error(
          "[PROFILE UPDATE ERROR]:",
          error.message,
          error.response?.status,
          error.response?.data,
        );
        setUpdateError(
          getErrorMessage(
            error,
            "We couldn't update your profile. Please try again.",
          ),
        );
      },
    });
  };

  const handleChangePassword = async () => {
    setPassError("");
    setPassSuccess("");

    if (newPassword !== confirmPassword) {
      setPassError("New passwords do not match.");
      return;
    }

    // A Google account with no password yet must confirm with Google first
    let googleToken: string | undefined;
    if (user?.has_local_password === false) {
      try {
        const token = await getGoogleIdToken();
        if (!token) return; // the user closed the Google picker
        googleToken = token;
      } catch (error: any) {
        console.error(
          "[CHANGE PASSWORD GOOGLE ERROR]:",
          error.message,
          error.userMessage,
        );
        setPassError(
          error?.userMessage ||
            "We couldn't confirm your Google account. Please try again.",
        );
        return;
      }
    }

    changePasswordMutation.mutate(
      { currentPassword, newPassword, confirmPassword, googleToken },
      {
        onSuccess: (data) => {
          setPassSuccess(data.message);
          setTimeout(() => {
            setPassModalVisible(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setPassSuccess("");
          }, 2000);
        },
        onError: (error: any) => {
          console.error(
            "[CHANGE PASSWORD ERROR]:",
            error.message,
            error.response?.status,
            error.response?.data,
          );
          setPassError(
            getErrorMessage(
              error,
              "We couldn't change your password. Please try again.",
            ),
          );
        },
      },
    );
  };

  // We only show the password confirmation box if they actually modified their email
  const isEmailChanged = email.trim() !== (user?.email || "");
  const isPhoneChanged = phone.trim() !== (user?.phone_number || "");
  const needsPasswordConfirm = isEmailChanged || isPhoneChanged;
  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* PROFILE HEADER */}
        <View style={styles.headerCard}>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!isEditing || uploadAvatarMutation.isPending}
            style={styles.avatarContainer}
            onPress={handleAvatarUpload}
          >
            {user?.avatar_url ? (
              <Image
                source={{ uri: user.avatar_url }}
                style={styles.avatarCircle}
              />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {getInitials(user?.name || user?.username || "")}
                </Text>
              </View>
            )}

            {isEditing && (
              <View style={styles.editBadge}>
                {uploadAvatarMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                )}
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.name || "No Name Set"}</Text>
          <Text style={styles.userRole}>@{user?.username}</Text>
        </View>

        {/* PERSONAL INFO CARD */}
        <View style={styles.listCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>PERSONAL INFO</Text>
            {updateAccountMutation.isPending ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => {
                  if (isEditing) handleSaveProfile();
                  else setIsEditing(true);
                }}
              >
                <Text style={styles.editText}>
                  {isEditing ? "Save Changes" : "Edit"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {updateError ? (
            <Text style={styles.errorText}>{updateError}</Text>
          ) : null}

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>FULL NAME</Text>
            {isEditing ? (
              <TextInput
                style={styles.inputField}
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.staticValue}>{user?.name || "Not set"}</Text>
            )}
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>USERNAME</Text>
            {isEditing ? (
              <TextInput
                style={styles.inputField}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.staticValue}>{user?.username}</Text>
            )}
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>PHONE NUMBER</Text>
            {isEditing ? (
              <TextInput
                style={styles.inputField}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+250..."
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.staticValue}>
                {user?.phone_number || "Add phone number"}
              </Text>
            )}
          </View>

          <View
            style={[
              styles.inputRow,
              (!isEditing || !needsPasswordConfirm) && styles.noBorder,
            ]}
          >
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            {isEditing ? (
              <TextInput
                style={styles.inputField}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.staticValue}>{user?.email || "Not set"}</Text>
            )}
          </View>

          {isEditing && needsPasswordConfirm && (
            <View style={[styles.inputRow, styles.noBorder]}>
              <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
              <TextInput
                style={styles.inputField}
                value={emailPassword}
                onChangeText={setEmailPassword}
                secureTextEntry
                placeholder="Confirm password to save changes"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.helperText}>
                Required to change your email address or phone number.{" "}
              </Text>
            </View>
          )}
        </View>

        {/* SECURITY & AUTH */}
        <View style={styles.listCard}>
          <Text style={styles.sectionTitle}>SECURITY</Text>

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => setPassModalVisible(true)}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
                <Ionicons name="key" size={20} color="#4B5563" />
              </View>
              <Text style={styles.rowText}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.rowItem, styles.noBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: "#FFF7ED" }]}>
                <Ionicons name="wallet" size={20} color="#F97316" />
              </View>
              <Text style={styles.rowText}>Linked MoMo Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </TouchableOpacity>
        </View>

        {/* NOTIFICATIONS */}
        <View style={styles.listCard}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
                <Ionicons name="notifications" size={20} color="#4B5563" />
              </View>
              <View>
                <Text style={styles.rowText}>Push Notifications</Text>
                <Text style={styles.rowSub}>Weekly allowance updates</Text>
              </View>
            </View>
            <Switch
              value={pushOn}
              onValueChange={setPushOn}
              trackColor={{ false: "#E5E7EB", true: "#111827" }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[styles.rowItem, styles.noBorder]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
                <Ionicons name="cash" size={20} color="#4B5563" />
              </View>
              <View>
                <Text style={styles.rowText}>Deposit Alerts</Text>
                <Text style={styles.rowSub}>When stipend is split</Text>
              </View>
            </View>
            <Switch
              value={alertsOn}
              onValueChange={setAlertsOn}
              trackColor={{ false: "#E5E7EB", true: "#111827" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity
          style={styles.logoutCard}
          activeOpacity={0.8}
          onPress={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <Ionicons name="log-out-outline" size={22} color="#DC2626" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* --- CHANGE PASSWORD MODAL --- */}
      <Modal
        visible={isPassModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPassModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPassModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {passError ? (
              <Text style={styles.errorText}>{passError}</Text>
            ) : null}
            {passSuccess ? (
              <Text style={styles.successText}>{passSuccess}</Text>
            ) : null}
            {user?.has_local_password !== false && (
              <>
                <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
                <TextInput
                  style={[styles.inputField, { marginBottom: 16 }]}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
              </>
            )}
            {user?.has_local_password === false && (
              <Text style={[styles.helperText, { marginBottom: 16 }]}>
                You signed in with Google. You will be asked to confirm with
                Google before your password is set.
              </Text>
            )}
            <Text style={styles.inputLabel}>NEW PASSWORD</Text>{" "}
            <TextInput
              style={[styles.inputField, { marginBottom: 16 }]}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              style={[styles.inputField, { marginBottom: 24 }]}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity
              style={styles.modalBtn}
              activeOpacity={0.8}
              onPress={handleChangePassword}
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: { padding: 24, paddingTop: 16, paddingBottom: 40 },

  headerCard: { alignItems: "center", paddingVertical: 24, marginBottom: 16 },
  avatarContainer: { position: "relative", marginBottom: 16 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F97316",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarText: { color: "#FFFFFF", fontSize: 28, fontWeight: "800" },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: -4,
    backgroundColor: "#111827",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  userRole: { fontSize: 14, color: "#6B7280", fontWeight: "500" },

  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
  },
  editText: { fontSize: 13, fontWeight: "800", color: "#DC2626" },

  inputRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  noBorder: { borderBottomWidth: 0, paddingBottom: 4 },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  staticValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    paddingVertical: 4,
  },
  helperText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F59E0B",
    marginTop: 6,
    marginLeft: 4,
  },

  rowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 16 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  rowText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  rowSub: { fontSize: 12, color: "#6B7280", fontWeight: "500" },

  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    marginTop: 8,
  },
  logoutText: { fontSize: 16, fontWeight: "800", color: "#DC2626" },

  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  successText: {
    color: "#059669",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#111827" },
  modalBtn: {
    backgroundColor: "#111827",
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
