import { setTournamentStakeDeal, TournamentEvent } from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { sendPushToUser } from "@/lib/notifications";
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
  updateClaimStatus,
  updateStakeDeal,
  withdrawClaim,
} from "@/lib/stakes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
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
const PURPLE = "#7C3AED";
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
  claim, onConfirm, onReject, colors,
}: {
  claim: StakeClaim;
  onConfirm: () => void;
  onReject: () => void;
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
      {/* Pending indicator stripe */}
      {isPending && (
        <View style={{ height: 3, backgroundColor: ORANGE, borderRadius: 2, marginBottom: 12 }} />
      )}

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
        <View style={{ backgroundColor: statusColor + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: statusColor, textTransform: "capitalize" }}>{claim.status}</Text>
        </View>
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

      {/* Action buttons — only for pending */}
      {isPending && (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14, paddingHorizontal: 14, paddingBottom: 14 }}>
          <TouchableOpacity
            onPress={onReject}
            activeOpacity={0.8}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: RED + "15", borderWidth: 1, borderColor: RED + "40" }}
          >
            <Ionicons name="close-circle-outline" size={18} color={RED} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: RED }}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            activeOpacity={0.8}
            style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: GREEN }}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Confirm Deal</Text>
          </TouchableOpacity>
        </View>
      )}
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
    notes: string;
    visibility: "public" | "followers";
  }) => void;
  onCancel: () => void;
  saving: boolean;
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
  const [notes,       setNotes]       = useState(deal?.notes ?? "");
  const [visibility,  setVisibility]  = useState<"public" | "followers">(
    deal ? (deal.visibility === "friends" || deal.visibility === "followers" ? "followers" : "public") : "public"
  );

  // Auto-calc price from buy-in when markup changes
  useEffect(() => {
    if (parsedBuyIn == null || deal) return;
    const mkp = showMarkup ? parseFloat(markup) || 1.0 : 1.0;
    setPricePerPct(((parsedBuyIn / 100) * mkp).toFixed(2));
  }, [parsedBuyIn, showMarkup, markup]);

  const pctNum   = parseFloat(actionPct) || 0;
  const priceNum = parseFloat(pricePerPct) || 0;
  const mkpNum   = showMarkup ? parseFloat(markup) || 1.0 : 1.0;
  const totalRaise = priceNum > 0 ? (pctNum * priceNum).toFixed(2) : null;

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

        {/* Price per % — read-only auto-calculated field */}
        <View style={styles.cardFieldBlock}>
          <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 8 }]}>Price per 1%</Text>

          {parsedBuyIn ? (
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
                  {pricePerPct || (parsedBuyIn / 100).toFixed(2)}
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
                {event.buyin} buy-in ÷ 100{mkpNum !== 1 ? ` × ${mkpNum}× markup` : ""}
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

      {/* Visibility (only relevant when editing an already-published deal) */}
      {deal && isPublishedStatus(deal.status) && (
        <View style={[styles.formCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <View style={styles.cardFieldBlock}>
            <Text style={[styles.cardFieldLabel, { color: colors.text.tertiary, marginBottom: 10 }]}>Visibility</Text>
            <View style={styles.visibilityRow}>
              {([
                { key: "public"    as const, icon: "globe-outline"  as const, label: "Public",       sub: "Community feed" },
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
              </Text>
            </View>
            {totalRaise && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.summaryLabel, { color: colors.text.tertiary, fontSize: 11 }]}>Total raise</Text>
                <Text style={[styles.summaryRaise, { color: PURPLE }]}>${totalRaise}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <TouchableOpacity
        onPress={() => onSave({ actionPct, pricePerPct, markup, showMarkup, minPiece, notes, visibility })}
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
          Choose who can see your stake deal, then publish to find backers.
        </Text>
      </View>

      <Text style={[styles.publishHeading, { color: colors.text.primary }]}>Who can see this?</Text>

      {([
        { key: "public"    as const, icon: "globe-outline"   as const, label: "Public",         sub: "Visible to everyone on the community feed",  color: BRAND },
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
              <Text style={styles.createBtnText}>Publish Now</Text>
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
  onEdit,
  onPublish,
  onDealChanged,
  onCancelled,
}: {
  deal: StakeDeal;
  event: TournamentEvent;
  colors: any;
  insets: any;
  onEdit: () => void;
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
    Alert.alert("Close Deal", "Stop accepting new claims? Existing confirmed claims remain.", [
      { text: "Keep Open", style: "cancel" },
      {
        text: "Close",
        style: "destructive",
        onPress: async () => {
          try {
            await closeStakeDeal(deal.id);
            onDealChanged({ ...deal, status: "closed" });
          } catch {
            Alert.alert("Error", "Could not close deal.");
          }
        },
      },
    ]);
  }

  async function handleCancel() {
    Alert.alert("Cancel Deal", "Cancel this deal and notify buyers? This cannot be undone.", [
      { text: "Keep Deal", style: "cancel" },
      {
        text: "Cancel Deal",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelStakeDeal(deal.id);
            setTournamentStakeDeal(event.id, "");
            onCancelled();
          } catch {
            Alert.alert("Error", "Could not cancel deal.");
          }
        },
      },
    ]);
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
    Alert.alert("Unpublish", "Remove this deal from the feed? You can re-publish it later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unpublish",
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

      {/* Draft publish prompt */}
      {isDraft && (
        <TouchableOpacity
          onPress={onPublish}
          style={[styles.publishDraftBanner, { backgroundColor: BRAND + "10", borderColor: BRAND + "40" }]}
          activeOpacity={0.85}
        >
          <Ionicons name="rocket-outline" size={20} color={BRAND} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.publishDraftTitle, { color: BRAND }]}>Draft — not visible yet</Text>
            <Text style={[styles.publishDraftSub, { color: colors.text.secondary }]}>Tap to publish and find backers</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={BRAND} />
        </TouchableOpacity>
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

      {/* Quick actions */}
      {!isClosed && (
        <View style={styles.quickActionsRow}>
          {isEditable && (
            <TouchableOpacity onPress={onEdit} style={[styles.quickActionBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]} activeOpacity={0.8}>
              <Ionicons name="pencil-outline" size={16} color={colors.text.secondary} />
              <Text style={[styles.quickActionText, { color: colors.text.secondary }]}>Edit</Text>
            </TouchableOpacity>
          )}
          {(isActive || isPaused) && (
            <TouchableOpacity onPress={handleTogglePause} style={[styles.quickActionBtn, { borderColor: isPaused ? GREEN + "60" : ORANGE + "60", backgroundColor: isPaused ? GREEN + "10" : ORANGE + "10" }]} activeOpacity={0.8}>
              <Ionicons name={isPaused ? "play-outline" : "pause-outline"} size={16} color={isPaused ? GREEN : ORANGE} />
              <Text style={[styles.quickActionText, { color: isPaused ? GREEN : ORANGE }]}>{isPaused ? "Resume" : "Pause"}</Text>
            </TouchableOpacity>
          )}
          {isPublishedStatus(deal.status) && (
            <TouchableOpacity onPress={handleShare} style={[styles.quickActionBtn, { borderColor: BRAND + "60", backgroundColor: BRAND + "10" }]} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={16} color={BRAND} />
              <Text style={[styles.quickActionText, { color: BRAND }]}>Share</Text>
            </TouchableOpacity>
          )}
          {isActive && (
            <TouchableOpacity onPress={handleClose} style={[styles.quickActionBtn, { borderColor: GRAY + "60", backgroundColor: GRAY + "10" }]} activeOpacity={0.8}>
              <Ionicons name="lock-closed-outline" size={16} color={GRAY} />
              <Text style={[styles.quickActionText, { color: GRAY }]}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Visibility chip */}
      {isPublishedStatus(deal.status) && (
        <TouchableOpacity onPress={handleUnpublish} activeOpacity={0.8}>
          <View style={[styles.visChip, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
            <Ionicons
              name={deal.visibility === "friends" || deal.visibility === "followers" ? "people-outline" : "globe-outline"}
              size={14}
              color={colors.text.tertiary}
            />
            <Text style={[styles.visChipText, { color: colors.text.secondary }]}>
              {deal.visibility === "friends" || deal.visibility === "followers" ? "Followers Only" : "Public"} · Tap to unpublish
            </Text>
          </View>
        </TouchableOpacity>
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
                    colors={colors}
                  />
                ))}
              </View>
            )}
          </>
        );
      })()}

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
          <Text style={[styles.cancelDealText, { color: RED }]}>Cancel Deal</Text>
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
    buyer_purchase: "Buy Stake",
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
    minPiece: string; notes: string; visibility: "public" | "followers";
  }) {
    if (!userId) { Alert.alert("Sign in required"); return; }
    if (!event)  { Alert.alert("Error", "No tournament attached."); return; }

    const pct = parseFloat(fields.actionPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      Alert.alert("Invalid %", "Enter a percentage between 1 and 100."); return;
    }
    const price = fields.pricePerPct ? parseFloat(fields.pricePerPct) : null;
    const mkp   = fields.showMarkup ? parseFloat(fields.markup) || 1.0 : 1.0;

    setSaving(true);
    try {
      const created = await createStakeDeal({
        user_id:              userId,
        tournament_name:      event.name,
        venue:                event.venue || null,
        tournament_date:      event.date,
        buy_in:               event.buyin ? parseFloat(event.buyin.replace(/[^0-9.]/g, "")) || null : null,
        total_action_selling: pct,
        price_per_percent:    price,
        markup:               mkp,
        min_piece:            parseFloat(fields.minPiece) || 1,
        notes:                fields.notes.trim() || null,
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
    minPiece: string; notes: string; visibility: "public" | "followers";
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
        <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
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
          <View style={styles.headerBtn} />
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
        ) : view === "seller_edit" && deal && event ? (
          <PackageForm
            event={eventForForm}
            deal={deal}
            colors={colors}
            insets={insets}
            onSave={handleEdit}
            onCancel={() => setView("seller_dash")}
            saving={saving}
          />
        ) : view === "seller_dash" && deal ? (
          <SellerDashView
            deal={deal}
            event={eventForForm}
            colors={colors}
            insets={insets}
            onEdit={() => setView("seller_edit")}
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: "#7C3AED20", alignItems: "center", justifyContent: "center",
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

  // Seller dash
  publishDraftBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  publishDraftTitle: { fontSize: 14, fontWeight: "700" },
  publishDraftSub:   { fontSize: 12, marginTop: 1 },

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

  visChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  visChipText: { fontSize: 12 },

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
  cancelDealBtn: {
    borderRadius: 16, borderWidth: 1, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
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
