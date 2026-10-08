// src/app/(auth)/welcome/_Welcome.tsx
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  useWindowDimensions,
  ViewToken,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SlideKind = "rule" | "split" | "lock";

interface Slide {
  id: string;
  kind: SlideKind;
  eyebrow: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    id: "1",
    kind: "rule",
    eyebrow: "01 — SET YOUR RULE",
    title: "Decide before the money arrives.",
    body: "Choose how every deposit is divided between daily spending and your savings goals. For example, 60% to spend and 40% towards a new laptop.",
  },
  {
    id: "2",
    kind: "split",
    eyebrow: "02 — AUTOMATIC SPLIT",
    title: "Every deposit, divided on arrival.",
    body: "Deposit through Mobile Money. MasterSave applies your rule before the money reaches your balance, so your savings are set aside first.",
  },
  {
    id: "3",
    kind: "lock",
    eyebrow: "03 — BUILT-IN DISCIPLINE",
    title: "Savings that resist impulse.",
    body: "A locked goal cannot be withdrawn instantly. Taking money out early triggers a cooldown or a fee, so a late-night impulse has time to pass.",
  },
];

function RuleVisual() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>EXAMPLE RULE</Text>

      <View style={styles.splitBar}>
        <View
          style={[
            styles.splitBarSegment,
            { flex: 60, backgroundColor: "#111827" },
          ]}
        />
        <View
          style={[
            styles.splitBarSegment,
            { flex: 40, backgroundColor: "#D1D5DB" },
          ]}
        />
      </View>

      <View style={styles.cardRow}>
        <View style={styles.cardRowLeft}>
          <View style={[styles.swatch, { backgroundColor: "#111827" }]} />
          <Text style={styles.cardRowLabel}>Daily spending</Text>
        </View>
        <Text style={styles.cardRowValue}>60%</Text>
      </View>

      <View style={styles.cardRow}>
        <View style={styles.cardRowLeft}>
          <View style={[styles.swatch, { backgroundColor: "#D1D5DB" }]} />
          <Text style={styles.cardRowLabel}>Laptop fund</Text>
        </View>
        <Text style={styles.cardRowValue}>40%</Text>
      </View>
    </View>
  );
}

function SplitVisual() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>EXAMPLE DEPOSIT</Text>

      <View style={styles.cardRow}>
        <Text style={styles.cardRowLabel}>Stipend received</Text>
        <Text style={styles.cardRowValue}>RWF 100,000</Text>
      </View>

      <View style={styles.hairline} />

      <View style={styles.cardRow}>
        <Text style={styles.cardRowLabel}>To daily spending</Text>
        <Text style={styles.cardRowValue}>RWF 60,000</Text>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardRowLabel}>To laptop fund (locked)</Text>
        <Text style={styles.cardRowValue}>RWF 40,000</Text>
      </View>
    </View>
  );
}

function LockVisual() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>EXAMPLE GOAL</Text>

      <View style={styles.cardRow}>
        <Text style={styles.cardRowValue}>Laptop fund</Text>
        <Text style={styles.cardRowLabel}>Locked until 30 June</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardRowLabel}>Saved so far</Text>
        <Text style={styles.cardRowValue}>RWF 120,000 of 500,000</Text>
      </View>

      <View style={styles.hairline} />

      <View style={styles.cardRow}>
        <Text style={styles.cardRowLabel}>Early withdrawal</Text>
        <Text style={styles.cardRowValue}>24-hour cooldown or fee</Text>
      </View>
    </View>
  );
}

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Must be a stable reference, FlatList does not support changing this callback on the fly
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first && first.index !== null) {
        setCurrentIndex(first.index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* BRAND */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.redBlock} />
          <Text style={styles.logoText}>MasterSave</Text>
        </View>
      </View>

      {/* SWIPEABLE CONTENT */}
      <FlatList
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.slideContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.eyebrow}>{item.eyebrow}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>

            <View style={styles.visualWrap}>
              {item.kind === "rule" && <RuleVisual />}
              {item.kind === "split" && <SplitVisual />}
              {item.kind === "lock" && <LockVisual />}
            </View>
          </ScrollView>
        )}
      />

      {/* FOOTER: progress + actions (always visible) */}
      <View style={styles.footer}>
        <View style={styles.progressRow}>
          {SLIDES.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.progressSegment,
                index === currentIndex
                  ? styles.progressSegmentActive
                  : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.8}
            onPress={() => router.push("/(auth)/signup")}
          >
            <Text style={styles.primaryBtnText}>Create account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.8}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.secondaryBtnText}>Log in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // Brand
  header: {
    paddingHorizontal: 24,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  redBlock: {
    width: 16,
    height: 16,
    backgroundColor: "#DC2626",
    borderRadius: 4,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },

  // Slide text
  slideContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -1,
    lineHeight: 40,
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 24,
  },
  visualWrap: {
    marginTop: 32,
  },

  // Example cards
  card: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 20,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 16,
  },
  splitBar: {
    flexDirection: "row",
    gap: 4,
    height: 8,
    marginBottom: 20,
  },
  splitBarSegment: {
    borderRadius: 4,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  cardRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  cardRowLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  cardRowValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  hairline: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    marginVertical: 12,
  },
  progressFill: {
    width: "24%",
    height: 6,
    backgroundColor: "#111827",
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 24,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: "#111827",
  },
  progressSegmentInactive: {
    backgroundColor: "#E5E7EB",
  },

  // Buttons (same size and radius as the login and signup screens)
  buttons: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: "#111827",
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
});
