// src/app/(tabs)/profile/index.tsx
import { View, StyleSheet } from "react-native";
import Profile from "./_Profile";

const ProfileIndex = () => {
  return (
    <View style={styles.container}>
      <Profile />
    </View>
  );
};

export default ProfileIndex;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
