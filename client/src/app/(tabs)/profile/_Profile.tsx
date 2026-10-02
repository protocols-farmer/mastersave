// src/app/(tabs)/profile/_Profile.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Profile() {
  // Personal Info State
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("Ntwali Thomas");
  const [phone, setPhone] = useState("+250 788 123 456");
  const email = "ntwali.thomas@example.com"; // Read-only

  // Notifications State
  const [pushOn, setPushOn] = useState(true);
  const [alertsOn, setAlertsOn] = useState(true);
  const [marketingOn, setMarketingOn] = useState(false);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* PROFILE HEADER */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>NT</Text>
        </View>
        <Text style={styles.userName}>{name}</Text>
        <Text style={styles.userRole}>Student Stipend Account</Text>
      </View>

      {/* PERSONAL INFO CARD */}
      <View style={styles.listCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>PERSONAL INFO</Text>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => setIsEditing(!isEditing)}
          >
            <Text style={styles.editText}>
              {isEditing ? "Save Changes" : "Edit"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Name */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>FULL NAME</Text>
          {isEditing ? (
            <TextInput
              style={styles.inputField}
              value={name}
              onChangeText={setName}
              placeholderTextColor="#9CA3AF"
            />
          ) : (
            <Text style={styles.staticValue}>{name}</Text>
          )}
        </View>

        {/* Phone */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>PHONE NUMBER</Text>
          {isEditing ? (
            <TextInput
              style={styles.inputField}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#9CA3AF"
            />
          ) : (
            <Text style={styles.staticValue}>
              {phone || "Add phone number"}
            </Text>
          )}
        </View>

        {/* Email (Read-Only) */}
        <View style={[styles.inputRow, styles.noBorder]}>
          <View style={styles.readOnlyHeader}>
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <Ionicons name="lock-closed" size={12} color="#9CA3AF" />
          </View>
          <Text style={styles.readOnlyValue}>{email}</Text>
        </View>
      </View>

      {/* SECURITY & AUTH */}
      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>SECURITY</Text>

        <TouchableOpacity style={styles.rowItem}>
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

        <View style={styles.rowItem}>
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

        <View style={[styles.rowItem, styles.noBorder]}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconBox, { backgroundColor: "#F3F4F6" }]}>
              <Ionicons name="mail" size={20} color="#4B5563" />
            </View>
            <View>
              <Text style={styles.rowText}>Marketing</Text>
              <Text style={styles.rowSub}>News and promotions</Text>
            </View>
          </View>
          <Switch
            value={marketingOn}
            onValueChange={setMarketingOn}
            trackColor={{ false: "#E5E7EB", true: "#111827" }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* SUPPORT */}
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

      {/* LOGOUT BUTTON */}
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
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#F97316",
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
  },

  // List Cards
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
  editText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#DC2626", // Client's red for action
  },

  // Editable Input Rows
  inputRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
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
  readOnlyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readOnlyValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9CA3AF", // Grayed out to indicate non-editable
    paddingVertical: 4,
  },

  // Standard Rows
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
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },

  // Logout Card
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
  logoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#DC2626",
  },
});
