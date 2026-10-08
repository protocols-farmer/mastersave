// src/app/(tabs)/lab/_LabTab.tsx
import {
  useFinanceDashboardQuery,
  useUpdateRulesMutation,
} from "@/lib/features/finance/financeQueries";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

export default function LabTab() {
  const { data: dashboard, isLoading: isFetching } = useFinanceDashboardQuery();
  const updateRulesMutation = useUpdateRulesMutation();

  // Local state for the sliders
  const [spend, setSpend] = useState(50);
  const [save, setSave] = useState(40);
  const [grow, setGrow] = useState(10);
  const [updateMessage, setUpdateMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state when DB data arrives
  useEffect(() => {
    if (dashboard) {
      setSpend(dashboard.spend_percentage);
      setSave(dashboard.save_percentage);
      setGrow(dashboard.grow_percentage);
    }
  }, [dashboard]);

  // Logic to keep total exactly at 100%
  const increaseSave = () => {
    if (spend >= 5) {
      setSave(save + 5);
      setSpend(spend - 5);
    }
  };
  const decreaseSave = () => {
    if (save >= 5) {
      setSave(save - 5);
      setSpend(spend + 5);
    }
  };

  const increaseGrow = () => {
    if (spend >= 5) {
      setGrow(grow + 5);
      setSpend(spend - 5);
    }
  };
  const decreaseGrow = () => {
    if (grow >= 5) {
      setGrow(grow - 5);
      setSpend(spend + 5);
    }
  };

  const handleApplyRules = () => {
    setUpdateMessage("");
    setErrorMessage("");

    updateRulesMutation.mutate(
      { spendPercentage: spend, savePercentage: save, growPercentage: grow },
      {
        onSuccess: () => {
          setUpdateMessage("Rules successfully locked in.");
          setTimeout(() => setUpdateMessage(""), 3000);
        },
        onError: (err: any) => {
          setErrorMessage(
            err.response?.data?.error || "Failed to update rules.",
          );
        },
      },
    );
  };

  if (isFetching && !dashboard) {
    return (
      <View style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER SECTION */}
      <View style={styles.headerSection}>
        <Text style={styles.title}>Allocation Lab</Text>
        <Text style={styles.subTitle}>
          Set how your unallocated deposits are split automatically.
        </Text>
      </View>

      {/* VISUALIZER */}
      <View style={styles.visualizerCard}>
        <Text style={styles.visualizerLabel}>
          YOUR RULE: 100% DEPOSIT SPLIT
        </Text>

        <View style={styles.segmentedBar}>
          <View
            style={[
              styles.segment,
              { flex: spend || 1, backgroundColor: "#DC2626" },
            ]}
          />
          <View
            style={[
              styles.segment,
              { flex: save || 1, backgroundColor: "#F59E0B" },
            ]}
          />
          <View
            style={[
              styles.segment,
              { flex: grow || 1, backgroundColor: "#111827" },
            ]}
          />
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: "#DC2626" }]} />
            <Text style={styles.legendText}>Spend {spend}%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: "#F59E0B" }]} />
            <Text style={styles.legendText}>Save {save}%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: "#111827" }]} />
            <Text style={styles.legendText}>Grow {grow}%</Text>
          </View>
        </View>
      </View>

      {/* CONTROLS */}
      <Text style={styles.sectionTitle}>ADJUST PERCENTAGES</Text>

      {/* Spend Control */}
      <View style={styles.controlCard}>
        <View style={styles.controlInfo}>
          <Text style={styles.controlTitle}>Spend Allowance</Text>
          <Text style={styles.controlSub}>Available for immediate use</Text>
        </View>
        <View style={styles.badgeRed}>
          <Text style={styles.badgeRedText}>{spend}%</Text>
        </View>
      </View>

      {/* Save Control */}
      <View style={styles.controlCard}>
        <View style={styles.controlInfo}>
          <Text style={styles.controlTitle}>Savings Goals</Text>
          <Text style={styles.controlSub}>Locked and emergency funds</Text>
        </View>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={decreaseSave}>
            <Text style={styles.stepBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{save}%</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={increaseSave}>
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Grow Control */}
      <View style={styles.controlCard}>
        <View style={styles.controlInfo}>
          <Text style={styles.controlTitle}>Invest & Grow</Text>
          <Text style={styles.controlSub}>Long-term compounding</Text>
        </View>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={decreaseGrow}>
            <Text style={styles.stepBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{grow}%</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={increaseGrow}>
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Messages */}
      {updateMessage ? (
        <Text style={styles.successText}>{updateMessage}</Text>
      ) : null}
      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      {/* SAVE BUTTON */}
      <TouchableOpacity
        style={styles.saveButton}
        activeOpacity={0.9}
        onPress={handleApplyRules}
        disabled={updateRulesMutation.isPending}
      >
        {updateRulesMutation.isPending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Apply Default Rule</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  centerAll: { justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 24, paddingBottom: 40 },

  headerSection: { marginBottom: 24 },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subTitle: { fontSize: 14, color: "#6B7280", fontWeight: "500" },

  visualizerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 32,
  },
  visualizerLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 16,
  },
  segmentedBar: { flexDirection: "row", height: 12, gap: 4, marginBottom: 16 },
  segment: { borderRadius: 6 },
  legendRow: { flexDirection: "row", justifyContent: "space-between" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: "700", color: "#4B5563" },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 12,
  },

  controlCard: {
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
  controlInfo: { flex: 1 },
  controlTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  controlSub: { fontSize: 13, color: "#6B7280", fontWeight: "500" },

  badgeRed: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  badgeRedText: { color: "#DC2626", fontSize: 14, fontWeight: "900" },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  stepBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  stepBtnText: { fontSize: 18, fontWeight: "600", color: "#4B5563" },
  stepperValue: {
    width: 44,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },

  successText: {
    color: "#059669",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },

  saveButton: {
    backgroundColor: "#DC2626",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 12,
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
