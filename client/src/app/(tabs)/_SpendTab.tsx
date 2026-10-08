// src/app/(tabs)/_SpendTab.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFinanceDashboardQuery,
  useSpendMoneyMutation,
} from "../../lib/features/finance/financeQueries";

export default function SpendTab() {
  // 1. Fetch real dashboard data from PostgreSQL
  const { data: dashboard, isLoading, error } = useFinanceDashboardQuery();

  // 2. Setup the withdrawal mutation
  const spendMutation = useSpendMoneyMutation();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#DC2626" />
        <Text style={styles.loadingText}>Loading Vault...</Text>
      </View>
    );
  }

  if (error || !dashboard) {
    return (
      <View style={[styles.container, styles.centerAll]}>
        <Text style={styles.errorText}>Failed to load financial data.</Text>
      </View>
    );
  }

  // Calculate totals and format numbers safely
  const spendBal = Number(dashboard.spend_balance) || 0;
  const saveBal = Number(dashboard.save_balance) || 0;
  const growBal = Number(dashboard.grow_balance) || 0;
  const totalBalance = spendBal + saveBal + growBal;

  const spendPct = dashboard.spend_percentage;
  const savePct = dashboard.save_percentage;
  const growPct = dashboard.grow_percentage;

  const handleWithdraw = () => {
    setWithdrawError("");
    const amount = Number(withdrawAmount);

    if (!amount || amount < 100) {
      setWithdrawError("Minimum withdrawal is 100 RWF.");
      return;
    }

    if (amount > spendBal) {
      setWithdrawError("Insufficient funds in Spend bucket.");
      return;
    }

    spendMutation.mutate(
      { amount },
      {
        onSuccess: () => {
          setWithdrawAmount("");
        },
        onError: (err: any) => {
          setWithdrawError(err.response?.data?.error || "Withdrawal failed.");
        },
      },
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. HERO SECTION */}
      <View style={styles.heroSection}>
        <Text style={styles.heroLabel}>TOTAL VAULT BALANCE</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>RWF</Text>
          <Text style={styles.hugeAmount}>{totalBalance.toLocaleString()}</Text>
        </View>
        <Text style={styles.heroSubtext}>
          Split across Spend, Save, and Grow
        </Text>
        <View style={styles.segmentedBar}>
          <View
            style={[
              styles.segment,
              { flex: spendPct || 1, backgroundColor: "#DC2626" },
            ]}
          />
          <View
            style={[
              styles.segment,
              { flex: savePct || 1, backgroundColor: "#F59E0B" },
            ]}
          />
          <View
            style={[
              styles.segment,
              { flex: growPct || 1, backgroundColor: "#111827" },
            ]}
          />
        </View>
      </View>

      {/* 2. ALLOCATION SUMMARY */}
      <View style={styles.tabContainer}>
        <View style={styles.tabWrapper}>
          <View style={[styles.summaryBox, styles.activeBoxRed]}>
            <Text style={[styles.tabTitle, styles.activeText]}>Spend</Text>
            <Text style={[styles.tabSub, styles.activeTextSub]}>
              {spendBal >= 1000 ? `${(spendBal / 1000).toFixed(0)}K` : spendBal}
            </Text>
          </View>
          <View style={styles.activeDot} />
        </View>

        <View style={styles.tabWrapper}>
          <View style={[styles.summaryBox, styles.inactiveBox]}>
            <Text style={[styles.tabTitle, styles.inactiveText]}>Save</Text>
            <Text style={[styles.tabSub, styles.inactiveTextSub]}>
              {saveBal >= 1000 ? `${(saveBal / 1000).toFixed(0)}K` : saveBal}
            </Text>
          </View>
        </View>

        <View style={styles.tabWrapper}>
          <View style={[styles.summaryBox, styles.inactiveBox]}>
            <Text style={[styles.tabTitle, styles.inactiveText]}>Grow</Text>
            <Text style={[styles.tabSub, styles.inactiveTextSub]}>
              {growBal >= 1000 ? `${(growBal / 1000).toFixed(0)}K` : growBal}
            </Text>
          </View>
        </View>
      </View>

      {/* 3. SPEND CONTENT & SIMULATION */}
      <View style={styles.mainCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>AVAILABLE TO SPEND</Text>
          <TouchableOpacity activeOpacity={0.6}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.cardCurrency}>RWF</Text>
          <Text style={styles.cardAmount}>{spendBal.toLocaleString()}</Text>
        </View>

        {/* Withdrawal Simulator */}
        <View style={styles.withdrawSection}>
          <Text style={styles.withdrawLabel}>
            SIMULATE WITHDRAWAL (BUY LUNCH)
          </Text>
          {withdrawError ? (
            <Text style={styles.errorTextSmall}>{withdrawError}</Text>
          ) : null}

          <View style={styles.withdrawInputRow}>
            <TextInput
              style={styles.withdrawInput}
              placeholder="e.g. 5000"
              keyboardType="number-pad"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity
              style={[
                styles.withdrawBtn,
                spendMutation.isPending && styles.withdrawBtnDisabled,
              ]}
              onPress={handleWithdraw}
              disabled={spendMutation.isPending}
            >
              {spendMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.withdrawBtnText}>Withdraw</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.warningBox}>
          <Ionicons name="information-circle" size={14} color="#6B7280" />
          <Text style={styles.warningText}>
            Simulated withdrawals immediately deduct from your Spend balance and
            log a completed transaction.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  centerAll: { justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 24, paddingBottom: 40 },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "#4B5563",
  },
  errorText: { fontSize: 14, fontWeight: "700", color: "#DC2626" },

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
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
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

  withdrawSection: {
    marginTop: 8,
    marginBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  withdrawLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4B5563",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  errorTextSmall: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  withdrawInputRow: { flexDirection: "row", gap: 12 },
  withdrawInput: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  withdrawBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  withdrawBtnDisabled: { opacity: 0.7 },
  withdrawBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
    lineHeight: 16,
  },
});
