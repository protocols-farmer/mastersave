// src/components/layouts/navigation/links.ts
import { Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// This extracts all valid icon names from Ionicons so TypeScript auto-completes them for you
type IconName = keyof typeof Ionicons.glyphMap;

export type NavLink = {
  name: string;
  path: Href;
  icon: IconName;
};

export const bottomTabs: NavLink[] = [
  { name: "Home", path: "/", icon: "home" },
  { name: "Use", path: "/use", icon: "card" },
  { name: "Save", path: "/saved", icon: "lock-closed" },
  { name: "History", path: "/history", icon: "list" },
];

export const sidebarLinks: NavLink[] = [
  { name: "Profile", path: "/profile", icon: "person" },
  { name: "Settings", path: "/settings", icon: "settings" },
  { name: "About", path: "/about", icon: "information-circle" },
];
