// src/app/(tabs)/save/_SaveTab.tsx
import React from "react";
import { View, Text, ScrollView, StyleSheet, Platform } from "react-native";

export default function SaveTab() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. HERO SECTION */}
      <View style={styles.heroSection}>
        <Text style={styles.heroLabel}>TOTAL DEPOSITED</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>RWF</Text>
          <Text style={styles.hugeAmount}>1,200,000</Text>
        </View>
        <Text style={styles.heroSubtext}>
          Split across Spend, Save, and Grow
        </Text>
        <View style={styles.segmentedBar}>
          <View
            style={[styles.segment, { flex: 5, backgroundColor: "#DC2626" }]}
          />
          <View
            style={[styles.segment, { flex: 4, backgroundColor: "#F59E0B" }]}
          />
          <View
            style={[styles.segment, { flex: 1, backgroundColor: "#111827" }]}
          />
        </View>
      </View>

      {/* 2. ALLOCATION SUMMARY (Static Views) */}
      <View style={styles.tabContainer}>
        <View style={styles.tabWrapper}>
          <View style={[styles.summaryBox, styles.inactiveBox]}>
            <Text style={[styles.tabTitle, styles.inactiveText]}>Spend</Text>
            <Text style={[styles.tabSub, styles.inactiveTextSub]}>600K</Text>
          </View>
        </View>

        <View style={styles.tabWrapper}>
          <View style={[styles.summaryBox, styles.activeBoxRed]}>
            <Text style={[styles.tabTitle, styles.activeText]}>Save</Text>
            <Text style={[styles.tabSub, styles.activeTextSub]}>480K</Text>
          </View>
          <View style={styles.activeDot} />
        </View>

        <View style={styles.tabWrapper}>
          <View style={[styles.summaryBox, styles.inactiveBox]}>
            <Text style={[styles.tabTitle, styles.inactiveText]}>Grow</Text>
            <Text style={[styles.tabSub, styles.inactiveTextSub]}>120K</Text>
          </View>
        </View>
      </View>

      {/* 3. SAVE CONTENT */}
      <View style={styles.mainCard}>
        <Text style={styles.cardLabel}>TOTAL SAVED</Text>
        <View style={styles.amountRow}>
          <Text style={styles.cardCurrency}>RWF</Text>
          <Text style={styles.cardAmount}>480,000</Text>
        </View>
        <Text style={styles.cardFooterText}>Growing at 7% per year</Text>
      </View>

      <View style={styles.listCard}>
        <View style={styles.listContentLeft}>
          <Text style={styles.listTitle}>Goal Lock</Text>
          <Text style={styles.listSub}>Locked until target is reached</Text>
          <View style={styles.badgeRed}>
            <Text style={styles.badgeRedText}>LOCKED</Text>
          </View>
        </View>
        <View style={styles.amountRowSmall}>
          <Text style={styles.listCurrency}>RWF</Text>
          <Text style={styles.listAmount}>360,000</Text>
        </View>
      </View>

      <View style={styles.listCard}>
        <View style={styles.listContentLeft}>
          <Text style={styles.listTitle}>Emergency Save</Text>
          <Text style={styles.listSub}>Available for genuine emergencies</Text>
          <View style={styles.badgeOrange}>
            <Text style={styles.badgeOrangeText}>FLEXIBLE</Text>
          </View>
        </View>
        <View style={styles.amountRowSmall}>
          <Text style={styles.listCurrency}>RWF</Text>
          <Text style={styles.listAmount}>120,000</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: { padding: 24, paddingBottom: 40 },
  heroSection: { marginBottom: 24 },
  heroLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 4,
  },
  currency: { fontSize: 20, fontWeight: "800", color: "#9CA3AF" },
  hugeAmount: {
    fontSize: 48,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -1,
  },
  heroSubtext: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
    marginBottom: 16,
  },
  segmentedBar: { flexDirection: "row", height: 6, gap: 4 },
  segment: { borderRadius: 3 },

  tabContainer: { flexDirection: "row", gap: 12, marginBottom: 32 },
  tabWrapper: { flex: 1, alignItems: "center" },
  summaryBox: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  activeBoxRed: {
    backgroundColor: "#DC2626",
    ...Platform.select({
      ios: {
        shadowColor: "#DC2626",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 8px 24px rgba(220, 38, 38, 0.4)" },
    }),
  },
  inactiveBox: { backgroundColor: "#F3F4F6" },
  tabTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  tabSub: { fontSize: 12, fontWeight: "600" },
  activeText: { color: "#FFFFFF" },
  activeTextSub: { color: "rgba(255,255,255,0.8)" },
  inactiveText: { color: "#6B7280" },
  inactiveTextSub: { color: "#9CA3AF" },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#DC2626",
    marginTop: 8,
  },

  mainCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  cardCurrency: { fontSize: 18, fontWeight: "800", color: "#9CA3AF" },
  cardAmount: {
    fontSize: 40,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -1,
    marginBottom: 16,
  },
  cardFooterText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  listCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 12,
  },
  listContentLeft: { alignItems: "flex-start" },
  listTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  listSub: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    marginBottom: 8,
  },
  amountRowSmall: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  listCurrency: { fontSize: 12, fontWeight: "800", color: "#9CA3AF" },
  listAmount: { fontSize: 20, fontWeight: "900", color: "#111827" },
  badgeRed: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeRedText: {
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  badgeOrange: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeOrangeText: {
    color: "#D97706",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
