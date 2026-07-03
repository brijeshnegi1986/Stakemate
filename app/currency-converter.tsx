import { usePokerTheme } from "@/hooks/use-poker-theme";
import { convert, fetchRates, Rates } from "@/lib/currencyRates";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";

const CURRENCIES: { code: string; flag: string; name: string; symbol: string }[] = [
  { code: "AUD", flag: "🇦🇺", name: "Australian Dollar",  symbol: "$"    },
  { code: "USD", flag: "🇺🇸", name: "US Dollar",          symbol: "$"    },
  { code: "GBP", flag: "🇬🇧", name: "British Pound",      symbol: "£"    },
  { code: "NZD", flag: "🇳🇿", name: "New Zealand Dollar", symbol: "$"    },
  { code: "ZAR", flag: "🇿🇦", name: "South African Rand", symbol: "R"    },
  { code: "EUR", flag: "🇮🇪", name: "Euro",               symbol: "€"    },
  { code: "SGD", flag: "🇸🇬", name: "Singapore Dollar",   symbol: "S$"   },
  { code: "HKD", flag: "🇭🇰", name: "Hong Kong Dollar",   symbol: "HK$"  },
];

export default function CurrencyConverterScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [amount,    setAmount]    = useState("1000");
  const [fromCode,  setFromCode]  = useState("AUD");
  const [rates,     setRates]     = useState<Rates | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  useEffect(() => {
    fetchRates()
      .then((r) => {
        setRates(r);
        setLastUpdate(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }));
      })
      .catch((e) => setError(e?.message ?? "Failed to load rates."))
      .finally(() => setLoading(false));
  }, []);

  const numericAmount = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
  const from = CURRENCIES.find((c) => c.code === fromCode)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>

      {/* ── Input card ── */}
      <View style={[styles.inputCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <Text style={[styles.inputLabel, { color: colors.text.tertiary }]}>Enter amount</Text>
        <View style={styles.inputRow}>
          <Text style={[styles.inputSymbol, { color: BRAND }]}>{from.symbol}</Text>
          <TextInput
            style={[styles.input, { color: colors.text.primary }]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.text.disabled}
            selectTextOnFocus
          />
        </View>

        {/* From currency selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c.code}
              onPress={() => setFromCode(c.code)}
              style={[
                styles.chip,
                { borderColor: fromCode === c.code ? BRAND : colors.border.default,
                  backgroundColor: fromCode === c.code ? BRAND + "12" : colors.bg.secondary },
              ]}
              activeOpacity={0.7}
            >
              <Text style={styles.chipFlag}>{c.flag}</Text>
              <Text style={[styles.chipCode, { color: fromCode === c.code ? BRAND : colors.text.secondary }]}>{c.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Results ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={[styles.loadingText, { color: colors.text.tertiary }]}>Fetching live rates…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="wifi-outline" size={44} color={colors.text.tertiary} />
          <Text style={[styles.errorText, { color: colors.text.primary }]}>Could not load rates</Text>
          <Text style={[styles.errorSub, { color: colors.text.tertiary }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); setError(null); fetchRates().then(setRates).catch((e) => setError(e.message)).finally(() => setLoading(false)); }}
            style={[styles.retryBtn, { backgroundColor: BRAND }]}
            activeOpacity={0.85}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {CURRENCIES.filter((c) => c.code !== fromCode).map((c) => {
            const converted = convert(numericAmount, fromCode, c.code, rates!);
            const formatted = converted.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <TouchableOpacity
                key={c.code}
                onPress={() => { setFromCode(c.code); setAmount(converted.toFixed(2)); }}
                activeOpacity={0.7}
                style={[styles.resultRow, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
              >
                <Text style={styles.resultFlag}>{c.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultCode, { color: colors.text.primary }]}>{c.code}</Text>
                  <Text style={[styles.resultName, { color: colors.text.tertiary }]}>{c.name}</Text>
                </View>
                <Text style={[styles.resultAmount, { color: colors.text.primary }]}>
                  {c.symbol}{formatted}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Rate info footer */}
          {lastUpdate ? (
            <Text style={[styles.footer, { color: colors.text.tertiary }]}>
              Rates from European Central Bank · Updated {lastUpdate}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputCard: {
    margin: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inputSymbol: {
    fontSize: 32,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipFlag: { fontSize: 14 },
  chipCode: { fontSize: 12, fontWeight: "700" },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 14, marginTop: 8 },
  errorText:   { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub:    { fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn:    { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:   { color: "#fff", fontSize: 15, fontWeight: "700" },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultFlag:   { fontSize: 28 },
  resultCode:   { fontSize: 15, fontWeight: "700" },
  resultName:   { fontSize: 12, marginTop: 1 },
  resultAmount: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },

  footer: {
    textAlign: "center",
    fontSize: 11,
    marginTop: 4,
  },
});
