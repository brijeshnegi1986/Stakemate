import { usePokerTheme } from "@/hooks/use-poker-theme";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "react-native";

// Shared bottom-sheet chrome — matches the recipe used in app/live/active.tsx
export function BottomSheet({
  visible, onClose, children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors, spacing } = usePokerTheme();
  const panelAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      panelAnim.setValue(0);
      Animated.spring(panelAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={{
          backgroundColor: colors.bg.primary,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: spacing["2xl"],
          paddingBottom: Platform.OS === "ios" ? 40 : spacing["2xl"],
          borderTopWidth: 1,
          borderColor: colors.border.default,
          transform: [{ translateY: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
          opacity: panelAnim,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default, alignSelf: "center", marginBottom: spacing["2xl"] }} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function sectionLabel(colors: any, typography: any) {
  return {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
  };
}

function Actions({ onCancel, onConfirm, confirmLabel, confirmDisabled, confirmColor }: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmColor?: string;
}) {
  const { colors, spacing, radius, typography } = usePokerTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md }}>
      <TouchableOpacity
        onPress={onCancel}
        style={{ flex: 1, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border.default }}
      >
        <Text style={{ color: colors.text.secondary, fontWeight: "600", ...typography.body }}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={confirmDisabled}
        style={{
          flex: 2, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center",
          backgroundColor: confirmDisabled ? colors.state.disabled : (confirmColor ?? colors.bg.brand),
        }}
      >
        <Text style={{ color: confirmDisabled ? colors.text.disabled : colors.text.onBrand, fontWeight: "700", ...typography.body }}>
          {confirmLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Add player ───────────────────────────────────────────────────────────────

export function AddPlayerSheet({
  visible, onClose, onAdd, unit,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
  unit: "currency" | "chips";
}) {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const [name, setName] = useState("");
  const ref = useRef<TextInput>(null);

  useEffect(() => { if (visible) { setName(""); setTimeout(() => ref.current?.focus(), 150); } }, [visible]);

  const confirm = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(name.trim());
    setName("");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: spacing.lg }}>
        Add Player
      </Text>
      <View style={{
        backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
        borderColor: name.length > 0 ? colors.border.brand : colors.border.default,
        paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
      }}>
        <TextInput
          ref={ref}
          value={name}
          onChangeText={setName}
          placeholder="Player name"
          placeholderTextColor={colors.text.disabled}
          returnKeyType="done"
          onSubmitEditing={confirm}
          style={{ color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.body }}
        />
      </View>
      <Actions onCancel={onClose} onConfirm={confirm} confirmLabel="Add Player" confirmDisabled={!name.trim()} />
    </BottomSheet>
  );
}

// ─── Generic amount entry (buy-in / rebuy / cash-out / expense / rake) ────────

export function AmountEntrySheet({
  visible, title, subtitle, onClose, onConfirm, confirmLabel, unit,
  showPayee, payeeLabel = "Paid to",
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onConfirm: (amount: number, note: string, payee: string) => void;
  confirmLabel: string;
  unit: "currency" | "chips";
  showPayee?: boolean;
  payeeLabel?: string;
}) {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const [amount, setAmount] = useState("");
  const [note, setNote]     = useState("");
  const [payee, setPayee]   = useState("");

  useEffect(() => { if (visible) { setAmount(""); setNote(""); setPayee(""); } }, [visible]);

  const parsed = parseFloat(amount);
  const isReady = amount !== "" && !isNaN(parsed) && parsed > 0 && (!showPayee || payee.trim().length > 0);
  const symbol = unit === "chips" ? "🪙" : "$";

  const confirm = () => {
    if (!isReady) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(parsed, note, payee.trim());
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: subtitle ? spacing.xs : spacing.lg }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginBottom: spacing.lg }}>{subtitle}</Text>
      ) : null}

      <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>Amount</Text>
      <View style={{
        backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
        borderColor: amount.length > 0 ? colors.border.brand : colors.border.default,
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
      }}>
        <Text style={{ color: colors.text.disabled, ...typography.heading2, marginRight: spacing.xs }}>{symbol}</Text>
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.text.disabled}
          value={amount}
          onChangeText={setAmount}
          returnKeyType="done"
          style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.heading2, fontWeight: "700", textAlign: "right" }}
        />
      </View>

      {showPayee && (
        <>
          <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>{payeeLabel}</Text>
          <View style={{
            backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
            borderColor: payee.length > 0 ? colors.border.brand : colors.border.default,
            paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
          }}>
            <TextInput
              value={payee}
              onChangeText={setPayee}
              placeholder="Name"
              placeholderTextColor={colors.text.disabled}
              style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body }}
            />
          </View>
        </>
      )}

      <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>Note (optional)</Text>
      <View style={{
        backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
        borderColor: colors.border.default,
        paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginBottom: spacing["2xl"],
      }}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Anything to note..."
          placeholderTextColor={colors.text.disabled}
          style={{ color: colors.text.primary, paddingVertical: spacing.sm, ...inputTypo.bodySm }}
        />
      </View>

      <Actions onCancel={onClose} onConfirm={confirm} confirmLabel={confirmLabel} confirmDisabled={!isReady} />
    </BottomSheet>
  );
}

// ─── Leaving-soon timer picker ─────────────────────────────────────────────────

export function LeavingTimerSheet({
  visible, playerName, onClose, onSelect,
}: {
  visible: boolean;
  playerName: string;
  onClose: () => void;
  onSelect: (minutes: number) => void;
}) {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const OPTIONS = [15, 20, 30, 45];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: spacing.xs }}>
        {playerName} leaving soon?
      </Text>
      <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginBottom: spacing.lg }}>
        We'll remind you to cash them out.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
        {OPTIONS.map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(m); }}
            style={{
              flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center",
              backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
            }}
          >
            <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>{m}m</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={onClose}
        style={{ paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border.default }}
      >
        <Text style={{ color: colors.text.secondary, fontWeight: "600", ...typography.body }}>Cancel</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

// ─── Adjustment confirmation (editing an already-entered amount) ──────────────

export function AdjustmentConfirmSheet({
  visible, playerName, currentAmount, unit, onClose, onConfirm,
}: {
  visible: boolean;
  playerName: string;
  currentAmount: number;
  unit: "currency" | "chips";
  onClose: () => void;
  onConfirm: (newAmount: number, note: string) => void;
}) {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const [amount, setAmount]       = useState(String(currentAmount));
  const [checked, setChecked]     = useState(false);
  const symbol = unit === "chips" ? "🪙" : "$";

  useEffect(() => { if (visible) { setAmount(String(currentAmount)); setChecked(false); } }, [visible, currentAmount]);

  const parsed = parseFloat(amount);
  const isReady = checked && amount !== "" && !isNaN(parsed) && parsed >= 0 && parsed !== currentAmount;

  const confirm = () => {
    if (!isReady) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const delta = parsed - currentAmount;
    onConfirm(delta, `Corrected from ${currentAmount} to ${parsed}`);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: spacing.lg }}>
        Correct Amount
      </Text>

      <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>New Amount</Text>
      <View style={{
        backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
        borderColor: colors.border.brand,
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
      }}>
        <Text style={{ color: colors.text.disabled, ...typography.heading2, marginRight: spacing.xs }}>{symbol}</Text>
        <TextInput
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          returnKeyType="done"
          style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.heading2, fontWeight: "700", textAlign: "right" }}
        />
      </View>

      <TouchableOpacity
        onPress={() => setChecked((c) => !c)}
        activeOpacity={0.8}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing["2xl"] }}
      >
        <View style={{
          width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
          borderColor: checked ? colors.border.brand : colors.border.default,
          backgroundColor: checked ? colors.bg.brand : "transparent",
          alignItems: "center", justifyContent: "center", marginTop: 2,
        }}>
          {checked && <Text style={{ color: colors.text.onBrand, fontSize: 14, fontWeight: "800" }}>✓</Text>}
        </View>
        <Text style={{ flex: 1, color: colors.text.secondary, ...typography.bodySm, lineHeight: 20 }}>
          Confirm you've checked this correction with {playerName} in person.
        </Text>
      </TouchableOpacity>

      <Actions onCancel={onClose} onConfirm={confirm} confirmLabel="Save Correction" confirmDisabled={!isReady} />
    </BottomSheet>
  );
}
