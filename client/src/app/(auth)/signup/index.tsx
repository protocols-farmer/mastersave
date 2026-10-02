// src/app/(auth)/signup/index.tsx
import { View, StyleSheet } from "react-native";
import Signup from "./_Signup";

export default function SignupIndex() {
  return (
    <View style={styles.container}>
      <Signup />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
