import { usePokerTheme } from "@/hooks/use-poker-theme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function CasinoDateSheet({
  visible, value, onChange, onClose,
}: {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = usePokerTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.navBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.strong }]}>
        <TouchableOpacity style={{ width: 72 }} onPress={onClose}>
          <Text style={{ fontSize: 16, color: colors.text.brand }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text.primary }]}>Date</Text>
        <TouchableOpacity style={{ width: 72, alignItems: "flex-end" }} onPress={onClose}>
          <Text style={{ fontSize: 16, color: colors.text.brand, fontWeight: "600" }}>Done</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7", alignItems: "center", paddingTop: 20 }}>
        <DateTimePicker
          value={value}
          mode="date"
          display="inline"
          onChange={(_, date) => date && onChange(date)}
          maximumDate={new Date()}
          accentColor={colors.text.brand}
          textColor={isDark ? "#FFFFFF" : "#000000"}
          themeVariant={isDark ? "dark" : "light"}
          style={{ width: "100%" }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  navTitle: { fontSize: 17, fontWeight: "700" },
});
