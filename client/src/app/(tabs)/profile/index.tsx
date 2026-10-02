// src/app/(tabs)/profile/index.tsx
import { View, StyleSheet } from "react-native";
import Profile from "./_Profile";

export default function ProfileIndex() {
  return (
    <View style={styles.container}>
      <Profile />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
