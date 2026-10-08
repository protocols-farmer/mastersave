// src/components/layouts/header/Header.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../../lib/features/auth/authStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HeaderProps {
  onOpenDeposit: () => void;
}

const Header = ({ onOpenDeposit }: HeaderProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);

  // Helper to generate initials if no avatar is uploaded
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

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
      {/* Left side: Logo & Title */}
      <View style={styles.logoRow}>
        <View style={styles.redBlock} />
        <Text style={styles.headerTitle}>MasterSave</Text>
      </View>

      {/* Right side: Actions */}
      <View style={styles.rightActions}>
        {/* Deposit Button - NOW WIRED TO PROPS */}
        <TouchableOpacity
          style={styles.depositBtn}
          activeOpacity={0.8}
          onPress={onOpenDeposit}
        >
          <Text style={styles.depoText}>Depo +</Text>
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatarCircle}
          activeOpacity={0.8}
          onPress={() => router.push("/profile")}
        >
          {user?.avatar_url && user.avatar_url.includes("cloudinary") ? (
            <Image
              source={{ uri: user.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>
              {getInitials(user?.name || user?.username || "")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default Header;

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  redBlock: {
    width: 16,
    height: 16,
    backgroundColor: "#DC2626",
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  depositBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  depoText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F97316",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
