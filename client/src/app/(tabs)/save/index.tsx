// src/app/(tabs)/save/index.tsx
import { View, StyleSheet } from "react-native";
import SaveTab from "./_SaveTab";

export default function SaveIndex() {
  return (
    <View style={styles.container}>
      <SaveTab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
});
