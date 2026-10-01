// src/components/layouts/header/Header.tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const Header = () => {
  return (
    <LinearGradient
      colors={["#1A1A1C", "#2D2D30"]}
      style={styles.headerContainer}
    >
      <View style={styles.headerContent}>
        {/* Hamburger Icon */}
        <TouchableOpacity style={styles.hamburger}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>

        {/* Center Title */}
        <Text style={styles.headerTitle}>
          Master<Text style={styles.titleAccent}>Save</Text>
        </Text>

        {/* Right Actions */}
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.notificationWrapper}>
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
            <View style={styles.notificationDot} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.avatarCircle}>
            <Ionicons name="person" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

export default Header;

const styles = StyleSheet.create({
  headerContainer: {
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 8px 20px rgba(0,0,0,0.3)" },
    }),
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hamburger: {
    width: 26,
    height: 20,
    justifyContent: "space-between",
  },
  hamburgerLine: {
    height: 3,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  titleAccent: {
    color: "#FF5F00",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  notificationWrapper: {
    position: "relative",
    padding: 4,
  },
  notificationDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    backgroundColor: "#EB001B",
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#2D2D30",
    zIndex: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    borderColor: "#F79E1B",
    justifyContent: "center",
    alignItems: "center",
  },
});
