import { Badge } from "@/lib/badges";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  badge: Badge;
  /** "full" = icon + label chip (profile page), "dot" = icon only small dot (feed) */
  size?: "full" | "dot";
}

export function ProfileBadge({ badge, size = "full" }: Props) {
  if (size === "dot") {
    return (
      <View style={[styles.dot, { backgroundColor: badge.color + "22", borderColor: badge.color + "44" }]}>
        <Ionicons name={badge.icon as any} size={9} color={badge.color} />
      </View>
    );
  }

  return (
    <View style={[styles.chip, { backgroundColor: badge.color + "18", borderColor: badge.color + "40" }]}>
      <Ionicons name={badge.icon as any} size={10} color={badge.color} />
      <Text style={[styles.label, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
