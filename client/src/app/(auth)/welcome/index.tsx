// src/app/(auth)/welcome/index.tsx
import { View, StyleSheet } from "react-native";
import Welcome from "./_Welcome";

export default function WelcomeIndex() {
  return (
    <View style={styles.container}>
      <Welcome />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
