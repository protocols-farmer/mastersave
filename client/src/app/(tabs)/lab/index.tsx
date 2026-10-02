// src/app/(tabs)/lab/index.tsx
import { View, StyleSheet } from "react-native";
import LabTab from "./_LabTab";

export default function LabIndex() {
  return (
    <View style={styles.container}>
      <LabTab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
