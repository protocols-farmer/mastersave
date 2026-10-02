// src/app/(tabs)/grow/index.tsx
import { View, StyleSheet } from "react-native";
import GrowTab from "./_GrowTab";

export default function GrowIndex() {
  return (
    <View style={styles.container}>
      <GrowTab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
});
