// src/app/(tabs)/index.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { mockWallet } from "../../lib/mock/data";

const MC_ORANGE = "#FF5F00";
const MC_YELLOW = "#F79E1B";
const DARK_CHARCOAL = "#1A1A1C";

export default function Home() {
  // Initialize state from our mock data
  const [usePct, setUsePct] = useState(mockWallet.rules.use);
  const [savePct, setSavePct] = useState(mockWallet.rules.save);
  const [investPct, setInvestPct] = useState(mockWallet.rules.invest);

  // Calculate actual RWF balances
  const useBalance = (mockWallet.totalReceived * usePct) / 100;
  const saveBalance = (mockWallet.totalReceived * savePct) / 100;
  const investBalance = (mockWallet.totalReceived * investPct) / 100;

  // Handlers: Save and Invest changes always pull from the "Use" bucket
  const increaseSave = () => {
    if (usePct >= 5) {
      setSavePct(savePct + 5);
      setUsePct(usePct - 5);
    }
  };
  const decreaseSave = () => {
    if (savePct >= 5) {
      setSavePct(savePct - 5);
      setUsePct(usePct + 5);
    }
  };

  const increaseInvest = () => {
    if (usePct >= 5) {
      setInvestPct(investPct + 5);
      setUsePct(usePct - 5);
    }
  };
  const decreaseInvest = () => {
    if (investPct >= 5) {
      setInvestPct(investPct - 5);
      setUsePct(usePct + 5);
    }
  };

  // Increasing Use pulls from Save (as long as Save has at least 5%)
  const increaseUse = () => {
    if (savePct >= 5) {
      setUsePct(usePct + 5);
      setSavePct(savePct - 5);
    }
  };
  const decreaseUse = () => {
    if (usePct >= 5) {
      setUsePct(usePct - 5);
      setSavePct(savePct + 5);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* GREETING (Glassmorphism) */}
      <View style={styles.greetingGlass}>
        <Text style={styles.greetingText}>Hello, Alex 👋</Text>
        <Text style={styles.subGreeting}>Here's your stipend breakdown.</Text>
      </View>

      {/* BANNER: UNALLOCATED TOTAL */}
      <LinearGradient colors={["#FF5F00", "#F79E1B"]} style={styles.mainBanner}>
        <Text style={styles.bannerLabel}>Unallocated Total</Text>
        <Text style={styles.bannerAmount}>
          {mockWallet.totalReceived.toLocaleString()} RWF
        </Text>
      </LinearGradient>

      {/* ACTION BUTTON */}
      <TouchableOpacity style={styles.masterButton} activeOpacity={0.8}>
        <Text style={styles.masterButtonText}>+ Simulate MoMo Deposit</Text>
      </TouchableOpacity>

      {/* 1. USE CONTAINER */}
      <View style={styles.glassCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Money to Use</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{usePct}%</Text>
          </View>
        </View>

        <Text style={styles.balanceText}>
          {useBalance.toLocaleString()} RWF
        </Text>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlBtn, styles.bgYellow]}
            onPress={decreaseUse}
          >
            <Text style={styles.controlTextBlack}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, styles.bgYellow]}
            onPress={increaseUse}
          >
            <Text style={styles.controlTextBlack}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. SAVE CONTAINER */}
      <View style={styles.glassCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Saved (Locked)</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{savePct}%</Text>
          </View>
        </View>

        <Text style={styles.balanceText}>
          {saveBalance.toLocaleString()} RWF
        </Text>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlBtn, styles.bgOrange]}
            onPress={decreaseSave}
          >
            <Text style={styles.controlTextWhite}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, styles.bgOrange]}
            onPress={increaseSave}
          >
            <Text style={styles.controlTextWhite}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. INVEST CONTAINER */}
      <View style={styles.glassCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Invested</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{investPct}%</Text>
          </View>
        </View>

        <Text style={styles.balanceText}>
          {investBalance.toLocaleString()} RWF
        </Text>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlBtn, styles.bgDark]}
            onPress={decreaseInvest}
          >
            <Text style={styles.controlTextWhite}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, styles.bgDark]}
            onPress={increaseInvest}
          >
            <Text style={styles.controlTextWhite}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContent: {
    padding: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },

  // Greeting Section
  greetingGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    padding: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
      web: {
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        backdropFilter: "blur(16px)",
      },
    }),
  },
  greetingText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1A1A1C",
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 15,
    color: "#4A4A4A",
    fontWeight: "600",
  },

  // Main Banner
  mainBanner: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: MC_ORANGE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 8px 24px rgba(255, 95, 0, 0.4)" },
    }),
  },
  bannerLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bannerAmount: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  // Master Deposit Button
  masterButton: {
    backgroundColor: MC_YELLOW,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 30,
    ...Platform.select({
      ios: {
        shadowColor: MC_YELLOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 4px 16px rgba(247, 158, 27, 0.3)" },
    }),
  },
  masterButtonText: {
    color: "#1A1A1C",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // Glassmorphism Cards
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
      web: {
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        backdropFilter: "blur(16px)",
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1A1A1C",
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  badgeText: {
    fontWeight: "900",
    color: "#1A1A1C",
  },
  balanceText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1A1A1C",
    marginBottom: 24,
  },

  // Controls
  controlsRow: {
    flexDirection: "row",
    gap: 12,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  bgYellow: {
    backgroundColor: MC_YELLOW,
  },
  bgOrange: {
    backgroundColor: MC_ORANGE,
  },
  bgDark: {
    backgroundColor: DARK_CHARCOAL, // Black/Charcoal for the Invest buttons
  },
  controlTextBlack: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1C",
  },
  controlTextWhite: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
