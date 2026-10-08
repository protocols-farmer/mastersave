// src/app/(tabs)/_layout.tsx
import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Slot } from "expo-router";
import Bottombar from "../../components/layouts/navigation/Bottombar";
import Header from "../../components/layouts/header/Header";
import DepositModal from "../../components/features/finance/DepositModal";

export default function TabsLayout() {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  return (
    <View style={styles.masterContainer}>
      <Header onOpenDeposit={() => setIsDepositModalOpen(true)} />

      <View style={styles.content}>
        <Slot />
      </View>

      <Bottombar />

      {/* Renders globally over the entire tab stack */}
      <DepositModal
        visible={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  masterContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
});
