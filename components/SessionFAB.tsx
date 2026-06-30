import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FAB_COLOR = "#F97316"; // vivid orange

interface Props {
  onPress: () => void;
}

export function SessionFAB({ onPress }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.wrap, { bottom: insets.bottom + 8 }]}
    >
      <View style={styles.fab}>
        <Ionicons name="add" size={28} color="#fff" />
      </View>
      <Text style={styles.label}>Add Session</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 20,
    alignItems: "center",
    gap: 4,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: FAB_COLOR,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: FAB_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: FAB_COLOR,
    letterSpacing: 0.3,
  },
});
