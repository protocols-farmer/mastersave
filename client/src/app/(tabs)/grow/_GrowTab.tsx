// src/app/(tabs)/grow/_GrowTab.tsx
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
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFinanceDashboardQuery,
  useGrowMoneyMutation,
} from "../../lib/features/finance/financeQueries";

export default function GrowTab() {
  const { data: dashboard, isLoading, error } = useFinanceDashboardQuery();
  const growMutation = useGrowMoneyMutation();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [agreeToBreakLock, setAgreeToBreakLock] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");

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

  const spendBal = Number(dashboard.spend_balance) || 0;
  const saveBal = Number(dashboard.save_balance) || 0;
  const growBal = Number(dashboard.grow_balance) || 0;
  const totalBalance = spendBal + saveBal + growBal;

  const spendPct = dashboard.spend_percentage;
  const savePct = dashboard.save_percentage;
  const growPct = dashboard.grow_percentage;

  // Simulate 7% annual interest for display on the principal
  const simulatedProjectedInterest = (growBal * 0.07).toFixed(0);

  const handleEarlyWithdraw = () => {
    setWithdrawError("");
    setWithdrawSuccess("");
    const amount = Number(withdrawAmount);

    if (!amount || amount < 100) {
      setWithdrawError("Minimum withdrawal is 100 RWF.");
      return;
    }

    if (!agreeToBreakLock) {
      setWithdrawError(
        "You must agree to forfeit interest to unlock these funds early.",
      );
      return;
    }

    if (amount > growBal) {
      setWithdrawError("Insufficient funds in Grow principal.");
      return;
    }

    growMutation.mutate(
      { amount, breakLock: agreeToBreakLock },
      {
        onSuccess: (data) => {
          setWithdrawSuccess(data.message || "Early withdrawal processed.");
          setWithdrawAmount("");
          setAgreeToBreakLock(false);
          setTimeout(() => setWithdrawSuccess(""), 4000);
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
          <View style={[styles.summaryBox, styles.inactiveBox]}>
            <Text style={[styles.tabTitle, styles.inactiveText]}>Spend</Text>
            <Text style={[styles.tabSub, styles.inactiveTextSub]}>
              {spendBal >= 1000 ? `${(spendBal / 1000).toFixed(0)}K` : spendBal}
            </Text>
          </View>
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
          <View style={[styles.summaryBox, styles.activeBoxRed]}>
            <Text style={[styles.tabTitle, styles.activeText]}>Grow</Text>
            <Text style={[styles.tabSub, styles.activeTextSub]}>
              {growBal >= 1000 ? `${(growBal / 1000).toFixed(0)}K` : growBal}
            </Text>
          </View>
          <View style={styles.activeDot} />
        </View>
      </View>

      {/* 3. GROW CONTENT */}
      <View style={styles.mainCard}>
        <Text style={styles.cardLabel}>TOTAL GROWING</Text>
        <View style={styles.amountRow}>
          <Text style={styles.cardCurrency}>RWF</Text>
          <Text style={styles.cardAmount}>{growBal.toLocaleString()}</Text>
        </View>
        <View style={styles.greenPill}>
          <Text style={styles.greenPillText}>
            ↗ +RWF {Number(simulatedProjectedInterest).toLocaleString()}{" "}
            projected in 12 months
          </Text>
        </View>

        {/* IMPULSE BLOCKER WITHDRAWAL UI */}
        <View style={styles.withdrawSection}>
          <Text style={styles.withdrawLabel}>EARLY LIQUIDATION</Text>

          {withdrawError ? (
            <Text style={styles.errorTextSmall}>{withdrawError}</Text>
          ) : null}
          {withdrawSuccess ? (
            <Text style={styles.successTextSmall}>{withdrawSuccess}</Text>
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
          </View>

          <View style={styles.penaltyToggleRow}>
            <Switch
              value={agreeToBreakLock}
              onValueChange={setAgreeToBreakLock}
              trackColor={{ false: "#E5E7EB", true: "#DC2626" }}
              thumbColor="#FFFFFF"
            />
            <Text style={styles.penaltyText}>
              I accept that breaking the 30-day lock forfeits all generated
              interest.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.withdrawBtn,
              (!agreeToBreakLock || growMutation.isPending) &&
                styles.withdrawBtnDisabled,
            ]}
            onPress={handleEarlyWithdraw}
            disabled={!agreeToBreakLock || growMutation.isPending}
            activeOpacity={0.8}
          >
            {growMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.withdrawBtnText}>
                Forfeit Interest & Withdraw
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.listCard}>
        <View>
          <Text style={styles.listTitle}>Investment Balance</Text>
          <Text style={styles.listSub}>Held with a licensed partner</Text>
        </View>
        <View style={styles.amountRowSmall}>
          <Text style={styles.listCurrency}>RWF</Text>
          <Text style={styles.listAmount}>{growBal.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.listCard}>
        <View>
          <Text style={styles.listTitle}>Annual Rate</Text>
          <Text style={styles.listSub}>Compounding yearly on your balance</Text>
        </View>
        <Text style={styles.listAmount}>7%</Text>
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
  greenPill: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  greenPillText: { color: "#059669", fontWeight: "800", fontSize: 14 },

  withdrawSection: {
    marginTop: 16,
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
  successTextSmall: {
    color: "#059669",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  withdrawInputRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  withdrawInput: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },

  penaltyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  penaltyText: { flex: 1, fontSize: 13, color: "#991B1B", fontWeight: "600" },

  withdrawBtn: {
    backgroundColor: "#DC2626",
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  withdrawBtnDisabled: { opacity: 0.5, backgroundColor: "#9CA3AF" },
  withdrawBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

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
});
