// src/app/(auth)/login/index.tsx
import { View, StyleSheet } from "react-native";
import LoginForm from "./_LoginForm";

export default function LoginIndex() {
  return (
    <View style={styles.container}>
      <LoginForm />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
