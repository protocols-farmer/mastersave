// src/app/(tabs)/profile/_Profile.tsx
import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Profile() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* PROFILE HEADER (Clean & Flat) */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>NT</Text>
        </View>
        <Text style={styles.userName}>Ntwali Thomas</Text>
        <Text style={styles.userRole}>Student Stipend Account</Text>
        <View style={styles.phoneBadge}>
          <Text style={styles.phoneText}>+250 788 123 456</Text>
        </View>
      </View>

      {/* ACCOUNT SETTINGS (Clinical List Card) */}
      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>

        <TouchableOpacity style={styles.rowItem}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconBox, { backgroundColor: "#FFF7ED" }]}>
              <Ionicons name="wallet" size={20} color="#F97316" />
            </View>
            <Text style={styles.rowText}>Linked MoMo Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.rowItem}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
              <Ionicons name="notifications" size={20} color="#4B5563" />
            </View>
            <Text style={styles.rowText}>Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.rowItem, styles.noBorder]}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
              <Ionicons name="lock-closed" size={20} color="#4B5563" />
            </View>
            <Text style={styles.rowText}>Security & PIN</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
        </TouchableOpacity>
      </View>

      {/* SUPPORT & ABOUT */}
      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>SUPPORT</Text>

        <TouchableOpacity style={styles.rowItem}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
              <Ionicons name="help-buoy" size={20} color="#4B5563" />
            </View>
            <Text style={styles.rowText}>Help Center</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.rowItem, styles.noBorder]}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
              <Ionicons name="information-circle" size={20} color="#4B5563" />
            </View>
            <Text style={styles.rowText}>About MasterSave</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
        </TouchableOpacity>
      </View>

      {/* LOGOUT BUTTON (Client's Red) */}
      <TouchableOpacity style={styles.logoutCard} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={22} color="#DC2626" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF", // Pure white background
  },
  scrollContent: {
    padding: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Header Details
  headerCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F97316", // Orange from the client's mockup header
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  userName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  userRole: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
    marginBottom: 16,
  },
  phoneBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  phoneText: {
    fontWeight: "700",
    color: "#374151",
    fontSize: 13,
  },

  // List Cards
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F3F4F6", // Crisp 1px gray border
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    marginBottom: 16,
    letterSpacing: 1,
  },
  rowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  noBorder: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
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
  },

  // Logout Card
  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2", // Very faint red background
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#DC2626", // Client's exact red
  },
});
