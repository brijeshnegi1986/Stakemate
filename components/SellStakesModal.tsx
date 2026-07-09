import { setTournamentStakeDeal, TournamentEvent } from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { sendPushToUser } from "@/lib/notifications";
import { createPost, updatePostVisibility } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import {
  cancelStakeDeal,
  claimStake,
  closeStakeDeal,
  createStakeDeal,
  dealStatusColor,
  dealStatusLabel,
  getMyClaimForDeal,
  getStakeDeal,
  getStakeDealWithSeller,
  isEditableStatus,
  isPublishedStatus,
  pauseStakeDeal,
  publishStakeDeal,
  resumeStakeDeal,
  shareStakeDealExternal,
  StakeClaim,
  StakeDeal,
  unpublishStakeDeal,
  calculatePayouts,
  markDealSettled,
  recordDealResult,
  removeConfirmedClaim,
  updateClaimStatus,
  updateStakeDeal,
  upsertMuaBalance,
  withdrawClaim,
} from "@/lib/stakes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const PURPLE = "#0891B2";
const GREEN  = "#22C55E";
const RED    = "#EF4444";
const ORANGE = "#F97316";
const GRAY   = "#6B7280";

type ModalView =
  | "loading"
  | "create"
  | "publish_prompt"
  | "seller_dash"
  | "seller_edit"
  | "buyer_purchase";

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size, name }: { uri?: string | null; size: number; name?: string | null }) {
  const initials = name
    ? name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${BRAND}22`, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
        : <Text style={{ color: BRAND, fontSize: size * 0.38, fontWeight: "800" }}>{initials}</Text>}
    </View>
  );
}

// ─── Claim row (seller view) ──────────────────────────────────────────────────

function ClaimRow({
  claim, onConfirm, onReject, onRemove, colors,
}: {
  claim: StakeClaim;
  onConfirm: () => void;
  onReject: () => void;
  onRemove?: () => void;
  colors: any;
}) {
  const name   = claim.buyer_profile?.display_name || claim.buyer_profile?.username || "Player";
  const handle = claim.buyer_profile?.username ? `@${claim.buyer_profile.username}` : null;
  const isPending   = claim.status === "pending";
  const isConfirmed = claim.status === "confirmed";
  const statusColor = isConfirmed ? GREEN : claim.status === "rejected" ? RED : ORANGE;
  const borderColor = isPending ? ORANGE + "50" : statusColor + "30";

  return (
    <View style={[styles.claimRow, { backgroundColor: colors.bg.secondary, borderColor }]}>
      {/* Buyer identity row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 }}>
        {/* Avatar initials */}
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: statusColor + "20", alignItems: "center", justifyContent: "center" }}>
          {claim.buyer_profile?.avatar_url ? (
            <Image source={{ uri: claim.buyer_profile.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 15, fontWeight: "800", color: statusColor }}>{name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text.primary }}>{name}</Text>
          {handle && <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }}>{handle}</Text>}
        </View>
        {/* Pending: show confirm/decline icon buttons inline; settled: show status pill */}
        {isPending ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={onReject}
              activeOpacity={0.75}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: RED + "18", borderWidth: 1, borderColor: RED + "40", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="close" size={20} color={RED} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              activeOpacity={0.75}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN + "18", borderWidth: 1, borderColor: GREEN + "40", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="checkmark" size={20} color={GREEN} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: statusColor + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: statusColor, textTransform: "capitalize" }}>{claim.status}</Text>
            </View>
            {isConfirmed && onRemove && (
              <TouchableOpacity
                onPress={onRemove}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: RED + "15", borderWidth: 1, borderColor: RED + "35", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="person-remove-outline" size={14} color={RED} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Claim details */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10, paddingHorizontal: 14 }}>
        <View style={{ flex: 1, backgroundColor: colors.bg.tertiary ?? colors.bg.primary, borderRadius: 10, padding: 10, alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "900", color: colors.text.primary }}>{claim.percent_claimed}%</Text>
          <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>Action requested</Text>
        </View>
        {claim.amount_paid != null && (
          <View style={{ flex: 1, backgroundColor: colors.bg.tertiary ?? colors.bg.primary, borderRadius: 10, padding: 10, alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.text.primary }}>${claim.amount_paid.toFixed(2)}</Text>
            <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>Amount to pay</Text>
          </View>
        )}
      </View>

      {/* Buyer message */}
      {claim.message ? (
        <View style={{ marginTop: 10, marginHorizontal: 14, backgroundColor: colors.bg.primary, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: ORANGE }}>
          <Text style={{ fontSize: 12, color: colors.text.tertiary, fontWeight: "700", marginBottom: 3 }}>MESSAGE</Text>
          <Text style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 18 }}>"{claim.message}"</Text>
        </View>
      ) : null}

      {isPending && <View style={{ height: 14 }} />}
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ claimed, total, color }: { claimed: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(claimed / total, 1) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

// ─── Package form (used for create + edit) ───────────────────────────────────

function PackageForm({
  event,
  deal,
  colors,
  insets,
  onSave,
  onCancel,
  saving,
  onRegisterSave,
}: {
  event: TournamentEvent;
  deal: StakeDeal | null;  // null = create mode
  colors: any;
  insets: any;
  onSave: (fields: {
    actionPct: string;
    pricePerPct: string;
    markup: string;
    showMarkup: boolean;
    minPiece: string;
    numEntries: string;
    notes: string;
    reentryCovered: "yes" | "no" | "ask";
    visibility: "public" | "followers";
  }) => void;
  onCancel: () => void;
  saving: boolean;
  onRegisterSave?: (fn: () => void) => void;
}) {
  const parsedBuyIn = useMemo(() => {
    if (!event.buyin) return null;
    const n = parseFloat(event.buyin.replace(/[^0-9.]/g, ""));
    return isNaN(n) || n <= 0 ? null : n;
  }, [event.buyin]);

  const [actionPct,   setActionPct]   = useState(deal ? String(deal.total_action_selling) : "50");
  const [pricePerPct, setPricePerPct] = useState(deal?.price_per_percent != null ? String(deal.price_per_percent) : "");
  const [showMarkup,  setShowMarkup]  = useState(deal ? (deal.markup ?? 1.0) !== 1.0 : false);
  const [markup,      setMarkup]      = useState(deal ? String(deal.markup ?? 1.0) : "1.0");
  const [minPiece,    setMinPiece]    = useState(deal ? String(deal.min_piece ?? 1) : "1");
  const [numEntries,  setNumEntries]  = useState("1");
  const [notes,           setNotes]           = useState(deal?.notes ?? "");
  const [reentryCovered,  setReentryCovered]  = useState<"yes" | "no" | "ask">(deal?.reentry_covered ?? "ask");
  const [visibility,      setVisibility]      = useState<"public" | "followers">(
    deal ? (deal.visibility === "friends" || deal.visibility === "followers" ? "followers" : "public") : "public"
  );

  const entriesNum     = Math.max(1, parseInt(numEntries) || 1);
  const effectiveBuyIn = parsedBuyIn != null ? parsedBuyIn * entriesNum : null;

  // Auto-calc price from buy-in when markup or entries changes
  useEffect(() => {
    if (effectiveBuyIn == null || deal) return;
    const mkp = showMarkup ? parseFloat(markup) || 1.0 : 1.0;
    setPricePerPct(((effectiveBuyIn / 100) * mkp).toFixed(2));
  }, [effectiveBuyIn, showMarkup, markup]);

  const pctNum   = parseFloat(actionPct) || 0;
  const priceNum = parseFloat(pricePerPct) || 0;
  const mkpNum   = showMarkup ? parseFloat(markup) || 1.0 : 1.0;
  const totalRaise = priceNum > 0 ? (pctNum * priceNum).toFixed(2) : null;

  useEffect(() => {
    onRegisterSave?.(() => onSave({ actionPct, pricePerPct, markup, showMarkup, minPiece, numEntries, notes, reentryCovered, visibility }));
  }, [actionPct, pricePerPct, markup, showMarkup, minPiece, numEntries, notes, reentryCovered, visibility]);

  return (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Tournament banner */}
      <View style={[styles.tournamentBanner, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "35" }]}>
        <View style={styles.tournamentBannerIcon}>
          <Ionicons name="trophy-outline" size={18} color={PURPLE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tournamentBannerName, { color: PURPLE }]} numberOfLines={1}>{event.name}</Text>
          <Text style={[styles.tournamentBannerMeta, { color: PURPLE + "AA" }]}>
            {[
              event.date ? new Date(event.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null,
              event.venue || null,
              event.buyin ? `Buy-in: ${event.buyin}` : null,
            ].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
      </View>

      {/* Deal terms */}
      <View style={[styles.formCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        {/* Selling % + Min piece */}
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary }]}>Selling action</Text>
            <View style={[styles.cardInputRow, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
              <TextInput
                value={actionPct}
                onChangeText={setActionPct}
                keyboardType="numeric"
                placeholder="50"
                style={[styles.cardInput, { color: colors.text.primary }]}
                placeholderTextColor={colors.text.disabled}
              />
              <Text style={[styles.cardInputUnit, { color: colors.text.tertiary }]}>%</Text>
            </View>
          </View>
          <View style={styles.formRowDivider} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary }]}>Min sell piece</Text>
            <View style={[styles.cardInputRow, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
              <TextInput
                value={minPiece}
                onChangeText={setMinPiece}
                keyboardType="numeric"
                placeholder="1"
                style={[styles.cardInput, { color: colors.text.primary }]}
                placeholderTextColor={colors.text.disabled}
              />
              <Text style={[styles.cardInputUnit, { color: colors.text.tertiary }]}>%</Text>
            </View>
          </View>
        </View>

        <View style={[styles.cardDivider, { backgroundColor: colors.border.subtle }]} />

        {/* Number of entries — create mode only */}
        {!deal && (
          <>
            <View style={[styles.cardFieldBlock, { paddingBottom: 14 }]}>
              <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 12 }]}>Number of entries</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setNumEntries(String(Math.max(1, entriesNum - 1)))}
                  activeOpacity={0.7}
                  style={[styles.stepperBtn, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                >
                  <Ionicons name="remove" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 26, fontWeight: "900", color: colors.text.primary }}>{entriesNum}</Text>
                  <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>
                    {entriesNum === 1 ? "entry" : "entries"}
                    {parsedBuyIn && entriesNum > 1 ? `  ·  $${(parsedBuyIn * entriesNum).toLocaleString()} total` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setNumEntries(String(entriesNum + 1))}
                  activeOpacity={0.7}
                  style={[styles.stepperBtn, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                >
                  <Ionicons name="add" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.cardDivider, { backgroundColor: colors.border.subtle }]} />
          </>
        )}

        {/* Price per % — read-only auto-calculated field */}
        <View style={styles.cardFieldBlock}>
          <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 8 }]}>Price per 1%</Text>

          {effectiveBuyIn ? (
            /* ── Auto-calc mode: clearly disabled, visually distinct ── */
            <View style={[styles.calcBlock, { backgroundColor: PURPLE + "0A", borderColor: PURPLE + "25" }]}>
              {/* Top strip: icon + "Auto-calculated" label */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ionicons name="flash-outline" size={13} color={PURPLE} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: PURPLE, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Auto-calculated
                </Text>
                <View style={{ flex: 1 }} />
                <Ionicons name="lock-closed-outline" size={12} color={PURPLE + "80"} />
              </View>
              {/* Value row */}
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: PURPLE + "90" }}>$</Text>
                <Text style={{ fontSize: 26, fontWeight: "900", color: PURPLE, letterSpacing: -0.5 }}>
                  {pricePerPct || (effectiveBuyIn / 100).toFixed(2)}
                </Text>
                <Text style={{ fontSize: 13, color: PURPLE + "80", fontWeight: "600", marginLeft: 2 }}>per 1%</Text>
                {mkpNum !== 1 && (
                  <View style={{ marginLeft: 6, backgroundColor: ORANGE + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: ORANGE }}>{mkpNum}× markup</Text>
                  </View>
                )}
              </View>
              {/* Hint */}
              <Text style={{ fontSize: 11, color: PURPLE + "70", marginTop: 6, lineHeight: 15 }}>
                {entriesNum > 1
                  ? `${entriesNum} entries × ${event.buyin} = $${effectiveBuyIn.toLocaleString()} ÷ 100${mkpNum !== 1 ? ` × ${mkpNum}× markup` : ""}`
                  : `${event.buyin} buy-in ÷ 100${mkpNum !== 1 ? ` × ${mkpNum}× markup` : ""}`}
              </Text>
            </View>
          ) : (
            /* ── No buy-in: show placeholder hint, no faux-input ── */
            <View style={[styles.calcBlock, { backgroundColor: colors.bg.primary, borderColor: colors.border.subtle, borderStyle: "dashed" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="calculator-outline" size={15} color={colors.text.tertiary} />
                <Text style={{ fontSize: 13, color: colors.text.tertiary, lineHeight: 18 }}>
                  Add a buy-in to your tournament and the price will be calculated automatically.
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.cardDivider, { backgroundColor: colors.border.subtle }]} />

        {/* Markup toggle */}
        <View style={[styles.cardFieldBlock, showMarkup && { paddingBottom: 8 }]}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary }]}>Markup</Text>
              <Text style={[styles.cardFieldSub, { color: colors.text.tertiary }]}>
                Charge above face value (e.g. 1.1× = 10% premium)
              </Text>
            </View>
            <Switch value={showMarkup} onValueChange={setShowMarkup} trackColor={{ true: BRAND }} thumbColor="#fff" />
          </View>
          {showMarkup && (
            <View style={[styles.cardInputRow, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, marginTop: 12 }]}>
              <TextInput
                value={markup}
                onChangeText={setMarkup}
                keyboardType="numeric"
                placeholder="1.1"
                style={[styles.cardInput, { color: colors.text.primary, flex: 1 }]}
                placeholderTextColor={colors.text.disabled}
              />
              <Text style={[styles.cardInputUnit, { color: colors.text.tertiary }]}>×</Text>
            </View>
          )}
        </View>
      </View>

      {/* Notes */}
      <View style={[styles.formCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.cardFieldBlock}>
          <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 8 }]}>Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any extra details for potential backers..."
            placeholderTextColor={colors.text.disabled}
            style={[styles.textarea, { color: colors.text.primary, backgroundColor: colors.bg.primary, borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, fontSize: 14, fontWeight: "400" }]}
            multiline
            numberOfLines={3}
          />
        </View>
      </View>

      {/* Re-entry policy */}
      <View style={[styles.formCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        <View style={styles.cardFieldBlock}>
          <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary }]}>Re-entries covered?</Text>
          <Text style={[styles.cardFieldSub, { color: colors.text.tertiary, marginBottom: 10 }]}>
            Let backers know upfront if your stake covers re-entries
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([
              { key: "yes" as const, label: "Yes",          color: GREEN },
              { key: "no"  as const, label: "No",           color: RED   },
              { key: "ask" as const, label: "Ask me first", color: ORANGE },
            ]).map(({ key, label, color }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setReentryCovered(key)}
                activeOpacity={0.75}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                  borderWidth: 1,
                  borderColor: reentryCovered === key ? color : colors.border.default,
                  backgroundColor: reentryCovered === key ? color + "14" : colors.bg.primary,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: reentryCovered === key ? color : colors.text.secondary }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Visibility (only relevant when editing an already-published deal) */}
      {deal && isPublishedStatus(deal.status) && (
        <View style={[styles.formCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <View style={styles.cardFieldBlock}>
            <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 10 }]}>Visibility</Text>
            <View style={styles.visibilityRow}>
              {([
                { key: "public"    as const, icon: "globe-outline"  as const, label: "Public",       sub: "Marketplace" },
                { key: "followers" as const, icon: "people-outline" as const, label: "Followers Only", sub: "Your followers" },
              ]).map(({ key, icon, label, sub }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setVisibility(key)}
                  activeOpacity={0.75}
                  style={[
                    styles.visibilityOption,
                    { borderColor: visibility === key ? BRAND : colors.border.default,
                      backgroundColor: visibility === key ? BRAND + "0D" : colors.bg.primary },
                  ]}
                >
                  <Ionicons name={icon} size={18} color={visibility === key ? BRAND : colors.text.tertiary} />
                  <Text style={[styles.visibilityLabel, { color: visibility === key ? BRAND : colors.text.primary }]}>{label}</Text>
                  <Text style={[styles.visibilitySub, { color: colors.text.tertiary }]}>{sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Summary */}
      {pctNum > 0 && priceNum > 0 && (
        <View style={[styles.summaryCard, { backgroundColor: PURPLE + "0D", borderColor: PURPLE + "35" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ gap: 2 }}>
              <Text style={[styles.summaryLabel, { color: PURPLE }]}>Selling {pctNum}% of action</Text>
              <Text style={[styles.summarySub, { color: colors.text.secondary }]}>
                ${priceNum.toFixed(2)} per %{mkpNum !== 1 ? ` · ${mkpNum}× markup` : ""}
                {entriesNum > 1 ? ` · ${entriesNum} entries` : ""}
              </Text>
            </View>
            {totalRaise && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.summaryLabel, { color: colors.text.tertiary, fontSize: 11 }]}>Total raise</Text>
                <Text style={[styles.summaryRaise, { color: PURPLE }]}>${totalRaise}</Text>
              </View>
            )}
          </View>
          {entriesNum > 1 && effectiveBuyIn && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PURPLE + "25" }}>
              <Text style={{ fontSize: 12, color: PURPLE + "90" }}>
                {entriesNum} × ${parsedBuyIn?.toLocaleString()} buy-in = ${effectiveBuyIn.toLocaleString()} effective buy-in
              </Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={() => onSave({ actionPct, pricePerPct, markup, showMarkup, minPiece, numEntries, notes, reentryCovered, visibility })}
        disabled={saving || !actionPct}
        style={[styles.createBtn, { backgroundColor: PURPLE, opacity: saving || !actionPct ? 0.6 : 1 }]}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <>
              <Ionicons name={deal ? "checkmark-circle-outline" : "people-outline"} size={18} color="#fff" />
              <Text style={styles.createBtnText}>{deal ? "Save Changes" : "Save Draft"}</Text>
            </>
        }
      </TouchableOpacity>

      {deal && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelFormBtn} activeOpacity={0.8}>
          <Text style={{ fontSize: 15, color: colors.text.secondary }}>Cancel</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── Publish prompt (after creation or from dash) ─────────────────────────────

function PublishPromptView({
  deal,
  colors,
  insets,
  onPublished,
  onKeepDraft,
  saving,
}: {
  deal: StakeDeal;
  colors: any;
  insets: any;
  onPublished: (deal: StakeDeal) => void;
  onKeepDraft: () => void;
  saving: boolean;
}) {
  const [visibility, setVisibility] = useState<"public" | "followers">("public");

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.publishSuccessBanner, { backgroundColor: GREEN + "14", borderColor: GREEN + "40" }]}>
        <Ionicons name="checkmark-circle-outline" size={32} color={GREEN} />
        <Text style={[styles.publishSuccessTitle, { color: GREEN }]}>Package saved!</Text>
        <Text style={[styles.publishSuccessSub, { color: colors.text.secondary }]}>
          Choose who can see your deal, then list it on Marketplace to find backers.
        </Text>
      </View>

      <Text style={[styles.publishHeading, { color: colors.text.primary }]}>Who can see this?</Text>

      {([
        { key: "public"    as const, icon: "globe-outline"   as const, label: "Public",         sub: "Visible to everyone on Marketplace",  color: BRAND },
        { key: "followers" as const, icon: "people-outline"  as const, label: "Followers Only",  sub: "Only your followers can find this deal",       color: PURPLE },
      ]).map(({ key, icon, label, sub, color }) => (
        <TouchableOpacity
          key={key}
          onPress={() => setVisibility(key)}
          activeOpacity={0.8}
          style={[
            styles.publishOption,
            { borderColor: visibility === key ? color : colors.border.default,
              backgroundColor: visibility === key ? color + "0D" : colors.bg.secondary },
          ]}
        >
          <View style={[styles.publishOptionIcon, { backgroundColor: color + "18" }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.publishOptionLabel, { color: visibility === key ? color : colors.text.primary }]}>{label}</Text>
            <Text style={[styles.publishOptionSub, { color: colors.text.tertiary }]}>{sub}</Text>
          </View>
          {visibility === key && <Ionicons name="checkmark-circle" size={20} color={color} />}
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={async () => {
          try {
            const vis = visibility === "followers" ? "friends" : "public";
            await publishStakeDeal(deal.id, vis);
            // Back-link any community posts the seller already shared for this tournament
            Promise.resolve(
              supabase
                .from("social_posts")
                .update({ stake_deal_id: deal.id })
                .eq("user_id", deal.user_id)
                .ilike("session_name", deal.tournament_name)
                .is("stake_deal_id", null)
            ).catch(() => {});
            onPublished({ ...deal, status: "active", visibility: vis });
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not publish deal.");
          }
        }}
        disabled={saving}
        style={[styles.createBtn, { backgroundColor: BRAND, opacity: saving ? 0.6 : 1 }]}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <>
              <Ionicons name="rocket-outline" size={18} color="#fff" />
              <Text style={styles.createBtnText}>List on Marketplace</Text>
            </>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={onKeepDraft} style={styles.cancelFormBtn} activeOpacity={0.8}>
        <Text style={{ fontSize: 15, color: colors.text.secondary }}>Keep as Draft</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Seller dashboard ─────────────────────────────────────────────────────────

function SellerDashView({
  deal,
  event,
  colors,
  insets,
  userId,
  onPublish,
  onDealChanged,
  onCancelled,
}: {
  deal: StakeDeal;
  event: TournamentEvent;
  colors: any;
  insets: any;
  userId: string;
  onPublish: () => void;
  onDealChanged: (updated: StakeDeal) => void;
  onCancelled: () => void;
}) {
  const statusColor = dealStatusColor(deal.status);
  const statusLabel = dealStatusLabel(deal.status);
  const actionLeft  = deal.total_action_selling - deal.action_claimed;
  const isDraft     = deal.status === "draft";
  const isPaused    = deal.status === "paused";
  const isActive    = deal.status === "open" || deal.status === "active";
  const isEditable  = isEditableStatus(deal.status);
  const isClosed    = deal.status === "closed" || deal.status === "cancelled";
  const hasResult   = !!deal.result_type;

  // ── Result recording state ────────────────────────────────────────────────
  const [resultType,    setResultType]    = useState<"cashed" | "busted">(deal.result_type ?? "cashed");
  const [cashInput,     setCashInput]     = useState(deal.result_cash != null ? String(deal.result_cash) : "");
  const [savingResult,  setSavingResult]  = useState(false);
  const [settlingDeal,  setSettlingDeal]  = useState(false);

  const confirmedClaims = deal.claims?.filter((c) => c.status === "confirmed") ?? [];
  const cashNum = parseFloat(cashInput) || 0;
  const payouts = (hasResult && deal.result_type === "cashed" && deal.result_cash != null)
    ? calculatePayouts(confirmedClaims, deal.total_action_selling, deal.result_cash)
    : resultType === "cashed" && cashNum > 0
      ? calculatePayouts(confirmedClaims, deal.total_action_selling, cashNum)
      : [];

  async function handleRecordResult() {
    if (resultType === "cashed" && (!cashInput || cashNum <= 0)) {
      Alert.alert("Enter cash amount", "How much did you cash for?"); return;
    }
    Alert.alert(
      resultType === "cashed" ? `Record Cash: $${cashNum.toLocaleString()}` : "Record: Busted",
      `This will notify your ${confirmedClaims.length} backer${confirmedClaims.length !== 1 ? "s" : ""} of the result. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record Result",
          onPress: async () => {
            setSavingResult(true);
            try {
              await recordDealResult(deal.id, resultType, resultType === "cashed" ? cashNum : undefined);
              const updated = { ...deal, result_type: resultType, result_cash: resultType === "cashed" ? cashNum : null };
              onDealChanged(updated);
              // Notify each backer
              const payoutList = resultType === "cashed"
                ? calculatePayouts(confirmedClaims, deal.total_action_selling, cashNum)
                : [];
              for (const { claim, share } of payoutList) {
                sendPushToUser(
                  claim.buyer_id,
                  `Result: ${deal.tournament_name} 🃏`,
                  `${deal.seller_profile?.display_name ?? "The player"} cashed $${cashNum.toLocaleString()}. Your ${claim.percent_claimed}% share ≈ $${share.toLocaleString()}.`,
                  { dealId: deal.id }
                ).catch(() => {});
              }
              if (resultType === "busted" && confirmedClaims.length > 0) {
                for (const claim of confirmedClaims) {
                  sendPushToUser(
                    claim.buyer_id,
                    `Result: ${deal.tournament_name} 🃏`,
                    `${deal.seller_profile?.display_name ?? "The player"} didn't cash this time. Better luck next time!`,
                    { dealId: deal.id }
                  ).catch(() => {});
                }
              }
            } catch {
              Alert.alert("Error", "Could not record result. Please try again.");
            } finally {
              setSavingResult(false);
            }
          },
        },
      ]
    );
  }

  async function handleMarkSettled() {
    Alert.alert("Mark as Settled", "Confirm you've settled all payouts with backers outside the app?", [
      { text: "Not yet", style: "cancel" },
      {
        text: "Mark Settled",
        onPress: async () => {
          setSettlingDeal(true);
          try {
            await markDealSettled(deal.id);
            // Update MUA balances: busted = backers owed money (negative for player)
            if (deal.result_type === "busted" && deal.result_cash == null) {
              for (const claim of confirmedClaims) {
                const cost = claim.amount_paid ?? 0;
                if (cost > 0) await upsertMuaBalance(claim.buyer_id, deal.user_id, cost).catch(() => {});
              }
            } else if (deal.result_type === "cashed" && deal.result_cash != null) {
              // If cashed, reduce existing MUA (player paid back backers)
              const totalBuyin = deal.buy_in ?? 0;
              for (const claim of confirmedClaims) {
                const cost = claim.amount_paid ?? 0;
                const share = (claim.percent_claimed / 100) * deal.result_cash;
                if (share < cost) {
                  await upsertMuaBalance(claim.buyer_id, deal.user_id, cost - share).catch(() => {});
                }
              }
            }
            onDealChanged({ ...deal, is_settled: true });
          } catch {
            Alert.alert("Error", "Could not mark as settled.");
          } finally {
            setSettlingDeal(false);
          }
        },
      },
    ]);
  }

  // ── Community post state ──────────────────────────────────────────────────
  const [communityPostId,   setCommunityPostId]   = useState<string | null>(null);
  const [communityVis,      setCommunityVis]      = useState<"public" | "friends">("public");
  const [togglingPost,      setTogglingPost]      = useState(false);

  useEffect(() => {
    supabase
      .from("social_posts")
      .select("id, visibility")
      .eq("stake_deal_id", deal.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCommunityPostId(data.id);
          setCommunityVis((data.visibility ?? "public") as "public" | "friends");
        }
      });
  }, [deal.id]);

  async function handleToggleCommunityPost(on: boolean) {
    if (togglingPost) return;
    setTogglingPost(true);
    try {
      if (on) {
        const post = await createPost({
          user_id:      userId,
          session_type: "tournament",
          session_name: deal.tournament_name,
          venue:        deal.venue ?? null,
          stake_deal_id: deal.id,
          visibility:   communityVis,
        });
        setCommunityPostId(post.id);
      } else {
        if (communityPostId) {
          await supabase.from("social_posts").delete().eq("id", communityPostId);
          setCommunityPostId(null);
        }
      }
    } catch {
      Alert.alert("Error", "Could not update community post.");
    } finally {
      setTogglingPost(false);
    }
  }

  async function handleCommunityVisChange(vis: "public" | "friends") {
    setCommunityVis(vis);
    if (communityPostId) {
      try { await updatePostVisibility(communityPostId, vis); } catch { /* best effort */ }
    }
  }

  async function handleTogglePause() {
    try {
      if (isPaused) {
        await resumeStakeDeal(deal.id);
        onDealChanged({ ...deal, status: "active" });
      } else {
        await pauseStakeDeal(deal.id);
        onDealChanged({ ...deal, status: "paused" });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update deal.");
    }
  }

  async function handleClose() {
    Alert.alert("Mark as Sold", "Mark this deal as sold? No new claims will be accepted. Existing confirmed claims remain.", [
      { text: "Keep Open", style: "cancel" },
      {
        text: "Mark Sold",
        style: "destructive",
        onPress: async () => {
          try {
            await closeStakeDeal(deal.id);
            onDealChanged({ ...deal, status: "closed" });
          } catch {
            Alert.alert("Error", "Could not update deal.");
          }
        },
      },
    ]);
  }

  async function handleCancel() {
    Alert.alert(
      "Delete Deal",
      "Permanently delete this deal? All pending requests will be removed. This cannot be undone.",
      [
        { text: "Keep Deal", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelStakeDeal(deal.id);
              setTournamentStakeDeal(event.id, "");
              onCancelled();
            } catch {
              Alert.alert("Error", "Could not delete deal.");
            }
          },
        },
      ]
    );
  }

  async function handleClaimAction(claim: StakeClaim, status: "confirmed" | "rejected") {
    try {
      const { percentClaimed } = await updateClaimStatus(claim.id, status);
      onDealChanged({
        ...deal,
        // Reflect the confirmed % in the local deal so the progress bar updates immediately
        action_claimed: status === "confirmed"
          ? deal.action_claimed + percentClaimed
          : deal.action_claimed,
        claims: deal.claims?.map((c) => c.id === claim.id ? { ...c, status } : c),
      });
      // Notify the buyer of the outcome
      const buyerName = claim.buyer_profile?.display_name || claim.buyer_profile?.username || "Someone";
      if (status === "confirmed") {
        sendPushToUser(
          claim.buyer_id,
          "Stake claim confirmed! ✅",
          `Your ${claim.percent_claimed}% claim on ${deal.tournament_name} was confirmed.`,
          { dealId: deal.id }
        ).catch(() => {});
      } else {
        sendPushToUser(
          claim.buyer_id,
          "Stake claim update",
          `Your ${claim.percent_claimed}% claim on ${deal.tournament_name} was not accepted.`,
          { dealId: deal.id }
        ).catch(() => {});
      }
    } catch {
      Alert.alert("Error", "Could not update claim.");
    }
  }

  async function handleRemoveClaim(claim: StakeClaim) {
    Alert.alert(
      "Remove Backer",
      `Remove ${claim.buyer_profile?.display_name || "this backer"}'s ${claim.percent_claimed}% stake? The deal will re-open for new requests.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const { newActionClaimed } = await removeConfirmedClaim(claim.id, deal.id, claim.percent_claimed);
              const wasClosedOut = ["sold_out", "filled", "closed"].includes(deal.status);
              onDealChanged({
                ...deal,
                action_claimed: newActionClaimed,
                status: wasClosedOut ? "active" : deal.status,
                claims: deal.claims?.map((c) => c.id === claim.id ? { ...c, status: "cancelled" as any } : c),
              });
              sendPushToUser(
                claim.buyer_id,
                "Stake deal update",
                `Your ${claim.percent_claimed}% stake in ${deal.tournament_name} has been removed by the seller.`,
                { dealId: deal.id }
              ).catch(() => {});
            } catch {
              Alert.alert("Error", "Could not remove backer. Please try again.");
            }
          },
        },
      ]
    );
  }

  async function handleShare() {
    await shareStakeDealExternal({
      tournament_name:      deal.tournament_name,
      venue:                deal.venue,
      tournament_date:      deal.tournament_date,
      buy_in:               deal.buy_in,
      total_action_selling: deal.total_action_selling,
      price_per_percent:    deal.price_per_percent,
      markup:               deal.markup,
      notes:                deal.notes,
    });
  }

  async function handleUnpublish() {
    Alert.alert("Remove from Marketplace", "Remove this deal from Marketplace? You can re-list it later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        onPress: async () => {
          try {
            await unpublishStakeDeal(deal.id);
            onDealChanged({ ...deal, status: "draft", visibility: "draft" });
          } catch {
            Alert.alert("Error", "Could not unpublish deal.");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

      {/* ── Sharing section ── */}
      {!isClosed && (
        <View style={[styles.sharingCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary, marginBottom: 12 }]}>Sharing</Text>

          {/* Marketplace row */}
          <View style={styles.sharingRow}>
            <View style={[styles.sharingIcon, { backgroundColor: BRAND + "14" }]}>
              <Ionicons name="storefront-outline" size={18} color={BRAND} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>Marketplace</Text>
              <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }}>
                {isPublishedStatus(deal.status) ? "Listed — buyers can find your deal" : "Not listed yet"}
              </Text>
            </View>
            <Switch
              value={isPublishedStatus(deal.status)}
              onValueChange={(on) => on ? onPublish() : handleUnpublish()}
              trackColor={{ false: colors.border.default, true: BRAND + "55" }}
              thumbColor={isPublishedStatus(deal.status) ? BRAND : colors.text.tertiary}
            />
          </View>

          {/* Share Link row — only when listed */}
          {isPublishedStatus(deal.status) && (
            <TouchableOpacity onPress={handleShare} activeOpacity={0.7} style={[styles.sharingRow, { marginTop: 0, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }]}>
              <View style={[styles.sharingIcon, { backgroundColor: colors.bg.secondary }]}>
                <Ionicons name="share-outline" size={18} color={colors.text.secondary} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text.primary }}>Share Link</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginVertical: 10 }} />

          {/* Community Post row */}
          <View style={styles.sharingRow}>
            <View style={[styles.sharingIcon, { backgroundColor: "#8B5CF614" }]}>
              <Ionicons name="people-outline" size={18} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>Post on Community</Text>
              <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }}>
                {communityPostId ? "Visible on the community feed" : "Share with the community feed"}
              </Text>
            </View>
            <Switch
              value={!!communityPostId}
              onValueChange={handleToggleCommunityPost}
              disabled={togglingPost}
              trackColor={{ false: colors.border.default, true: "#8B5CF655" }}
              thumbColor={communityPostId ? "#8B5CF6" : colors.text.tertiary}
            />
          </View>

          {/* Visibility picker — only when community post is ON */}
          {!!communityPostId && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, paddingLeft: 46 }}>
              {([["public", "globe-outline", "Public"] as const, ["friends", "people-outline", "Followers Only"] as const]).map(([val, icon, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => handleCommunityVisChange(val)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: communityVis === val ? "#8B5CF6" : colors.border.default,
                    backgroundColor: communityVis === val ? "#8B5CF614" : colors.bg.secondary,
                  }}
                >
                  <Ionicons name={icon} size={13} color={communityVis === val ? "#8B5CF6" : colors.text.tertiary} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: communityVis === val ? "#8B5CF6" : colors.text.secondary }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Status banner */}
      <View style={[styles.dealBanner, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.dealBannerTitle, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={[styles.dealBannerSub, { color: colors.text.secondary }]}>
            {deal.action_claimed.toFixed(0)}% claimed of {deal.total_action_selling}%
            {actionLeft > 0 && !isClosed ? ` · ${actionLeft.toFixed(0)}% remaining` : ""}
          </Text>
        </View>
        <View style={[styles.dealPctCircle, { borderColor: statusColor + "60" }]}>
          <Text style={[styles.dealPctNum, { color: statusColor }]}>
            {deal.total_action_selling > 0 ? Math.round((deal.action_claimed / deal.total_action_selling) * 100) : 0}%
          </Text>
          <Text style={[styles.dealPctLabel, { color: colors.text.tertiary }]}>sold</Text>
        </View>
      </View>

      {/* Progress bar */}
      <ProgressBar claimed={deal.action_claimed} total={deal.total_action_selling} color={statusColor} />

      {/* Resume quick action — only for paused deals (recovery path) */}
      {!isClosed && isPaused && (
        <View style={styles.quickActionsRow}>
          <TouchableOpacity onPress={handleTogglePause} style={[styles.quickActionBtn, { flex: 1, borderColor: GREEN + "60", backgroundColor: GREEN + "10" }]} activeOpacity={0.8}>
            <Ionicons name="play-outline" size={16} color={GREEN} />
            <Text style={[styles.quickActionText, { color: GREEN }]}>Resume</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Claims — shown FIRST so pending requests are impossible to miss ── */}
      {(() => {
        const pending   = deal.claims?.filter((c) => c.status === "pending")   ?? [];
        const confirmed = deal.claims?.filter((c) => c.status === "confirmed") ?? [];
        const rejected  = deal.claims?.filter((c) => c.status === "rejected")  ?? [];
        const sorted    = [...pending, ...confirmed, ...rejected];
        return (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary, marginBottom: 0 }]}>
                Requests
              </Text>
              {pending.length > 0 && (
                <View style={{ backgroundColor: ORANGE + "20", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: ORANGE }}>
                    {pending.length} pending
                  </Text>
                </View>
              )}
            </View>
            {sorted.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <Ionicons name="people-outline" size={32} color={colors.text.tertiary} />
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
                  {isDraft ? "Publish your deal to start receiving requests." : "No requests yet. Share your deal to get backers!"}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {sorted.map((c) => (
                  <ClaimRow
                    key={c.id}
                    claim={c}
                    onConfirm={() => handleClaimAction(c, "confirmed")}
                    onReject={() => handleClaimAction(c, "rejected")}
                    onRemove={() => handleRemoveClaim(c)}
                    colors={colors}
                  />
                ))}
              </View>
            )}
          </>
        );
      })()}

      {/* Mark as Sold — only shown when deal is active, placed after claims so owner has reviewed requests first */}
      {isActive && (() => {
        const hasConfirmed = (deal.claims?.filter((c) => c.status === "confirmed").length ?? 0) > 0;
        const canMarkSold  = deal.action_claimed > 0 || hasConfirmed;
        return (
          <View style={{ marginBottom: 16 }}>
            <TouchableOpacity
              onPress={canMarkSold ? handleClose : undefined}
              activeOpacity={canMarkSold ? 0.85 : 1}
              style={[
                styles.markSoldBtn,
                {
                  backgroundColor: canMarkSold ? GREEN + "12" : colors.bg.secondary,
                  borderColor:     canMarkSold ? GREEN + "50" : colors.border.default,
                  opacity:         canMarkSold ? 1 : 0.55,
                },
              ]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={canMarkSold ? GREEN : colors.text.tertiary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: canMarkSold ? GREEN : colors.text.tertiary }}>
                  Mark as Sold
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.disabled, marginTop: 1 }}>
                  {canMarkSold
                    ? "Close the deal — no new requests will be accepted"
                    : "Available once at least one stake claim is confirmed"}
                </Text>
              </View>
              {canMarkSold && <Ionicons name="chevron-forward" size={14} color={GREEN} />}
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* ── Result & Settlement ───────────────────────────────────────────────── */}
      {isClosed && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Tournament Result</Text>

          {hasResult ? (
            /* Result already recorded — show summary */
            <View style={[styles.detailCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default, gap: 12 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons
                  name={deal.result_type === "cashed" ? "trophy" : "close-circle"}
                  size={22}
                  color={deal.result_type === "cashed" ? GREEN : RED}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: deal.result_type === "cashed" ? GREEN : RED }}>
                    {deal.result_type === "cashed" ? `Cashed — $${(deal.result_cash ?? 0).toLocaleString()}` : "Busted"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
                    {deal.is_settled ? "✓ Settled with all backers" : "Awaiting settlement"}
                  </Text>
                </View>
              </View>

              {deal.result_type === "cashed" && confirmedClaims.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Backer Payouts
                  </Text>
                  {payouts.map(({ claim, share }) => {
                    const name = claim.buyer_profile?.display_name || claim.buyer_profile?.username || "Backer";
                    return (
                      <View key={claim.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }}>
                        <Text style={{ fontSize: 14, color: colors.text.primary }}>{name} ({claim.percent_claimed}%)</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: GREEN }}>${share.toLocaleString()}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {!deal.is_settled && (
                <TouchableOpacity
                  onPress={handleMarkSettled}
                  disabled={settlingDeal}
                  activeOpacity={0.85}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: GREEN + "14", borderWidth: 1, borderColor: GREEN + "40" }}
                >
                  {settlingDeal
                    ? <ActivityIndicator size="small" color={GREEN} />
                    : <>
                        <Ionicons name="checkmark-done-outline" size={16} color={GREEN} />
                        <Text style={{ fontSize: 14, fontWeight: "700", color: GREEN }}>Mark as Settled</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* No result yet — show recorder */
            <View style={[styles.detailCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default, gap: 14 }]}>
              <Text style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 18 }}>
                Record your result so your backers know what happened.
              </Text>

              {/* Cashed / Busted toggle */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {([
                  { key: "cashed" as const, icon: "trophy-outline" as const, label: "Cashed", color: GREEN },
                  { key: "busted" as const, icon: "close-circle-outline" as const, label: "Busted", color: RED },
                ]).map(({ key, icon, label, color }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setResultType(key)}
                    activeOpacity={0.75}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: resultType === key ? color : colors.border.default, backgroundColor: resultType === key ? color + "14" : colors.bg.primary }}
                  >
                    <Ionicons name={icon} size={18} color={resultType === key ? color : colors.text.tertiary} />
                    <Text style={{ fontSize: 15, fontWeight: "700", color: resultType === key ? color : colors.text.secondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cash amount input */}
              {resultType === "cashed" && (
                <View>
                  <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 8 }]}>Cash amount</Text>
                  <View style={[styles.cardInputRow, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                    <Text style={[styles.cardInputUnit, { color: colors.text.tertiary }]}>$</Text>
                    <TextInput
                      value={cashInput}
                      onChangeText={setCashInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={colors.text.disabled}
                      style={[styles.cardInput, { color: colors.text.primary }]}
                    />
                  </View>
                </View>
              )}

              {/* Payout preview */}
              {payouts.length > 0 && (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Backer Payouts Preview
                  </Text>
                  {payouts.map(({ claim, share }) => {
                    const name = claim.buyer_profile?.display_name || claim.buyer_profile?.username || "Backer";
                    return (
                      <View key={claim.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>{name} ({claim.percent_claimed}%)</Text>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: GREEN }}>${share.toLocaleString()}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                onPress={handleRecordResult}
                disabled={savingResult}
                activeOpacity={0.85}
                style={[styles.createBtn, { backgroundColor: PURPLE, opacity: savingResult ? 0.6 : 1, marginTop: 0 }]}
              >
                {savingResult
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="flag-outline" size={16} color="#fff" />
                      <Text style={styles.createBtnText}>Record & Notify Backers</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Deal details card */}
      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Deal Details</Text>
      <View style={[styles.detailCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        {[
          { icon: "trophy-outline",         label: "Tournament", value: deal.tournament_name },
          deal.venue            ? { icon: "location-outline",      label: "Venue",      value: deal.venue } : null,
          deal.tournament_date  ? { icon: "calendar-outline",      label: "Date",       value: new Date(deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) } : null,
          deal.buy_in           ? { icon: "cash-outline",          label: "Buy-in",     value: `$${deal.buy_in}` } : null,
          { icon: "pie-chart-outline",      label: "Selling",    value: `${deal.total_action_selling}% of action` },
          deal.price_per_percent ? { icon: "pricetag-outline",     label: "Price",      value: `$${deal.price_per_percent}/% ${deal.markup !== 1 ? `(${deal.markup}×)` : ""}` } : null,
          deal.min_piece > 1     ? { icon: "layers-outline",       label: "Min piece",  value: `${deal.min_piece}%` } : null,
          deal.reentry_covered  ? { icon: "refresh-outline",       label: "Re-entries", value: deal.reentry_covered === "yes" ? "Covered" : deal.reentry_covered === "no" ? "Not covered" : "Ask seller" } : null,
          deal.notes            ? { icon: "document-text-outline", label: "Notes",      value: deal.notes } : null,
        ].filter(Boolean).map((row: any, i) => (
          <View key={i} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }]}>
            <Ionicons name={row.icon} size={15} color={colors.text.tertiary} />
            <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>{row.label}</Text>
            <Text style={[styles.detailValue, { color: colors.text.primary }]} numberOfLines={2}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* Danger zone */}
      {!isClosed && (
        <TouchableOpacity
          onPress={handleCancel}
          style={[styles.cancelDealBtn, { borderColor: RED + "60" }]}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={16} color={RED} />
          <Text style={[styles.cancelDealText, { color: RED }]}>Delete Deal</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── Buyer purchase view ──────────────────────────────────────────────────────

function BuyerPurchaseView({
  deal,
  userId,
  colors,
  insets,
  onClose,
  onActionClaimed,
}: {
  deal: StakeDeal;
  userId: string;
  colors: any;
  insets: any;
  onClose: () => void;
  onActionClaimed?: (addedPct: number) => void;
}) {
  const sellerName   = deal.seller_profile?.display_name || deal.seller_profile?.username || "Seller";
  const sellerHandle = deal.seller_profile?.username ? `@${deal.seller_profile.username}` : null;

  // Track locally so progress bar updates immediately after claiming without full reload
  const [localActionClaimed, setLocalActionClaimed] = useState(deal.action_claimed);

  const available     = deal.total_action_selling - localActionClaimed;
  const minPiece      = deal.min_piece ?? 1;
  const canClaim      = deal.status === "open" || deal.status === "active";

  const [claimPct,    setClaimPct]    = useState(String(minPiece));
  const [message,     setMessage]     = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [myClaim,     setMyClaim]     = useState<StakeClaim | null>(null);
  const [loadingClaim, setLoadingClaim] = useState(true);
  const [withdrawing,  setWithdrawing]  = useState(false);

  useEffect(() => {
    if (!userId) { setLoadingClaim(false); return; }
    getMyClaimForDeal(deal.id, userId)
      .then(setMyClaim)
      .catch(() => setMyClaim(null))
      .finally(() => setLoadingClaim(false));
  }, [deal.id, userId]);

  const claimNum  = Math.min(Math.max(parseFloat(claimPct) || minPiece, minPiece), available);
  const costNum   = deal.price_per_percent != null ? claimNum * deal.price_per_percent * (deal.markup ?? 1) : null;
  const pctSold   = deal.total_action_selling > 0 ? localActionClaimed / deal.total_action_selling : 0;
  const statusColor = dealStatusColor(deal.status);

  function adjustPct(delta: number) {
    const next = Math.min(Math.max((parseFloat(claimPct) || minPiece) + delta, minPiece), available);
    setClaimPct(String(next));
  }

  async function handleClaim() {
    if (!userId) { Alert.alert("Sign in required", "Sign in to claim a stake."); return; }
    const pct = parseFloat(claimPct);
    if (isNaN(pct) || pct < minPiece) {
      Alert.alert("Invalid amount", `Minimum piece is ${minPiece}%.`); return;
    }
    if (pct > available) {
      Alert.alert("Too much", `Only ${available}% available.`); return;
    }
    setSubmitting(true);
    try {
      const claim = await claimStake(deal.id, userId, pct, message.trim() || undefined);
      setMyClaim(claim);
      // Update progress bar immediately
      setLocalActionClaimed((prev) => prev + pct);
      onActionClaimed?.(pct);
      // Notify the seller
      sendPushToUser(
        deal.user_id,
        "New stake claim! 🤝",
        `Someone wants to buy ${pct}% of your ${deal.tournament_name} action.`,
        { dealId: deal.id }
      ).catch(() => {});
      Alert.alert("Claim submitted!", "The seller will confirm your claim. You'll hear back soon.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not submit claim.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!myClaim) return;
    Alert.alert("Withdraw Claim", "Remove your claim for this stake deal?", [
      { text: "Keep Claim", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          setWithdrawing(true);
          try {
            await withdrawClaim(myClaim.id, deal.id, myClaim.percent_claimed);
            setMyClaim(null);
          } catch {
            Alert.alert("Error", "Could not withdraw claim.");
          } finally {
            setWithdrawing(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Seller profile strip */}
      {deal.seller_profile && (
        <View style={[styles.sellerStrip, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <Avatar uri={deal.seller_profile.avatar_url} size={44} name={sellerName} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.sellerName, { color: colors.text.primary }]}>{sellerName}</Text>
            {sellerHandle && <Text style={[styles.sellerHandle, { color: colors.text.tertiary }]}>{sellerHandle}</Text>}
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusColor + "18" }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>{dealStatusLabel(deal.status)}</Text>
          </View>
        </View>
      )}

      {/* Tournament details */}
      <View style={[styles.tournamentBanner, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "35" }]}>
        <View style={styles.tournamentBannerIcon}>
          <Ionicons name="trophy-outline" size={18} color={PURPLE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tournamentBannerName, { color: PURPLE }]} numberOfLines={1}>{deal.tournament_name}</Text>
          <Text style={[styles.tournamentBannerMeta, { color: PURPLE + "AA" }]}>
            {[
              deal.tournament_date ? new Date(deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null,
              deal.venue || null,
              deal.buy_in ? `Buy-in: $${deal.buy_in}` : null,
            ].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={[styles.buyerStatsRow, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
        {[
          { label: "Total",     value: `${deal.total_action_selling}%` },
          { label: "Available", value: `${Math.max(0, available).toFixed(1)}%`, color: available > 0 ? GREEN : RED },
          { label: "Price/1%",  value: deal.price_per_percent ? `$${deal.price_per_percent}` : "—" },
          { label: "Markup",    value: deal.markup !== 1 ? `${deal.markup}×` : "Face" },
        ].map((stat, i, arr) => (
          <View key={stat.label} style={[styles.buyerStatCell, i < arr.length - 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border.subtle }]}>
            <Text style={[styles.buyerStatValue, { color: stat.color ?? colors.text.primary }]}>{stat.value}</Text>
            <Text style={[styles.buyerStatLabel, { color: colors.text.tertiary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Progress bar */}
      <View>
        <ProgressBar claimed={localActionClaimed} total={deal.total_action_selling} color={PURPLE} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={[styles.progressLabel, { color: colors.text.tertiary }]}>{Math.round(pctSold * 100)}% sold</Text>
          <Text style={[styles.progressLabel, { color: colors.text.tertiary }]}>{available.toFixed(1)}% left</Text>
        </View>
      </View>

      {/* Notes */}
      {deal.notes && (
        <View style={[styles.notesCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <Ionicons name="document-text-outline" size={14} color={colors.text.tertiary} />
          <Text style={[styles.notesText, { color: colors.text.secondary }]}>{deal.notes}</Text>
        </View>
      )}

      {/* Re-entry policy */}
      {deal.reentry_covered && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
          <Ionicons name="refresh-outline" size={14} color={colors.text.tertiary} />
          <Text style={{ fontSize: 13, color: colors.text.secondary }}>
            Re-entries:{" "}
            <Text style={{ fontWeight: "700" }}>
              {deal.reentry_covered === "yes" ? "Covered by stake" : deal.reentry_covered === "no" ? "Not covered" : "Ask seller first"}
            </Text>
          </Text>
        </View>
      )}

      {/* Result card — shown when seller has recorded the outcome */}
      {deal.result_type && (
        <View style={[styles.detailCard, { backgroundColor: deal.result_type === "cashed" ? GREEN + "0F" : RED + "0F", borderColor: deal.result_type === "cashed" ? GREEN + "40" : RED + "40", gap: 10 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name={deal.result_type === "cashed" ? "trophy" : "close-circle"} size={22} color={deal.result_type === "cashed" ? GREEN : RED} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: deal.result_type === "cashed" ? GREEN : RED }}>
                {deal.result_type === "cashed" ? `Cashed — $${(deal.result_cash ?? 0).toLocaleString()}` : "Busted"}
              </Text>
              <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
                {deal.is_settled ? "✓ Seller has settled payouts" : "Settlement pending"}
              </Text>
            </View>
          </View>
          {/* Buyer's share */}
          {myClaim?.status === "confirmed" && deal.result_type === "cashed" && deal.result_cash != null && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: deal.result_type === "cashed" ? GREEN + "30" : RED + "30" }}>
              <Text style={{ fontSize: 14, color: colors.text.secondary }}>Your {myClaim.percent_claimed}% share</Text>
              <Text style={{ fontSize: 18, fontWeight: "900", color: GREEN }}>
                ${((myClaim.percent_claimed / 100) * deal.result_cash).toLocaleString()}
              </Text>
            </View>
          )}
          {myClaim?.status === "confirmed" && deal.result_type === "busted" && (
            <Text style={{ fontSize: 13, color: colors.text.secondary, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: RED + "30" }}>
              No payout this time — better luck next tournament!
            </Text>
          )}
        </View>
      )}

      {/* Existing claim */}
      {loadingClaim ? (
        <ActivityIndicator color={BRAND} style={{ marginVertical: 8 }} />
      ) : myClaim ? (
        <View style={[styles.myClaimCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="receipt-outline" size={18} color={BRAND} />
            <Text style={[styles.myClaimTitle, { color: colors.text.primary }]}>Your claim</Text>
            <View style={[styles.claimStatusPill, { backgroundColor: (myClaim.status === "confirmed" ? GREEN : myClaim.status === "rejected" ? RED : ORANGE) + "18" }]}>
              <Text style={[styles.claimStatusText, { color: myClaim.status === "confirmed" ? GREEN : myClaim.status === "rejected" ? RED : ORANGE }]}>
                {myClaim.status}
              </Text>
            </View>
          </View>
          <Text style={[styles.myClaimDetail, { color: colors.text.secondary }]}>
            {myClaim.percent_claimed}%{myClaim.amount_paid != null ? ` · $${myClaim.amount_paid.toFixed(2)}` : ""}
          </Text>
          {myClaim.status === "pending" && (
            <TouchableOpacity onPress={handleWithdraw} disabled={withdrawing} style={[styles.withdrawBtn, { borderColor: RED + "60" }]} activeOpacity={0.8}>
              {withdrawing
                ? <ActivityIndicator size="small" color={RED} />
                : <Text style={[styles.withdrawBtnText, { color: RED }]}>Withdraw Claim</Text>}
            </TouchableOpacity>
          )}
        </View>
      ) : canClaim && available > 0 ? (
        /* Claim input */
        <View style={[styles.formCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <View style={styles.cardFieldBlock}>
            <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 12 }]}>
              How much action? (min {minPiece}%)
            </Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                onPress={() => adjustPct(-minPiece)}
                style={[styles.stepperBtn, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: "center" }}>
                <TextInput
                  value={claimPct}
                  onChangeText={(v) => setClaimPct(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="numeric"
                  style={[styles.stepperInput, { color: colors.text.primary, width: "100%", includeFontPadding: false }]}
                  textAlign="center"
                  textAlignVertical="center"
                />
                <Text style={[styles.stepperUnit, { color: colors.text.tertiary }]}>%</Text>
              </View>
              <TouchableOpacity
                onPress={() => adjustPct(minPiece)}
                style={[styles.stepperBtn, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {costNum != null && (
              <View style={[styles.costRow, { backgroundColor: PURPLE + "0D", borderColor: PURPLE + "25" }]}>
                <Text style={[styles.costLabel, { color: colors.text.secondary }]}>You'll pay</Text>
                <Text style={[styles.costAmount, { color: PURPLE }]}>${costNum.toFixed(2)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.border.subtle }]} />

          <View style={styles.cardFieldBlock}>
            <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 8 }]}>Message (optional)</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Say hi to the seller..."
              placeholderTextColor={colors.text.disabled}
              style={[styles.cardInput, { color: colors.text.primary, backgroundColor: colors.bg.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }]}
              maxLength={200}
            />
          </View>
        </View>
      ) : null}

      {/* CTA */}
      {!myClaim && canClaim && available > 0 && (
        <TouchableOpacity
          onPress={handleClaim}
          disabled={submitting || !userId}
          style={[styles.createBtn, { backgroundColor: GREEN, opacity: submitting || !userId ? 0.6 : 1 }]}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.createBtnText}>Claim Stake</Text>
              </>
          }
        </TouchableOpacity>
      )}

      {!canClaim && (
        <View style={[styles.emptyCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.text.tertiary} />
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            {deal.status === "sold_out" || deal.status === "filled"
              ? "This deal is fully claimed."
              : "This deal is not currently accepting claims."}
          </Text>
        </View>
      )}

      {!userId && canClaim && (
        <View style={[styles.warnBanner, { backgroundColor: ORANGE + "18", borderColor: ORANGE + "60" }]}>
          <Ionicons name="warning-outline" size={16} color={ORANGE} />
          <Text style={{ flex: 1, fontSize: 13, color: ORANGE, fontWeight: "600" }}>Sign in to claim a stake.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SellStakesModal({
  visible,
  event,
  dealId: dealIdProp,
  userId,
  onClose,
  onDealCreated,
}: {
  visible: boolean;
  event?: TournamentEvent;
  dealId?: string;
  userId: string;
  onClose: () => void;
  onDealCreated?: (dealId: string) => void;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [deal,     setDeal]     = useState<StakeDeal | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [view,     setView]     = useState<ModalView>("loading");

  const saveFormRef = useRef<(() => void) | null>(null);

  const isOwner  = !deal || deal.user_id === userId;

  // Resolve initial view on open
  useEffect(() => {
    if (!visible) { setDeal(null); setView("loading"); return; }

    const resolvedDealId = dealIdProp || event?.stake_deal_id;

    if (!resolvedDealId) {
      // No deal at all — only an owner can create, so show create form
      setView("create");
      return;
    }

    setLoading(true);
    setView("loading");

    // Always load the deal first (no profiles join → works regardless of profiles RLS)
    getStakeDeal(resolvedDealId)
      .then((d) => {
        if (!d) {
          // Deal not found or blocked by RLS — if we have an event, allow creating a new one
          if (event) {
            setView("create");
          } else {
            Alert.alert("Package unavailable", "This stake deal could not be loaded. It may have been cancelled or is no longer available.");
            onClose();
          }
          setLoading(false);
          return;
        }
        if (d.status === "cancelled") {
          setView("create");
          setLoading(false);
          return;
        }
        setDeal(d);
        const owner = d.user_id === userId;
        if (owner) {
          // Seller path — no seller profile needed
          setView("seller_dash");
          setLoading(false);
        } else {
          // Buyer path — fetch seller profile as a best-effort second call
          getStakeDealWithSeller(d.id)
            .then((full) => { if (full) setDeal(full); })
            .catch(() => { /* seller profile optional — show view without it */ })
            .finally(() => { setView("buyer_purchase"); setLoading(false); });
        }
      })
      .catch(() => {
        if (event) {
          setView("create");
        } else {
          Alert.alert("Error", "Could not load stake package. Check your connection and try again.");
          onClose();
        }
        setLoading(false);
      });
  }, [visible, dealIdProp, event?.stake_deal_id]);

  // ── Header title ──────────────────────────────────────────────────────────
  const headerTitle: Record<ModalView, string> = {
    loading:        "Loading…",
    create:         "Create Package",
    publish_prompt: "Publish",
    seller_dash:    "My Deal",
    seller_edit:    "Edit Deal",
    buyer_purchase: "BUY",
  };

  const showBack = view === "seller_edit" || view === "publish_prompt";

  function handleBack() {
    if (view === "seller_edit") setView("seller_dash");
    else if (view === "publish_prompt") setView("seller_dash");
    else onClose();
  }

  // ── Create handler ────────────────────────────────────────────────────────
  async function handleCreate(fields: {
    actionPct: string; pricePerPct: string; markup: string; showMarkup: boolean;
    minPiece: string; numEntries: string; notes: string; reentryCovered: "yes" | "no" | "ask"; visibility: "public" | "followers";
  }) {
    if (!userId) { Alert.alert("Sign in required"); return; }
    if (!event)  { Alert.alert("Error", "No tournament attached."); return; }

    const pct = parseFloat(fields.actionPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      Alert.alert("Invalid %", "Enter a percentage between 1 and 100."); return;
    }
    const price    = fields.pricePerPct ? parseFloat(fields.pricePerPct) : null;
    const mkp      = fields.showMarkup ? parseFloat(fields.markup) || 1.0 : 1.0;
    const entries  = Math.max(1, parseInt(fields.numEntries) || 1);
    const singleBuyIn = event.buyin ? parseFloat(event.buyin.replace(/[^0-9.]/g, "")) || null : null;
    const effectiveBuyIn = singleBuyIn != null ? singleBuyIn * entries : null;

    setSaving(true);
    try {
      const created = await createStakeDeal({
        user_id:              userId,
        tournament_name:      event.name,
        venue:                event.venue || null,
        tournament_date:      event.date,
        buy_in:               effectiveBuyIn,
        num_entries:          entries,
        total_action_selling: pct,
        price_per_percent:    price,
        markup:               mkp,
        min_piece:            parseFloat(fields.minPiece) || 1,
        notes:                fields.notes.trim() || null,
        reentry_covered:      fields.reentryCovered,
        local_tournament_id:  event.id,
      });

      setTournamentStakeDeal(event.id, created.id);
      setDeal(created);
      onDealCreated?.(created.id);
      setView("publish_prompt");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not create stake deal.");
    } finally {
      setSaving(false);
    }
  }

  // ── Edit handler ──────────────────────────────────────────────────────────
  async function handleEdit(fields: {
    actionPct: string; pricePerPct: string; markup: string; showMarkup: boolean;
    minPiece: string; numEntries: string; notes: string; reentryCovered: "yes" | "no" | "ask"; visibility: "public" | "followers";
  }) {
    if (!deal) return;
    const pct = parseFloat(fields.actionPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      Alert.alert("Invalid %", "Enter a percentage between 1 and 100."); return;
    }
    if (pct < deal.action_claimed) {
      Alert.alert("Invalid %", `Can't reduce below already-claimed ${deal.action_claimed}%.`); return;
    }
    const price = fields.pricePerPct ? parseFloat(fields.pricePerPct) : null;
    const mkp   = fields.showMarkup ? parseFloat(fields.markup) || 1.0 : 1.0;

    setSaving(true);
    try {
      await updateStakeDeal(deal.id, {
        total_action_selling: pct,
        price_per_percent:    price,
        markup:               mkp,
        min_piece:            parseFloat(fields.minPiece) || 1,
        notes:                fields.notes.trim() || null,
        reentry_covered:      fields.reentryCovered,
        visibility:           isPublishedStatus(deal.status)
          ? (fields.visibility === "followers" ? "friends" : "public")
          : deal.visibility,
      });
      const updated = await getStakeDeal(deal.id);
      if (updated) setDeal(updated);
      setView("seller_dash");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  const eventForForm: TournamentEvent = event ?? {
    id: 0,
    name: deal?.tournament_name ?? "",
    date: deal?.tournament_date ?? "",
    venue: deal?.venue ?? "",
    buyin: deal?.buy_in ? `$${deal.buy_in}` : "",
    notes: "",
    created_at: 0,
    image_url: "",
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleBack}>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.bg.primary }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border.strong }]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={showBack ? handleBack : onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={showBack ? "arrow-back" : "close"} size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>{headerTitle[view]}</Text>
            {deal && (
              <Text style={[styles.headerSub, { color: colors.text.tertiary }]} numberOfLines={1}>
                {deal.tournament_name}
              </Text>
            )}
          </View>
          {/* Right action */}
          {view === "seller_dash" && deal && isOwner ? (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setView("seller_edit")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="pencil-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          ) : view === "seller_edit" ? (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => saveFormRef.current?.()}
              disabled={saving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: saving ? colors.text.disabled : BRAND }}>
                Save
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        {/* Body */}
        {(view === "loading" || loading) ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={BRAND} />
          </View>
        ) : view === "create" ? (
          <PackageForm
            event={eventForForm}
            deal={null}
            colors={colors}
            insets={insets}
            onSave={handleCreate}
            onCancel={onClose}
            saving={saving}
          />
        ) : view === "publish_prompt" && deal ? (
          <PublishPromptView
            deal={deal}
            colors={colors}
            insets={insets}
            saving={saving}
            onPublished={(updated) => { setDeal(updated); setView("seller_dash"); }}
            onKeepDraft={() => setView("seller_dash")}
          />
        ) : view === "seller_edit" && deal ? (
          <PackageForm
            event={eventForForm}
            deal={deal}
            colors={colors}
            insets={insets}
            onSave={handleEdit}
            onCancel={() => setView("seller_dash")}
            saving={saving}
            onRegisterSave={(fn) => { saveFormRef.current = fn; }}
          />
        ) : view === "seller_dash" && deal ? (
          <SellerDashView
            deal={deal}
            event={eventForForm}
            colors={colors}
            insets={insets}
            userId={userId}
            onPublish={() => setView("publish_prompt")}
            onDealChanged={setDeal}
            onCancelled={() => { setDeal(null); onDealCreated?.(""); onClose(); }}
          />
        ) : view === "buyer_purchase" && deal ? (
          <BuyerPurchaseView
            deal={deal}
            userId={userId}
            colors={colors}
            insets={insets}
            onClose={onClose}
            onActionClaimed={(pct) =>
              setDeal((d) => d ? { ...d, action_claimed: d.action_claimed + pct } : d)
            }
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
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
  headerBtn:    { width: 40, alignItems: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontSize: 16, fontWeight: "700" },
  headerSub:    { fontSize: 12, marginTop: 1 },

  body: { padding: 16, gap: 12 },

  warnBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },

  // Tournament banner
  tournamentBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  tournamentBannerIcon: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: "#0891B220", alignItems: "center", justifyContent: "center",
  },
  tournamentBannerName: { fontSize: 14, fontWeight: "700" },
  tournamentBannerMeta: { fontSize: 12, marginTop: 2 },

  // Form card
  formCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  cardFieldBlock: { paddingHorizontal: 16, paddingVertical: 14 },
  cardFieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  cardFieldSub:   { fontSize: 12, marginTop: 2 },
  cardDivider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  formRow: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  formRowDivider: { width: StyleSheet.hairlineWidth, height: 48, backgroundColor: "transparent" },
  cardInputRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, gap: 4,
  },
  cardInput:     { flex: 1, fontSize: 17, fontWeight: "600", padding: 0 },
  cardInputUnit: { fontSize: 15, fontWeight: "600" },

  calcBlock: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  visibilityRow:    { flexDirection: "row", gap: 10 },
  visibilityOption: {
    flex: 1, borderRadius: 12, borderWidth: 1.5,
    padding: 12, alignItems: "center", gap: 4,
  },
  visibilityLabel: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  visibilitySub:   { fontSize: 11, textAlign: "center" },

  summaryCard:  { borderRadius: 14, borderWidth: 1, padding: 14 },
  summaryLabel: { fontSize: 14, fontWeight: "700" },
  summarySub:   { fontSize: 12, marginTop: 1 },
  summaryRaise: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },

  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 16, paddingVertical: 16,
  },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  cancelFormBtn: { alignItems: "center", paddingVertical: 12 },

  textarea: { height: 80, textAlignVertical: "top" },

  // Publish prompt
  publishSuccessBanner: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    alignItems: "center", gap: 8,
  },
  publishSuccessTitle: { fontSize: 18, fontWeight: "800" },
  publishSuccessSub:   { fontSize: 13, textAlign: "center", lineHeight: 19 },
  publishHeading:      { fontSize: 15, fontWeight: "700", marginTop: 4 },
  publishOption: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, borderWidth: 1.5, padding: 16,
  },
  publishOptionIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  publishOptionLabel: { fontSize: 15, fontWeight: "700" },
  publishOptionSub:   { fontSize: 12, marginTop: 2 },

  // Seller dash — sharing section
  sharingCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, gap: 0,
  },
  sharingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 6,
  },
  sharingIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },

  dealBanner: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
  },
  dealBannerTitle: { fontSize: 16, fontWeight: "800" },
  dealBannerSub:   { fontSize: 13, marginTop: 2 },
  statusDot:       { width: 8, height: 8, borderRadius: 4 },
  dealPctCircle: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  dealPctNum:   { fontSize: 14, fontWeight: "800" },
  dealPctLabel: { fontSize: 10 },

  progressTrack: {
    height: 6, borderRadius: 3, backgroundColor: "#E5E7EB", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabel: { fontSize: 11 },

  quickActionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  quickActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  quickActionText: { fontSize: 13, fontWeight: "600" },

  detailCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 12, paddingHorizontal: 14, gap: 10,
  },
  detailLabel: { fontSize: 13, width: 84 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: "600" },

  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  emptyCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 24, alignItems: "center", gap: 8,
  },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  claimRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10,
  },
  claimName:       { fontSize: 14, fontWeight: "700" },
  claimStatusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  claimStatusText: { fontSize: 11, fontWeight: "700" },
  claimDetail:     { fontSize: 12, marginTop: 2 },
  claimMsg:        { fontSize: 12, fontStyle: "italic", marginTop: 3 },
  claimActions:    { flexDirection: "row", gap: 6 },
  claimActionBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  markSoldBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cancelDealBtn: {
    borderRadius: 16, borderWidth: 1, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  cancelDealText: { fontSize: 15, fontWeight: "600" },

  // Buyer view
  sellerStrip: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14,
  },
  sellerName:   { fontSize: 15, fontWeight: "700" },
  sellerHandle: { fontSize: 12, marginTop: 1 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusPillText: { fontSize: 12, fontWeight: "700" },

  buyerStatsRow: {
    flexDirection: "row",
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  buyerStatCell: {
    flex: 1, paddingVertical: 12, alignItems: "center", gap: 2,
  },
  buyerStatValue: { fontSize: 15, fontWeight: "800" },
  buyerStatLabel: { fontSize: 11 },

  notesCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12,
  },
  notesText: { flex: 1, fontSize: 13, lineHeight: 19 },

  myClaimCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8,
  },
  myClaimTitle:  { fontSize: 15, fontWeight: "700", flex: 1 },
  myClaimDetail: { fontSize: 13 },
  withdrawBtn: {
    borderRadius: 10, borderWidth: 1, paddingVertical: 9,
    alignItems: "center", marginTop: 4,
  },
  withdrawBtnText: { fontSize: 14, fontWeight: "600" },

  stepperRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", justifyContent: "center",
  },
  stepperInput: { fontSize: 28, fontWeight: "800", height: 44, lineHeight: 36 },
  stepperUnit:  { fontSize: 14, marginTop: 2 },

  costRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12,
  },
  costLabel:  { fontSize: 13, fontWeight: "500" },
  costAmount: { fontSize: 20, fontWeight: "900" },
});
