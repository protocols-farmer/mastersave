// src/components/layouts/navigation/links.ts
import { Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

export type NavLink = {
  name: string;
  path: Href;
  icon: IconName;
};

export const bottomTabs: NavLink[] = [
  { name: "Spend", path: "/", icon: "wallet" },
  { name: "Save", path: "/save", icon: "lock-closed" },
  { name: "Grow", path: "/grow", icon: "trending-up" },
  { name: "History", path: "/history", icon: "list" },
];

export const sidebarLinks: NavLink[] = [
  { name: "Profile", path: "/profile", icon: "person" },
  { name: "Settings", path: "/settings", icon: "settings" },
  { name: "About", path: "/about", icon: "information-circle" },
];
