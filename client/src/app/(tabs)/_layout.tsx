// src/app/(tabs)/_layout.tsx
import { View, StyleSheet } from "react-native";
import { Slot } from "expo-router";
import Bottombar from "../../components/layouts/navigation/Bottombar";
import Header from "../../components/layouts/header/Header";

export default function TabsLayout() {
  return (
    <View style={styles.masterContainer}>
      <Header />

      <View style={styles.content}>
        <Slot />
      </View>

      <Bottombar />
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
