// src/app/(tabs)/_layout.tsx
import { View, StyleSheet, ImageBackground } from "react-native";
import { Slot } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Bottombar from "../../components/layouts/navigation/Bottombar";
import Header from "../../components/layouts/header/Header";

const BG_IMAGE_URL = "";

export default function TabsLayout() {
  return (
    <View style={styles.masterContainer}>
      {/* 1. The Fallback Gradient (Red -> Orange -> Yellow) */}
      <LinearGradient
        colors={["#EB001B", "#FF5F00", "#F79E1B"]}
        style={StyleSheet.absoluteFill}
      />

      {/* 2. The Background Image (Covers gradient if it loads successfully) */}
      <ImageBackground
        source={{ uri: BG_IMAGE_URL }}
        style={styles.imageLayer}
        resizeMode="cover"
      >
        {/* The App Layout */}
        <Header />

        <View style={styles.content}>
          <Slot />
        </View>

        <Bottombar />
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  masterContainer: {
    flex: 1,
  },
  imageLayer: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  content: {
    flex: 1,
  },
});
