// src/components/layouts/navigation/Bottombar.tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { bottomTabs } from "./links";

const Bottombar = () => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.glassContainer}>
      {bottomTabs.map((tab) => {
        const isActive = pathname === tab.path;

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tabItem}
            onPress={() => router.push(tab.path)}
          >
            <View
              style={[styles.iconWrapper, isActive && styles.activeIconWrapper]}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                // Color switches to Mastercard Orange when active
                color={isActive ? "#FF5F00" : "#4A4A4A"}
                style={isActive ? styles.activeIcon : styles.icon}
              />
            </View>
            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default Bottombar;

const styles = StyleSheet.create({
  glassContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.5)",
    ...Platform.select({
      web: { backdropFilter: "blur(10px)" },
    }),
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 2,
    borderColor: "transparent",
  },
  activeIconWrapper: {
    borderColor: "#FF5F00",
    backgroundColor: "rgba(255, 95, 0, 0.1)",
  },
  icon: {
    opacity: 0.6,
  },
  activeIcon: {
    opacity: 1,
  },
  label: {
    fontSize: 11,
    color: "#4A4A4A",
    fontWeight: "600",
  },
  activeLabel: {
    color: "#FF5F00",
    fontWeight: "900",
  },
});
