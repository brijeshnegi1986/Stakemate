import { PaywallModal } from "@/components/PaywallModal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SellStakesModal } from "@/components/SellStakesModal";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import {
  addTournamentEvent,
  deleteTournamentEvent,
  getSetting,
  getTournamentEvents,
  TournamentEvent,
} from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import {
  createPost,
  fetchSavedTournamentPosts,
  fetchTournamentFeed,
  followPlayer,
  saveTournamentPost,
  SocialPost,
  unfollowPlayer,
  unsaveTournamentPost,
} from "@/lib/social";
import { cancelStakeDeal, claimStake, getOpenDealByAuthorAndTournament, getStakeDeal } from "@/lib/stakes";
import { deleteMySubmission, fetchMyPendingSubmissions, fetchOfficialTournaments, OfficialTournament, submitTournamentToDirectory } from "@/lib/tournaments";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const PURPLE = "#7C3AED";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type CalTab = "schedule" | "tournaments";

function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

function reformat24hInText(text: string): string {
  return text.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, h, m) =>
    fmt12h(`${h}:${m}`)
  );
}

function toYMD(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Notification helpers ──────────────────────────────────────────────────────

async function scheduleNotifications(event: TournamentEvent) {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const eventDate = new Date(event.date + "T07:00:00");
    const dayBefore = new Date(eventDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(8, 0, 0, 0);
    const now = new Date();

    if (dayBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Tournament Tomorrow 🎯",
          body: `${event.name}${event.venue ? ` at ${event.venue}` : ""}${event.buyin ? ` · Buy-in: ${event.buyin}` : ""}`,
          data: { eventId: event.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayBefore },
      });
    }
    if (eventDate > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Tournament Day! 🏆",
          body: `Good luck at ${event.name}${event.venue ? ` · ${event.venue}` : ""}`,
          data: { eventId: event.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: eventDate },
      });
    }
  } catch { /* notifications not supported in this environment */ }
}

// ─── Calendar sync helper ─────────────────────────────────────────────────────

async function addToDeviceCalendar(event: TournamentEvent): Promise<boolean> {
  try {
    const permResult = await Calendar.requestCalendarPermissions();
    if (permResult?.status !== "granted") return false;

    let targetCal: any = null;

    if (Platform.OS === "ios") {
      try {
        targetCal = Calendar.getDefaultCalendarSync();
      } catch { /* fall through to manual search */ }
    }

    if (!targetCal) {
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      if (Platform.OS === "ios") {
        targetCal = calendars.find((c) => c.allowsModifications && (c.type === "caldav" || c.type === "local"))
          ?? calendars.find((c) => c.allowsModifications);
      } else {
        targetCal = calendars.find((c: any) => c.isPrimary && c.allowsModifications)
          ?? calendars.find((c) => c.allowsModifications);
      }
    }

    if (!targetCal) return false;

    const start = new Date(event.date + "T09:00:00");
    const end   = new Date(event.date + "T18:00:00");

    await targetCal.createEvent({
      title: event.name,
      startDate: start,
      endDate: end,
      location: event.venue || undefined,
      notes: [event.buyin ? `Buy-in: ${event.buyin}` : "", event.notes || ""].filter(Boolean).join("\n"),
      alarms: [{ relativeOffset: -1440 }, { relativeOffset: -60 }],
    });
    return true;
  } catch { return false; }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { isPro, isElite } = useSubscription();

  const today = new Date();
  const [calTab, setCalTab]                     = useState<CalTab>("schedule");
  const [viewYear, setViewYear]                 = useState(today.getFullYear());
  const [viewMonth, setViewMonth]               = useState(today.getMonth());
  const [selectedDate, setSelectedDate]         = useState<string | null>(null);
  const [events, setEvents]                     = useState<TournamentEvent[]>([]);
  const [showAddModal, setShowAddModal]         = useState(false);
  const [shareEvent, setShareEvent]             = useState<TournamentEvent | null>(null);
  const [stakeEvent, setStakeEvent]             = useState<TournamentEvent | null>(null);
  const [showSettings, setShowSettings]         = useState(false);
  const [showPaywall, setShowPaywall]           = useState(false);
  const [showPublish, setShowPublish]           = useState(false);
  const [communityTournaments, setCommunityTournaments] = useState<SocialPost[]>([]);
  const [savedTournaments, setSavedTournaments] = useState<SocialPost[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [loadingSaved, setLoadingSaved]         = useState(false);
  const [officialTournaments, setOfficialTournaments] = useState<OfficialTournament[]>([]);
  const [loadingOfficial, setLoadingOfficial]   = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState<OfficialTournament[]>([]);
  const [filterState, setFilterState]           = useState<string>(() => getSetting("defaultState") ?? "NSW");
  const [searchQuery, setSearchQuery]           = useState("");
  const [selectedSeries, setSelectedSeries]     = useState<string | null>(null);
  const [scheduleView, setScheduleView]         = useState<"list" | "month">("month");
  const [hidePastEvents, setHidePastEvents]     = useState(false);
  const [calAccessGranted, setCalAccessGranted] = useState<boolean | null>(null);

  const [form, setForm]         = useState({ name: "", venue: "", buyin: "", notes: "" });
  const [formImage, setFormImage] = useState<string | null>(null);

  const displayName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Player";

  useFocusEffect(
    useCallback(() => {
      setEvents(getTournamentEvents());
      (async () => {
        try {
          const r = await Calendar.getCalendarPermissions();
          setCalAccessGranted(r?.status === "granted");
        } catch {
          setCalAccessGranted(false);
        }
      })();
      // Load saved community tournaments for all tiers
      if (user?.id) {
        setLoadingSaved(true);
        fetchSavedTournamentPosts(user.id)
          .then(setSavedTournaments)
          .catch(() => setSavedTournaments([]))
          .finally(() => setLoadingSaved(false));
      }
    }, [user?.id])
  );

  useFocusEffect(
    useCallback(() => {
      if (calTab === "tournaments" && user?.id) {
        setLoadingTournaments(true);
        fetchTournamentFeed(user.id)
          .then(setCommunityTournaments)
          .catch(() => setCommunityTournaments([]))
          .finally(() => setLoadingTournaments(false));
      }
    }, [calTab, user?.id])
  );

  useFocusEffect(
    useCallback(() => {
      if (calTab !== "tournaments") return;
      setLoadingOfficial(true);
      fetchOfficialTournaments({ state: filterState, search: searchQuery })
        .then(setOfficialTournaments)
        .catch(() => setOfficialTournaments([]))
        .finally(() => setLoadingOfficial(false));
      if (user?.id && isElite) {
        fetchMyPendingSubmissions(user.id)
          .then(setPendingSubmissions)
          .catch(() => setPendingSubmissions([]));
      }
    }, [calTab, filterState, searchQuery, user?.id, isElite])
  );

  async function handleToggleSave(post: SocialPost) {
    if (!user?.id) return;
    const wasSaved = post.saved_by_me;
    // Optimistic update
    setCommunityTournaments((prev) =>
      prev.map((p) => p.id === post.id
        ? { ...p, saved_by_me: !wasSaved, save_count: wasSaved ? p.save_count - 1 : p.save_count + 1 }
        : p)
    );
    setSavedTournaments((prev) =>
      wasSaved ? prev.filter((p) => p.id !== post.id) : [...prev, { ...post, saved_by_me: true }]
    );
    try {
      if (wasSaved) await unsaveTournamentPost(post.id, user.id);
      else await saveTournamentPost(post.id, user.id);
    } catch {
      // Revert on error
      setCommunityTournaments((prev) =>
        prev.map((p) => p.id === post.id
          ? { ...p, saved_by_me: wasSaved, save_count: post.save_count }
          : p)
      );
      setSavedTournaments((prev) =>
        wasSaved ? [...prev, post] : prev.filter((p) => p.id !== post.id)
      );
    }
  }

  function refresh() { setEvents(getTournamentEvents()); }

  // ── Calendar grid ──────────────────────────────────────────────────────────
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventDates = new Set(events.map((e) => e.date));
  const todayYMD   = toYMD(today.getFullYear(), today.getMonth(), today.getDate());

  // Group official tournaments by series (only when not searching)
  const { seriesGroups, soloTournaments } = useMemo(() => {
    if (searchQuery.trim()) return { seriesGroups: [], soloTournaments: officialTournaments };
    const map = new Map<string, OfficialTournament[]>();
    const solo: OfficialTournament[] = [];
    for (const t of officialTournaments) {
      if (t.series) {
        const arr = map.get(t.series) ?? [];
        arr.push(t);
        map.set(t.series, arr);
      } else {
        solo.push(t);
      }
    }
    const groups: { name: string; imageUrl: string | null; dateFrom: string; dateTo: string; tournaments: OfficialTournament[] }[] = [];
    for (const [name, tournaments] of map) {
      if (tournaments.length === 1) {
        solo.push(tournaments[0]);
      } else {
        groups.push({
          name,
          imageUrl: tournaments[0].series_image_url ?? null,
          dateFrom: tournaments[0].tournament_date,
          dateTo: tournaments[tournaments.length - 1].tournament_date,
          tournaments,
        });
      }
    }
    return { seriesGroups: groups, soloTournaments: solo };
  }, [officialTournaments, searchQuery]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayPress(day: number) {
    const ymd = toYMD(viewYear, viewMonth, day);
    setSelectedDate((prev) => prev === ymd ? null : ymd);
  }

  function openAddModal(date?: string) {
    if (date) setSelectedDate(date);
    setForm({ name: "", venue: "", buyin: "", notes: "" });
    setFormImage(null);
    setShowAddModal(true);
  }

  async function handleSave(date: string = todayYMD) {
    if (!form.name.trim()) return;
    const saved = addTournamentEvent({
      name:  form.name.trim(),
      date,
      venue: form.venue.trim(),
      buyin: form.buyin.trim(),
      notes: form.notes.trim(),
      image_url: formImage ?? "",
    });

    refresh();
    setShowAddModal(false);

    const savedEvent: TournamentEvent = {
      id: saved, date, created_at: Date.now(),
      name: form.name.trim(), venue: form.venue.trim(),
      buyin: form.buyin.trim(), notes: form.notes.trim(),
      image_url: formImage ?? "",
    };

    await scheduleNotifications(savedEvent);

    Alert.alert(
      "Add to Device Calendar?",
      "Would you like to sync this tournament to your phone's calendar?",
      [
        {
          text: "Add to Calendar",
          onPress: async () => {
            const ok = await addToDeviceCalendar(savedEvent);
            if (ok) Alert.alert("Added!", "Tournament added to your device calendar with reminders.");
            else Alert.alert("Couldn't add", "Please check calendar permissions in Settings.");
          },
        },
        { text: "Skip", style: "cancel" },
      ]
    );
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as any,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setFormImage(result.assets[0].uri);
    }
  }

  // Idempotent: check server for existing deal before opening create form
  async function handleSellStakesPress(e: TournamentEvent) {
    const uid = user?.id ?? profile?.id ?? "";

    // Local state already has a deal ID — open directly
    if (e.stake_deal_id) { setStakeEvent(e); return; }

    // No local record — check server to prevent duplicate creation
    if (uid) {
      try {
        const existing = await getOpenDealByAuthorAndTournament(uid, e.name);
        if (existing) {
          // Heal local state then open dashboard
          setEvents((prev) => prev.map((evt) => evt.id === e.id ? { ...evt, stake_deal_id: existing.id } : evt));
          setStakeEvent({ ...e, stake_deal_id: existing.id });
          return;
        }
      } catch { /* fall through to create */ }
    }

    setStakeEvent(e);
  }

  async function handleShareStakeDeal(event: TournamentEvent) {
    if (!user?.id) { Alert.alert("Not signed in", "Sign in to share to the community."); return; }
    if (!event.stake_deal_id) return;
    try {
      const deal = await getStakeDeal(event.stake_deal_id);
      if (!deal) {
        Alert.alert(
          "Stake Deal Unavailable",
          "This stake deal may have been filled or cancelled. You can still create a new deal from the event card."
        );
        return;
      }
      if (deal.status !== "open") {
        Alert.alert("Deal No Longer Open", `This stake deal is currently "${deal.status}". Only open deals can be advertised.`);
        return;
      }
      const remaining = deal.total_action_selling - deal.action_claimed;
      const price     = deal.price_per_percent ? `$${deal.price_per_percent} per %` : null;
      const min       = deal.min_piece > 1 ? ` · Min ${deal.min_piece}%` : "";
      const lines = [
        `🃏 Selling action — ${event.name}`,
        `📊 ${deal.total_action_selling}% total · ${remaining}% remaining`,
        event.venue ? `📍 ${event.venue}` : null,
        event.buyin ? `💰 Buy-in: ${event.buyin}` : null,
        price ? `🏷️ ${price}${deal.markup !== 1 ? ` (${deal.markup}× markup)` : ""}${min}` : null,
        deal.notes ? `📝 ${deal.notes}` : null,
        "Interested? Drop a comment or DM to claim your piece. 🤝",
      ].filter(Boolean).join("\n");
      await createPost({
        user_id: user.id,
        session_type: "tournament",
        session_name: event.name,
        venue: event.venue || null,
        content: lines,
        visibility: "public",
      });
      Alert.alert("Advertised!", "Your stake deal has been posted to the community feed.");
    } catch (e: any) {
      Alert.alert("Could not share", e?.message ?? "Please try again.");
    }
  }

  function handleDelete(id: number) {
    Alert.alert("Delete Event", "Remove this tournament from your calendar?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: () => {
          const evt = events.find((e) => e.id === id);
          if (evt?.stake_deal_id) cancelStakeDeal(evt.stake_deal_id).catch(() => {});
          deleteTournamentEvent(id);
          refresh();
        },
      },
    ]);
  }

  async function handleRequestCalAccess() {
    try {
      const r = await Calendar.requestCalendarPermissions();
      const granted = r?.status === "granted";
      setCalAccessGranted(granted);
      Alert.alert(
        granted ? "Calendar Access Granted" : "Permission Denied",
        granted
          ? "Stakemate can now sync tournaments to your device calendar."
          : "Please enable calendar access in your device Settings → Privacy → Calendar.",
      );
    } catch {
      setCalAccessGranted(false);
      Alert.alert("Error", "Could not request calendar permission. Please check Settings.");
    }
  }

  const selectedEvents = selectedDate ? events.filter((e) => e.date === selectedDate) : [];
  const allUpcoming    = events.filter((e) => e.date >= todayYMD);
  const pastEvents     = events.filter((e) => e.date < todayYMD);

  // Compute saved tournament dates for calendar dots (Pro/Elite + saved community)
  const savedEventDates = new Set(
    savedTournaments.map((p) => p.status ?? "").filter(Boolean)
  );

  // Selected date events — personal + saved community
  const selectedSavedPosts = selectedDate
    ? savedTournaments.filter((p) => p.status === selectedDate)
    : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.bg.primary, paddingTop: insets.top + 12, borderBottomColor: colors.border.default }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerGreeting, { color: colors.text.tertiary }]}>Welcome back</Text>
            <Text style={[styles.headerName, { color: colors.text.primary }]} numberOfLines={1}>{displayName}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {/* Add Custom — Schedule tab only, Pro/Elite */}
            {isPro && calTab === "schedule" && (
              <TouchableOpacity
                onPress={() => openAddModal(selectedDate ?? todayYMD)}
                style={[styles.addCustomBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={16} color={colors.text.secondary} />
                <Text style={[styles.addCustomBtnText, { color: colors.text.secondary }]}>Add Custom</Text>
              </TouchableOpacity>
            )}
            {/* Publish — Tournaments tab, Elite only */}
            {calTab === "tournaments" && isElite && (
              <TouchableOpacity
                onPress={() => setShowPublish(true)}
                style={[styles.addHeaderBtn, { backgroundColor: PURPLE }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.addHeaderBtnText}>Publish</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowSettings(true)}
              style={[styles.iconBtn, { backgroundColor: colors.bg.secondary }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Segmented control */}
        <SegmentedControl
          options={[
            { value: "schedule",    label: "My Schedule", icon: "calendar-outline" },
            { value: "tournaments", label: "Tournaments",  icon: "trophy-outline"   },
          ]}
          selected={calTab}
          onChange={(v) => setCalTab(v as CalTab)}
        />
      </View>

      {/* ── My Schedule tab ── */}
      {calTab === "schedule" && (
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── View toggle ── */}
            <View style={[styles.calSegmentWrap, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="calendar-outline" size={15} color={colors.text.secondary} />
                <Text style={[styles.calSegmentText, { color: colors.text.secondary }]}>Month view</Text>
              </View>
              <Switch
                value={scheduleView === "month"}
                onValueChange={(v) => setScheduleView(v ? "month" : "list")}
                trackColor={{ false: colors.border.default, true: BRAND }}
                thumbColor="#fff"
              />
            </View>

            {/* ── Calendar grid (month view) ── */}
            {scheduleView === "month" && (
              <>
                {/* Month navigation */}
                <View style={[styles.calNav, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.subtle }]}>
                  <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.calNavTitle, { color: colors.text.primary }]}>
                    {MONTHS[viewMonth]} {viewYear}
                  </Text>
                  <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-forward" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* Day headers */}
                <View style={[styles.calDayRow, { backgroundColor: colors.bg.primary }]}>
                  {["S","M","T","W","T","F","S"].map((d, i) => (
                    <Text key={i} style={[styles.calDayLabel, { color: colors.text.tertiary }]}>{d}</Text>
                  ))}
                </View>

                {/* Grid */}
                <View style={[styles.calGrid, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.subtle }]}>
                  {Array.from({ length: cells.length / 7 }, (_, w) => (
                    <View key={w} style={styles.calWeekRow}>
                      {cells.slice(w * 7, w * 7 + 7).map((day, di) => {
                        if (!day) return <View key={di} style={styles.calCell} />;
                        const ymd = toYMD(viewYear, viewMonth, day);
                        const isToday = ymd === todayYMD;
                        const isSelected = ymd === selectedDate;
                        const hasEvent = eventDates.has(ymd);
                        return (
                          <TouchableOpacity key={di} style={styles.calCell} onPress={() => handleDayPress(day)} activeOpacity={0.7}>
                            <View style={[
                              styles.calCellInner,
                              isSelected && { backgroundColor: BRAND },
                              isToday && !isSelected && { borderWidth: 1.5, borderColor: BRAND },
                            ]}>
                              <Text style={[styles.calCellNum, {
                                color: isSelected ? "#fff" : isToday ? BRAND : colors.text.primary,
                                fontWeight: isToday || isSelected ? "700" : "400",
                              }]}>{day}</Text>
                              {hasEvent && (
                                <View style={[styles.calDot, { backgroundColor: isSelected ? "#fff" : BRAND }]} />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>

              </>
            )}

            {/* ── Events list ── */}
            <View style={{ paddingTop: 16 }}>
              {/* Selected date (month view only) */}
              {scheduleView === "month" && selectedDate && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}
                  </Text>
                  {selectedEvents.length === 0 && selectedSavedPosts.length === 0 ? (
                    <Text style={[styles.calNoEvents, { color: colors.text.tertiary, marginTop: 0, textAlign: "left" }]}>No events on this day</Text>
                  ) : (
                    <>
                      {selectedEvents.map((e) => (
                        <EventCard key={e.id} event={e} colors={colors}
                          onDelete={() => handleDelete(e.id)}
                          onShare={() => setShareEvent(e)}
                          onShareStake={() => handleShareStakeDeal(e)}
                          onSellStakes={() => handleSellStakesPress(e)}
                          onCalendarSync={() => addToDeviceCalendar(e).then((ok) => Alert.alert(ok ? "Added!" : "Error", ok ? "Added to your device calendar." : "Could not add to calendar."))}
                        />
                      ))}
                      {selectedSavedPosts.map((p) => (
                        <SavedTournamentCard key={p.id} post={p} colors={colors} onUnsave={() => handleToggleSave(p)} />
                      ))}
                    </>
                  )}
                </View>
              )}

              {/* Today */}
              {(events.filter((e) => e.date === todayYMD).length > 0 || savedTournaments.filter((p) => p.status === todayYMD).length > 0) && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>Today</Text>
                  {events.filter((e) => e.date === todayYMD).map((e) => (
                    <EventCard key={e.id} event={e} colors={colors}
                      onDelete={() => handleDelete(e.id)} onShare={() => setShareEvent(e)}
                      onShareStake={() => handleShareStakeDeal(e)}
                      onSellStakes={() => handleSellStakesPress(e)}
                      onCalendarSync={() => addToDeviceCalendar(e).then((ok) => Alert.alert(ok ? "Added!" : "Error", ok ? "Added to your device calendar." : "Could not add to calendar."))}
                    />
                  ))}
                  {savedTournaments.filter((p) => p.status === todayYMD).map((p) => (
                    <SavedTournamentCard key={p.id} post={p} colors={colors} onUnsave={() => handleToggleSave(p)} />
                  ))}
                </View>
              )}

              {/* Upcoming */}
              {allUpcoming.filter((e) => e.date > todayYMD).length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>Upcoming</Text>
                  {allUpcoming.filter((e) => e.date > todayYMD).map((e) => (
                    <EventCard key={e.id} event={e} colors={colors} showDate
                      onDelete={() => handleDelete(e.id)} onShare={() => setShareEvent(e)}
                      onShareStake={() => handleShareStakeDeal(e)}
                      onSellStakes={() => handleSellStakesPress(e)}
                      onCalendarSync={() => addToDeviceCalendar(e).then((ok) => Alert.alert(ok ? "Added!" : "Error", ok ? "Added to your device calendar." : "Could not add to calendar."))}
                    />
                  ))}
                </View>
              )}

              {/* Saved community */}
              {savedTournaments.filter((p) => (p.status ?? "") > todayYMD).length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>Saved Tournaments</Text>
                  {savedTournaments
                    .filter((p) => (p.status ?? "") > todayYMD)
                    .map((p) => <SavedTournamentCard key={p.id} post={p} colors={colors} onUnsave={() => handleToggleSave(p)} />)}
                </View>
              )}

              {/* Past */}
              {!hidePastEvents && pastEvents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>Past</Text>
                  {pastEvents.map((e) => (
                    <EventCard key={e.id} event={e} colors={colors} past showDate
                      onDelete={() => handleDelete(e.id)} onShare={() => setShareEvent(e)}
                      onShareStake={() => handleShareStakeDeal(e)}
                      onSellStakes={() => handleSellStakesPress(e)} onCalendarSync={() => {}}
                    />
                  ))}
                </View>
              )}

              {/* Empty state */}
              {events.length === 0 && savedTournaments.length === 0 && (
                <View style={[styles.emptyState, { borderColor: colors.border.default }]}>
                  <Ionicons name="calendar-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments yet</Text>
                  <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                    Browse the Tournaments tab and tap ⭐ to add events to your schedule.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCalTab("tournaments")}
                    style={[styles.emptyAction, { backgroundColor: BRAND }]}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trophy-outline" size={14} color="#fff" />
                    <Text style={styles.emptyActionText}>Browse Tournaments</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Tournaments tab ── */}
      {calTab === "tournaments" && (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={[styles.searchRow, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
            <View style={[styles.searchBox, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
              <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
              <TextInput
                placeholder="Search tournaments, series, venue…"
                placeholderTextColor={colors.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: colors.text.primary }]}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
          </View>

          {/* State filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stateChipsRow}
            style={[styles.stateChipsScroll, { borderBottomColor: colors.border.default, backgroundColor: colors.bg.primary }]}
            alwaysBounceHorizontal={false}
          >
            {["NSW", "VIC", "QLD", "WA", "SA", "ACT", "NT", "TAS"].map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setFilterState(s)}
                activeOpacity={0.75}
                style={[
                  styles.stateChip,
                  filterState === s
                    ? { backgroundColor: BRAND, borderColor: BRAND }
                    : { backgroundColor: colors.bg.secondary, borderColor: colors.border.default },
                ]}
              >
                <Text style={[styles.stateChipText, { color: filterState === s ? "#fff" : colors.text.secondary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Official tournaments */}
            {loadingOfficial ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={BRAND} />
              </View>
            ) : officialTournaments.length === 0 ? (
              <View style={[styles.emptyState, { borderColor: colors.border.default, marginHorizontal: 16 }]}>
                <Ionicons name="trophy-outline" size={44} color={colors.text.tertiary} />
                <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments found</Text>
                <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                  {searchQuery.trim() ? "Try a different search term." : `No upcoming tournaments in ${filterState} yet.`}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginBottom: 4, paddingHorizontal: 16 }]}>
                  {officialTournaments.length} UPCOMING IN {filterState}
                </Text>

                {/* Series groups */}
                {seriesGroups.map((g) => (
                  <SeriesCard
                    key={g.name}
                    group={g}
                    colors={colors}
                    onPress={() => setSelectedSeries(g.name)}
                  />
                ))}

                {/* Solo / non-series tournaments */}
                {soloTournaments.length > 0 && seriesGroups.length > 0 && (
                  <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 4, paddingHorizontal: 16 }]}>
                    INDIVIDUAL EVENTS
                  </Text>
                )}
                {soloTournaments.map((t) => (
                  <OfficialTournamentCard
                    key={t.id}
                    tournament={t}
                    colors={colors}
                    onAdded={refresh}
                  />
                ))}
              </View>
            )}

            {/* My pending submissions */}
            {isElite && pendingSubmissions.length > 0 && (
              <View style={[styles.section, { gap: 10, marginTop: 8 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>MY SUBMISSIONS</Text>
                  <View style={{ backgroundColor: "#F59E0B18", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#F59E0B" }}>PENDING REVIEW</Text>
                  </View>
                </View>
                {pendingSubmissions.map((t) => (
                  <PendingSubmissionCard
                    key={t.id}
                    tournament={t}
                    colors={colors}
                    userId={user?.id ?? ""}
                    onDeleted={() => setPendingSubmissions((prev) => prev.filter((p) => p.id !== t.id))}
                  />
                ))}
              </View>
            )}


            {/* Non-Elite teaser */}
            {!isElite && (
              <TouchableOpacity
                onPress={() => setShowPaywall(true)}
                activeOpacity={0.85}
                style={[styles.eliteTeaser, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "30", marginHorizontal: 16 }]}
              >
                <Ionicons name="trophy" size={16} color={PURPLE} />
                <Text style={[styles.eliteTeaserText, { color: colors.text.secondary }]}>
                  <Text style={{ fontWeight: "700", color: PURPLE }}>Elite organisers</Text> can publish tournaments to the community.
                </Text>
                <Ionicons name="chevron-forward" size={14} color={PURPLE} />
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Calendar Settings — full-screen modal ── */}
      <CalendarSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        isPro={isPro}
        calAccessGranted={calAccessGranted}
        hidePastEvents={hidePastEvents}
        onHidePastEventsChange={setHidePastEvents}
        onRequestCalAccess={handleRequestCalAccess}
        onOpenPaywall={() => { setShowSettings(false); setShowPaywall(true); }}
        insets={insets}
        colors={colors}
      />

      {/* ── Add Tournament — full-screen stack-style modal ── */}
      <AddTournamentModal
        visible={showAddModal}
        onClose={() => { Keyboard.dismiss(); setShowAddModal(false); }}
        todayYMD={todayYMD}
        form={form}
        setForm={setForm}
        formImage={formImage}
        onPickImage={handlePickImage}
        onRemoveImage={() => setFormImage(null)}
        onSave={handleSave}
        insets={insets}
        colors={colors}
      />

      {/* ── Share Tournament Modal ── */}
      {shareEvent && (
        <ShareTournamentModal
          event={shareEvent}
          userId={user?.id ?? profile?.id ?? ""}
          colors={colors}
          insets={insets}
          onClose={() => setShareEvent(null)}
        />
      )}

      {/* ── Sell Stakes Modal ── */}
      {stakeEvent && (
        <SellStakesModal
          visible={!!stakeEvent}
          event={stakeEvent}
          userId={user?.id ?? profile?.id ?? ""}
          onClose={() => setStakeEvent(null)}
          onDealCreated={(dealId) => {
            setEvents((prev) =>
              prev.map((e) => e.id === stakeEvent.id ? { ...e, stake_deal_id: dealId } : e)
            );
          }}
        />
      )}

      {/* ── Paywall ── */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
      />

      {/* ── Publish Tournament (Elite) ── */}
      {isElite && user?.id && (
        <PublishTournamentModal
          visible={showPublish}
          onClose={() => setShowPublish(false)}
          userId={user.id}
          onSubmitted={(t) => {
            setPendingSubmissions((prev) => [t, ...prev]);
            setShowPublish(false);
          }}
          insets={insets}
          colors={colors}
        />
      )}

      {/* ── Series Detail ── */}
      <SeriesDetailModal
        visible={selectedSeries !== null}
        group={seriesGroups.find((g) => g.name === selectedSeries) ?? null}
        onClose={() => setSelectedSeries(null)}
        colors={colors}
        insets={insets}
        onAdded={refresh}
      />
    </View>
  );
}

// ─── Calendar Settings Modal ──────────────────────────────────────────────────

function CalendarSettingsModal({
  visible, onClose, isPro, calAccessGranted, hidePastEvents,
  onHidePastEventsChange, onRequestCalAccess, onOpenPaywall, insets, colors,
}: {
  visible: boolean;
  onClose: () => void;
  isPro: boolean;
  calAccessGranted: boolean | null;
  hidePastEvents: boolean;
  onHidePastEventsChange: (v: boolean) => void;
  onRequestCalAccess: () => void;
  onOpenPaywall: () => void;
  insets: any;
  colors: any;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[stStyles.page, { backgroundColor: colors.bg.secondary }]}>

        {/* Nav header */}
        <View style={[stStyles.navHeader, { paddingTop: 16, backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={stStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[stStyles.navTitle, { color: colors.text.primary }]}>Calendar Settings</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>

          {/* ── Section: Device Calendar ── */}
          <Text style={[stStyles.sectionLabel, { color: colors.text.tertiary }]}>DEVICE CALENDAR</Text>

          <View style={[stStyles.settingCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <View style={[stStyles.settingIconWrap, { backgroundColor: "#22C55E15" }]}>
              <Ionicons name="calendar" size={18} color="#22C55E" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[stStyles.settingLabel, { color: colors.text.primary }]}>Calendar Access</Text>
              <Text style={[stStyles.settingSub, { color: colors.text.tertiary }]}>
                {calAccessGranted === true
                  ? "Stakemate can read/write your calendar"
                  : calAccessGranted === false
                    ? "Tap to request access"
                    : "Checking permission…"}
              </Text>
            </View>
            <Switch
              value={calAccessGranted === true}
              onValueChange={(val) => {
                if (val) {
                  onRequestCalAccess();
                } else {
                  Alert.alert("Disable Calendar Access", "To revoke access, go to your device Settings → Privacy → Calendars.");
                }
              }}
              trackColor={{ false: colors.border.default, true: "#22C55E55" }}
              thumbColor={calAccessGranted ? "#22C55E" : colors.text.tertiary}
            />
          </View>

          {/* ── Section: Display ── */}
          <Text style={[stStyles.sectionLabel, { color: colors.text.tertiary, marginTop: 24 }]}>DISPLAY</Text>

          <View style={[stStyles.settingCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <View style={[stStyles.settingIconWrap, { backgroundColor: "#F9731615" }]}>
              <Ionicons name="eye-off-outline" size={18} color="#F97316" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[stStyles.settingLabel, { color: colors.text.primary }]}>Hide Past Events</Text>
              <Text style={[stStyles.settingSub, { color: colors.text.tertiary }]}>
                Only show upcoming tournaments in My Schedule
              </Text>
            </View>
            <Switch
              value={hidePastEvents}
              onValueChange={onHidePastEventsChange}
              trackColor={{ false: colors.border.default, true: `${BRAND}55` }}
              thumbColor={hidePastEvents ? BRAND : colors.text.tertiary}
            />
          </View>

          {/* ── Upgrade button (matches More page style) ── */}
          {!isPro && (
            <TouchableOpacity
              onPress={onOpenPaywall}
              activeOpacity={0.88}
              style={[stStyles.upgradeBtn, { backgroundColor: colors.bg.brand }]}
            >
              <Ionicons name="trophy-outline" size={20} color="#fff" />
              <Text style={stStyles.upgradeBtnText}>Upgrade to Pro / Elite</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}

          {isPro && (
            <View style={[stStyles.proBanner, { backgroundColor: BRAND + "10", borderColor: BRAND + "30" }]}>
              <Ionicons name="checkmark-circle" size={20} color={BRAND} />
              <Text style={[stStyles.proBannerText, { color: colors.text.primary }]}>You're on Pro — all features unlocked</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Add Tournament Modal (full-screen stack style) ───────────────────────────

function AddTournamentModal({
  visible, onClose, todayYMD, form, setForm,
  formImage, onPickImage, onRemoveImage, onSave, insets, colors,
}: {
  visible: boolean;
  onClose: () => void;
  todayYMD: string;
  form: { name: string; venue: string; buyin: string; notes: string };
  setForm: (f: any) => void;
  formImage: string | null;
  onPickImage: () => void;
  onRemoveImage: () => void;
  onSave: (date: string) => void;
  insets: any;
  colors: any;
}) {
  const todayObj   = new Date(todayYMD + "T00:00:00");
  const [pickedDate,  setPickedDate]  = useState(todayYMD);
  const [calYear,     setCalYear]     = useState(todayObj.getFullYear());
  const [calMonth,    setCalMonth]    = useState(todayObj.getMonth());

  // Reset picker when modal opens
  useState(() => { if (visible) { setPickedDate(todayYMD); setCalYear(todayObj.getFullYear()); setCalMonth(todayObj.getMonth()); } });

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (calCells.length % 7 !== 0) calCells.push(null);

  const dateLabel = new Date(pickedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", month: "long", day: "numeric" });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[addStyles.page, { backgroundColor: colors.bg.secondary }]}>

        {/* Nav header */}
        <View style={[addStyles.navHeader, { paddingTop: 16, backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={addStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[addStyles.navTitle, { color: colors.text.primary }]}>Add Custom Tournament</Text>
          </View>
          <TouchableOpacity
            onPress={() => onSave(pickedDate)}
            disabled={!form.name.trim()}
            style={[addStyles.saveHeaderBtn, { opacity: form.name.trim() ? 1 : 0.4 }]}
          >
            <Text style={[addStyles.saveHeaderBtnText, { color: BRAND }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            >
              {/* ── Date picker ── */}
              <View style={[addStyles.calendarSection, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                {/* Selected date label */}
                <Text style={[addStyles.pickedDateLabel, { color: colors.text.primary }]}>{dateLabel}</Text>

                {/* Month navigator */}
                <View style={addStyles.calMonthNav}>
                  <TouchableOpacity
                    onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={[addStyles.calMonthLabel, { color: colors.text.primary }]}>
                    {MONTHS[calMonth]} {calYear}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* Day labels */}
                <View style={addStyles.calDayRow}>
                  {DAYS.map((d) => (
                    <Text key={d} style={[addStyles.calDayLabel, { color: colors.text.tertiary }]}>{d}</Text>
                  ))}
                </View>

                {/* Calendar grid */}
                {Array.from({ length: calCells.length / 7 }, (_, w) => (
                  <View key={w} style={addStyles.calWeekRow}>
                    {calCells.slice(w * 7, w * 7 + 7).map((day, i) => {
                      if (!day) return <View key={i} style={addStyles.calDayCell} />;
                      const ymd = toYMD(calYear, calMonth, day);
                      const isSelected = ymd === pickedDate;
                      const isToday    = ymd === todayYMD;
                      const isPast     = ymd < todayYMD;
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[addStyles.calDayCell, isSelected && { backgroundColor: BRAND, borderRadius: 8 }]}
                          onPress={() => setPickedDate(ymd)}
                          activeOpacity={0.7}
                          disabled={isPast}
                        >
                          <Text style={[
                            addStyles.calDayNum,
                            { color: isSelected ? "#fff" : isPast ? colors.text.disabled : isToday ? BRAND : colors.text.primary },
                            isToday && !isSelected && { fontWeight: "700" },
                          ]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Image picker */}
              <TouchableOpacity
                onPress={onPickImage}
                activeOpacity={0.8}
                style={[addStyles.imagePicker, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
              >
                {formImage ? (
                  <>
                    <Image source={{ uri: formImage }} style={addStyles.imagePreview} resizeMode="cover" />
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); onRemoveImage(); }}
                      style={addStyles.imageRemoveBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={24} color="#fff" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={addStyles.imagePickerPlaceholder}>
                    <View style={[addStyles.imagePickerIcon, { backgroundColor: BRAND + "14" }]}>
                      <Ionicons name="image-outline" size={28} color={BRAND} />
                    </View>
                    <Text style={[addStyles.imagePickerLabel, { color: colors.text.secondary }]}>Add Photo</Text>
                    <Text style={[addStyles.imagePickerSub, { color: colors.text.tertiary }]}>Optional · JPG or PNG</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={[addStyles.imageHint, { color: colors.text.tertiary }]}>
                Recommended: 750 × 200 px, landscape, under 2 MB
              </Text>

              {/* Form fields */}
              <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 10 }}>
                <View style={[addStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={addStyles.fieldIcon}>
                    <Ionicons name="trophy-outline" size={16} color={BRAND} />
                  </View>
                  <TextInput
                    style={[addStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Tournament name *"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.name}
                    onChangeText={(t) => setForm((f: any) => ({ ...f, name: t }))}
                    returnKeyType="next"
                    autoFocus
                  />
                </View>

                <View style={[addStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={addStyles.fieldIcon}>
                    <Ionicons name="location-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[addStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Venue"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.venue}
                    onChangeText={(t) => setForm((f: any) => ({ ...f, venue: t }))}
                    returnKeyType="next"
                  />
                </View>

                <View style={[addStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={addStyles.fieldIcon}>
                    <Ionicons name="cash-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[addStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Buy-in (e.g. $200)"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.buyin}
                    onChangeText={(t) => setForm((f: any) => ({ ...f, buyin: t }))}
                    returnKeyType="next"
                  />
                </View>

                <View style={[addStyles.fieldWrap, addStyles.fieldWrapMulti, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={[addStyles.fieldIcon, { paddingTop: 14 }]}>
                    <Ionicons name="document-text-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[addStyles.fieldInput, addStyles.fieldInputMulti, { color: colors.text.primary }]}
                    placeholder="Notes"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.notes}
                    onChangeText={(t) => setForm((f: any) => ({ ...f, notes: t }))}
                    multiline
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    submitBehavior="blurAndSubmit"
                  />
                </View>
              </View>

              {/* Info banner */}
              <View style={[addStyles.infoBanner, { backgroundColor: BRAND + "12", borderColor: BRAND + "30" }]}>
                <Ionicons name="information-circle-outline" size={15} color={BRAND} />
                <Text style={[addStyles.infoBannerText, { color: colors.text.secondary }]}>
                  You'll be asked to add this to your device calendar and will receive reminders the day before and on the day.
                </Text>
              </View>

              {/* Save button */}
              <TouchableOpacity
                style={[addStyles.saveBtn, { backgroundColor: BRAND, opacity: form.name.trim() ? 1 : 0.5 }]}
                onPress={() => onSave(pickedDate)}
                disabled={!form.name.trim()}
                activeOpacity={0.88}
              >
                <Ionicons name="calendar-outline" size={18} color="#fff" />
                <Text style={addStyles.saveBtnText}>Save Tournament</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Publish Tournament Modal (Elite) ────────────────────────────────────────

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "ACT", "NT", "TAS"];

type SeriesEntry = {
  id: string;
  name: string;
  date: string;
  buyIn: string;
  guarantee: string;
  time: string;
  lateReg: string;
  format: string;
  dateError: string;
};

function makeEntry(): SeriesEntry {
  return { id: Math.random().toString(36).slice(2), name: "", date: "", buyIn: "", guarantee: "", time: "", lateReg: "", format: "", dateError: "" };
}

function PubField({ icon, children, borderColor, colors }: { icon: string; children: React.ReactNode; borderColor?: string; colors: any }) {
  return (
    <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: borderColor ?? colors.border.default }]}>
      <View style={pubStyles.fieldIcon}><Ionicons name={icon as any} size={16} color={borderColor ?? colors.text.tertiary} /></View>
      {children}
    </View>
  );
}

// ─── Pending Submission Card ──────────────────────────────────────────────────

function PendingSubmissionCard({
  tournament, colors, userId, onDeleted,
}: {
  tournament: OfficialTournament;
  colors: any;
  userId: string;
  onDeleted: () => void;
}) {
  const [showSheet, setShowSheet] = useState(false);

  function handleAction(action: () => void) {
    setShowSheet(false);
    setTimeout(action, 300);
  }

  async function handleDelete() {
    Alert.alert(
      "Delete Submission",
      `Remove "${tournament.name}" from pending review? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive", onPress: async () => {
            try {
              await deleteMySubmission(tournament.id);
              onDeleted();
            } catch (e: any) {
              Alert.alert("Could not delete", e?.message ?? "Please try again.");
            }
          },
        },
      ]
    );
  }

  async function handleShare(visibility: "public" | "friends") {
    if (!userId) { Alert.alert("Not signed in"); return; }
    try {
      const lines = [
        `🏆 ${tournament.name}`,
        tournament.series ? `Part of ${tournament.series}` : null,
        `📍 ${tournament.venue}${tournament.city ? `, ${tournament.city}` : ""}`,
        `📅 ${new Date(tournament.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long" })}${tournament.tournament_time ? ` · ${fmt12h(tournament.tournament_time)}` : ""}`,
        tournament.buy_in ? `💰 Buy-in: $${tournament.buy_in}${tournament.guarantee ? ` · GTD $${tournament.guarantee.toLocaleString()}` : ""}` : null,
        "Just submitted this to the Stakemate tournament directory! 🃏",
      ].filter(Boolean).join("\n");

      await createPost({
        user_id: userId,
        session_type: "tournament",
        session_name: tournament.name,
        venue: tournament.venue,
        content: lines,
        visibility,
      });
      Alert.alert("Shared!", visibility === "public" ? "Posted to the community." : "Shared with your friends.");
    } catch (e: any) {
      Alert.alert("Could not share", e?.message ?? "Please try again.");
    }
  }

  return (
    <>
      <View style={[styles.officialCard, { backgroundColor: colors.bg.primary, borderColor: "#F59E0B40" }]}>
        <View style={styles.officialCardTop}>
          <View style={[styles.seriesLogoPlaceholder, { backgroundColor: "#F59E0B15" }]}>
            <Ionicons name="time-outline" size={18} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            {tournament.series ? <Text style={[styles.officialSeries, { color: BRAND }]}>{tournament.series}</Text> : null}
            <Text style={[styles.officialName, { color: colors.text.primary }]} numberOfLines={2}>{tournament.name}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: "#F59E0B15", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#F59E0B" }}>Pending</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowSheet(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconBtn, { backgroundColor: colors.bg.secondary }]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.officialDivider, { backgroundColor: colors.border.subtle }]} />
        <View style={styles.officialDetails}>
          <View style={styles.officialDetailItem}>
            <Ionicons name="calendar-outline" size={13} color={colors.text.tertiary} />
            <Text style={[styles.officialDetailText, { color: colors.text.secondary }]}>
              {new Date(tournament.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
              {tournament.tournament_time ? `  ·  ${fmt12h(tournament.tournament_time)}` : ""}
            </Text>
          </View>
          <View style={styles.officialDetailItem}>
            <Ionicons name="location-outline" size={13} color={colors.text.tertiary} />
            <Text style={[styles.officialDetailText, { color: colors.text.secondary }]} numberOfLines={1}>
              {tournament.venue}{tournament.city ? `, ${tournament.city}` : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom sheet */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowSheet(false)} />
        <View style={[styles.sheetContainer, { backgroundColor: colors.bg.primary }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border.default }]} />
          <Text style={[styles.sheetTitle, { color: colors.text.primary }]} numberOfLines={1}>{tournament.name}</Text>

          <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(() => handleShare("public"))}>
            <View style={[styles.sheetIcon, { backgroundColor: BRAND + "15" }]}>
              <Ionicons name="share-social-outline" size={18} color={BRAND} />
            </View>
            <Text style={[styles.sheetRowText, { color: colors.text.primary }]}>Share to Community</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(() => handleShare("friends"))}>
            <View style={[styles.sheetIcon, { backgroundColor: "#22C55E15" }]}>
              <Ionicons name="people-outline" size={18} color="#22C55E" />
            </View>
            <Text style={[styles.sheetRowText, { color: colors.text.primary }]}>Share with Friends</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(handleDelete)}>
            <View style={[styles.sheetIcon, { backgroundColor: "#EF444415" }]}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </View>
            <Text style={[styles.sheetRowText, { color: "#EF4444" }]}>Delete Submission</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.sheetCancel, { borderColor: colors.border.default }]} onPress={() => setShowSheet(false)}>
            <Text style={[styles.sheetCancelText, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

function PublishTournamentModal({
  visible, onClose, userId, onSubmitted, insets, colors,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSubmitted: (t: OfficialTournament) => void;
  insets: any;
  colors: any;
}) {
  const [mode,      setMode]      = useState<"individual" | "series">("individual");
  const [posting,   setPosting]   = useState(false);

  // ── Individual fields ──
  const [name,      setName]      = useState("");
  const [date,      setDate]      = useState("");
  const [venue,     setVenue]     = useState("");
  const [city,      setCity]      = useState("");
  const [iState,    setIState]    = useState("NSW");
  const [buyIn,     setBuyIn]     = useState("");
  const [guarantee, setGuarantee] = useState("");
  const [time,      setTime]      = useState("");
  const [lateReg,   setLateReg]   = useState("");
  const [format,    setFormat]    = useState("");
  const [website,   setWebsite]   = useState("");
  const [dateError, setDateError] = useState("");

  // ── Series fields ──
  const [seriesName,  setSeriesName]  = useState("");
  const [seriesVenue, setSeriesVenue] = useState("");
  const [seriesCity,  setSeriesCity]  = useState("");
  const [seriesState, setSeriesState] = useState("NSW");
  const [entries,     setEntries]     = useState<SeriesEntry[]>([makeEntry()]);

  function updateEntry(id: string, patch: Partial<SeriesEntry>) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }
  function addEntry() { setEntries((prev) => [...prev, makeEntry()]); }
  function removeEntry(id: string) {
    setEntries((prev) => prev.length > 1 ? prev.filter((e) => e.id !== id) : prev);
  }

  function reset() {
    setMode("individual"); setPosting(false);
    setName(""); setDate(""); setVenue(""); setCity(""); setIState("NSW");
    setBuyIn(""); setGuarantee(""); setTime(""); setLateReg(""); setFormat(""); setWebsite(""); setDateError("");
    setSeriesName(""); setSeriesVenue(""); setSeriesCity(""); setSeriesState("NSW");
    setEntries([makeEntry()]);
  }

  function handleClose() { reset(); onClose(); }

  function validateDate(raw: string): string | null {
    const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
  }

  function parseMoney(s: string) {
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  async function handleSubmit() {
    setPosting(true);
    try {
      if (mode === "individual") {
        const isoDate = validateDate(date.trim());
        if (!isoDate) { setDateError("Enter date as DD/MM/YYYY"); setPosting(false); return; }
        setDateError("");
        const t = await submitTournamentToDirectory({
          userId, name: name.trim(), tournament_date: isoDate,
          venue: venue.trim(), city: city.trim(), state: iState,
          buy_in: parseMoney(buyIn), guarantee: parseMoney(guarantee),
          tournament_time: time.trim() || null, late_reg_end: lateReg.trim() || null,
          format: format.trim() || null, website_url: website.trim() || null,
        });
        reset(); onSubmitted(t);
        Alert.alert("Submitted for review!", "We'll approve your tournament shortly.");
      } else {
        // Validate entries
        let hasError = false;
        const validated = entries.map((e) => {
          const iso = validateDate(e.date.trim());
          if (!iso || !e.name.trim()) { hasError = true; return { ...e, dateError: iso ? "" : "Enter DD/MM/YYYY" }; }
          return { ...e, dateError: "" };
        });
        setEntries(validated);
        if (hasError || !seriesName.trim() || !seriesVenue.trim() || !seriesCity.trim()) {
          setPosting(false); return;
        }
        const results = await Promise.all(entries.map((e) => submitTournamentToDirectory({
          userId, name: e.name.trim(),
          tournament_date: validateDate(e.date.trim())!,
          venue: seriesVenue.trim(), city: seriesCity.trim(), state: seriesState,
          series: seriesName.trim(),
          buy_in: parseMoney(e.buyIn), guarantee: parseMoney(e.guarantee),
          tournament_time: e.time.trim() || null, late_reg_end: e.lateReg.trim() || null,
          format: e.format.trim() || null,
        })));
        reset(); onSubmitted(results[0]);
        Alert.alert("Submitted for review!", `${results.length} tournament${results.length > 1 ? "s" : ""} submitted under "${seriesName.trim()}".`);
      }
    } catch (e: any) {
      Alert.alert("Could not submit", e?.message || "Check your connection and try again.");
    } finally { setPosting(false); }
  }

  const canSubmit = !posting && (
    mode === "individual"
      ? name.trim().length > 0 && date.trim().length > 0 && venue.trim().length > 0 && city.trim().length > 0
      : seriesName.trim().length > 0 && seriesVenue.trim().length > 0 && seriesCity.trim().length > 0 && entries.every((e) => e.name.trim().length > 0 && e.date.trim().length > 0)
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[pubStyles.page, { backgroundColor: colors.bg.secondary }]}>

        {/* Nav header */}
        <View style={[pubStyles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={handleClose} style={pubStyles.navSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[pubStyles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[pubStyles.navTitle, { color: colors.text.primary }]}>Submit Tournament</Text>
            <View style={[pubStyles.eliteBadge, { backgroundColor: PURPLE + "18" }]}>
              <Ionicons name="trophy" size={10} color={PURPLE} />
              <Text style={[pubStyles.eliteBadgeText, { color: PURPLE }]}>ELITE</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit} style={[pubStyles.navSide, { alignItems: "flex-end" }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[pubStyles.navPublish, { color: canSubmit ? PURPLE : colors.text.tertiary }]}>
              {posting ? "Saving…" : "Submit"}
            </Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}>

              {/* Mode toggle */}
              <SegmentedControl
                options={[
                  { value: "individual", label: "Individual", icon: "trophy-outline" },
                  { value: "series",     label: "Series",     icon: "layers-outline" },
                ]}
                selected={mode}
                onChange={(v) => setMode(v as "individual" | "series")}
              />

              {/* Info banner */}
              <View style={[pubStyles.infoBanner, { backgroundColor: PURPLE + "10", borderColor: PURPLE + "25" }]}>
                <Ionicons name="time-outline" size={15} color={PURPLE} />
                <Text style={[pubStyles.infoBannerText, { color: colors.text.secondary }]}>
                  {mode === "individual"
                    ? "Your submission will be reviewed before appearing in the official tournament directory."
                    : "All events will be grouped under the series name and reviewed before appearing in the directory."}
                </Text>
              </View>

              {/* ─── INDIVIDUAL MODE ─── */}
              {mode === "individual" && (
                <>
                  <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary }]}>REQUIRED</Text>

                  <PubField icon="trophy-outline" borderColor={PURPLE} colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Tournament name *" placeholderTextColor={colors.text.tertiary}
                      value={name} onChangeText={setName} returnKeyType="next" autoFocus />
                  </PubField>

                  <PubField icon="calendar-outline" borderColor={dateError ? "#EF4444" : undefined} colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Date (DD/MM/YYYY) *" placeholderTextColor={colors.text.tertiary}
                      value={date} onChangeText={(t) => { setDate(t); if (dateError) setDateError(""); }}
                      keyboardType="numbers-and-punctuation" returnKeyType="next" />
                  </PubField>
                  {dateError ? <Text style={pubStyles.fieldError}>{dateError}</Text> : null}

                  <PubField icon="business-outline" colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Venue / Casino *" placeholderTextColor={colors.text.tertiary}
                      value={venue} onChangeText={setVenue} returnKeyType="next" />
                  </PubField>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="location-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="City *" placeholderTextColor={colors.text.tertiary}
                        value={city} onChangeText={setCity} returnKeyType="next" />
                    </PubField>
                    <View style={[pubStyles.fieldWrap, { width: 90, backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                        placeholder="State" placeholderTextColor={colors.text.tertiary}
                        value={iState} onChangeText={(t) => setIState(t.toUpperCase().slice(0, 3))}
                        autoCapitalize="characters" maxLength={3} returnKeyType="next" />
                    </View>
                  </View>

                  <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary, marginTop: 6 }]}>OPTIONAL</Text>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="cash-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="Buy-in ($)" placeholderTextColor={colors.text.tertiary}
                        value={buyIn} onChangeText={setBuyIn} keyboardType="numeric" returnKeyType="next" />
                    </PubField>
                    <PubField icon="trending-up-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="GTD ($)" placeholderTextColor={colors.text.tertiary}
                        value={guarantee} onChangeText={setGuarantee} keyboardType="numeric" returnKeyType="next" />
                    </PubField>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="time-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="Start (HH:MM)" placeholderTextColor={colors.text.tertiary}
                        value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                    </PubField>
                    <PubField icon="hourglass-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="Late reg (HH:MM)" placeholderTextColor={colors.text.tertiary}
                        value={lateReg} onChangeText={setLateReg} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                    </PubField>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="options-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="Format (NLH, PLO…)" placeholderTextColor={colors.text.tertiary}
                        value={format} onChangeText={setFormat} returnKeyType="next" />
                    </PubField>
                    <PubField icon="globe-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="Website URL" placeholderTextColor={colors.text.tertiary}
                        value={website} onChangeText={setWebsite} keyboardType="url" returnKeyType="done" autoCapitalize="none" />
                    </PubField>
                  </View>
                </>
              )}

              {/* ─── SERIES MODE ─── */}
              {mode === "series" && (
                <>
                  <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary }]}>SERIES INFO</Text>

                  <PubField icon="layers-outline" borderColor={PURPLE} colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Series name * (e.g. WSOP Circuit)" placeholderTextColor={colors.text.tertiary}
                      value={seriesName} onChangeText={setSeriesName} returnKeyType="next" autoFocus />
                  </PubField>

                  <PubField icon="business-outline" colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Venue / Casino *" placeholderTextColor={colors.text.tertiary}
                      value={seriesVenue} onChangeText={setSeriesVenue} returnKeyType="next" />
                  </PubField>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="location-outline" colors={colors}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                        placeholder="City *" placeholderTextColor={colors.text.tertiary}
                        value={seriesCity} onChangeText={setSeriesCity} returnKeyType="next" />
                    </PubField>
                    <View style={[pubStyles.fieldWrap, { width: 90, backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                        placeholder="State" placeholderTextColor={colors.text.tertiary}
                        value={seriesState} onChangeText={(t) => setSeriesState(t.toUpperCase().slice(0, 3))}
                        autoCapitalize="characters" maxLength={3} returnKeyType="next" />
                    </View>
                  </View>

                  {/* Tournament entries */}
                  <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary, marginTop: 6 }]}>
                    EVENTS ({entries.length})
                  </Text>

                  {entries.map((entry, idx) => (
                    <View key={entry.id} style={[pubStyles.entryCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: PURPLE }}>Event {idx + 1}</Text>
                        {entries.length > 1 && (
                          <TouchableOpacity onPress={() => removeEntry(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close-circle-outline" size={18} color={colors.text.tertiary} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <PubField icon="trophy-outline" borderColor={PURPLE} colors={colors}>
                        <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                          placeholder="Tournament name *" placeholderTextColor={colors.text.tertiary}
                          value={entry.name} onChangeText={(t) => updateEntry(entry.id, { name: t })} returnKeyType="next" />
                      </PubField>

                      <View style={{ height: 8 }} />

                      <PubField icon="calendar-outline" borderColor={entry.dateError ? "#EF4444" : undefined} colors={colors}>
                        <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                          placeholder="Date (DD/MM/YYYY) *" placeholderTextColor={colors.text.tertiary}
                          value={entry.date} onChangeText={(t) => updateEntry(entry.id, { date: t, dateError: "" })}
                          keyboardType="numbers-and-punctuation" returnKeyType="next" />
                      </PubField>
                      {entry.dateError ? <Text style={[pubStyles.fieldError, { marginTop: 2 }]}>{entry.dateError}</Text> : null}

                      <View style={{ height: 8 }} />

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PubField icon="cash-outline" colors={colors}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                            placeholder="Buy-in ($)" placeholderTextColor={colors.text.tertiary}
                            value={entry.buyIn} onChangeText={(t) => updateEntry(entry.id, { buyIn: t })} keyboardType="numeric" returnKeyType="next" />
                        </PubField>
                        <PubField icon="trending-up-outline" colors={colors}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                            placeholder="GTD ($)" placeholderTextColor={colors.text.tertiary}
                            value={entry.guarantee} onChangeText={(t) => updateEntry(entry.id, { guarantee: t })} keyboardType="numeric" returnKeyType="next" />
                        </PubField>
                      </View>

                      <View style={{ height: 8 }} />

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PubField icon="time-outline" colors={colors}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                            placeholder="Start (HH:MM)" placeholderTextColor={colors.text.tertiary}
                            value={entry.time} onChangeText={(t) => updateEntry(entry.id, { time: t })} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                        </PubField>
                        <PubField icon="hourglass-outline" colors={colors}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary, flex: 1 }]}
                            placeholder="Late reg (HH:MM)" placeholderTextColor={colors.text.tertiary}
                            value={entry.lateReg} onChangeText={(t) => updateEntry(entry.id, { lateReg: t })} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                        </PubField>
                      </View>

                      <View style={{ height: 8 }} />

                      <PubField icon="options-outline" colors={colors}>
                        <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                          placeholder="Format (NLH, PLO…)" placeholderTextColor={colors.text.tertiary}
                          value={entry.format} onChangeText={(t) => updateEntry(entry.id, { format: t })} returnKeyType="done" />
                      </PubField>
                    </View>
                  ))}

                  {/* Add event button */}
                  <TouchableOpacity
                    onPress={addEntry}
                    style={[pubStyles.addEntryBtn, { borderColor: PURPLE + "60", backgroundColor: PURPLE + "0A" }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={PURPLE} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: PURPLE }}>Add Another Event</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Submit button */}
              <TouchableOpacity
                style={[pubStyles.publishBtn, { backgroundColor: PURPLE, opacity: canSubmit ? 1 : 0.45 }]}
                onPress={handleSubmit} disabled={!canSubmit} activeOpacity={0.88}
              >
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                <Text style={pubStyles.publishBtnText}>
                  {posting ? "Submitting…" : mode === "series" ? `Submit ${entries.length} Event${entries.length > 1 ? "s" : ""}` : "Submit for Review"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Series Card + Detail Modal ───────────────────────────────────────────────

const STAR_COLOR = "#F59E0B";

type SeriesGroup = {
  name: string;
  imageUrl: string | null;
  dateFrom: string;
  dateTo: string;
  tournaments: OfficialTournament[];
};

function fmtDateShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function SeriesCard({ group, colors, onPress }: { group: SeriesGroup; colors: any; onPress: () => void }) {
  const dateRange = group.dateFrom === group.dateTo
    ? fmtDateShort(group.dateFrom)
    : `${fmtDateShort(group.dateFrom)} – ${fmtDateShort(group.dateTo)}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.officialCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
    >
      {/* Full-width banner */}
      {group.imageUrl ? (
        <Image source={{ uri: group.imageUrl }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
      ) : (
        <View style={{ width: "100%", height: 60, backgroundColor: BRAND + "12", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="trophy" size={26} color={BRAND} />
        </View>
      )}

      {/* Info row */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.officialPill, { backgroundColor: BRAND + "12", paddingHorizontal: 6, paddingVertical: 2 }]}>
              <Text style={[styles.officialPillText, { color: BRAND, fontSize: 10 }]}>SERIES</Text>
            </View>
          </View>
          <Text style={[styles.officialName, { color: colors.text.primary }]} numberOfLines={1}>{group.name}</Text>
          <Text style={[styles.officialDetailText, { color: colors.text.tertiary }]}>
            {group.tournaments.length} events · {dateRange}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
      </View>
    </TouchableOpacity>
  );
}

function SeriesDetailModal({
  group, visible, onClose, colors, insets, onAdded,
}: {
  group: SeriesGroup | null;
  visible: boolean;
  onClose: () => void;
  colors: any;
  insets: any;
  onAdded: () => void;
}) {
  if (!group) return null;
  const dateRange = group.dateFrom === group.dateTo
    ? fmtDateShort(group.dateFrom)
    : `${fmtDateShort(group.dateFrom)} – ${fmtDateShort(group.dateTo)}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default, paddingTop: 16 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>{group.name}</Text>
            <Text style={[styles.officialDetailText, { color: colors.text.tertiary }]}>{group.tournaments.length} events · {dateRange}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Full-width series banner */}
        {group.imageUrl ? (
          <Image
            source={{ uri: group.imageUrl }}
            style={{ width: "100%", height: 120 }}
            resizeMode="cover"
          />
        ) : null}

        <ScrollView
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {group.tournaments.map((t) => (
            <OfficialTournamentCard
              key={t.id}
              tournament={t}
              colors={colors}
              onAdded={onAdded}
              hideBanner
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function OfficialTournamentCard({
  tournament, colors, onAdded, hideBanner = false,
}: {
  tournament: OfficialTournament;
  colors: any;
  onAdded: () => void;
  hideBanner?: boolean;
}) {
  const [starred, setStarred] = useState(false);

  const dateLabel = tournament.tournament_date
    ? new Date(tournament.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    : null;
  const timeLabel = tournament.tournament_time ? fmt12h(tournament.tournament_time) : null;
  const lateReg   = tournament.late_reg_end ? `Late reg until ${fmt12h(tournament.late_reg_end)}` : null;

  function handleStar() {
    if (starred) return;
    addTournamentEvent({
      name:      tournament.name,
      date:      tournament.tournament_date,
      venue:     [tournament.venue, tournament.city].filter(Boolean).join(", "),
      buyin:     tournament.buy_in != null ? `$${tournament.buy_in.toLocaleString()}` : "",
      notes:     [
        tournament.format,
        tournament.guarantee != null ? `GTD $${tournament.guarantee.toLocaleString()}` : null,
        timeLabel ? `Starts ${timeLabel}` : null,
      ].filter(Boolean).join(" · "),
      image_url: tournament.series_image_url ?? "",
      source:    "directory",
    });
    setStarred(true);
    onAdded();
  }

  const hasBanner = !!tournament.series_image_url && !hideBanner;

  return (
    <View style={[styles.officialCard, { backgroundColor: colors.bg.primary, borderColor: starred ? STAR_COLOR + "60" : colors.border.default }]}>
      {/* Full-width banner image */}
      {hasBanner && (
        <Image source={{ uri: tournament.series_image_url! }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
      )}

      {/* Name row */}
      <View style={[styles.officialCardTop, !hasBanner && { paddingTop: 14 }]}>
        {!hasBanner && (
          <View style={[styles.seriesLogoPlaceholder, { backgroundColor: BRAND + "18" }]}>
            <Ionicons name="trophy" size={18} color={BRAND} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {tournament.series ? (
            <Text style={[styles.officialSeries, { color: BRAND }]}>{tournament.series}</Text>
          ) : null}
          <Text style={[styles.officialName, { color: colors.text.primary }]} numberOfLines={2}>{tournament.name}</Text>
        </View>
        <TouchableOpacity
          onPress={handleStar}
          style={[styles.officialStarBtn, starred && { backgroundColor: STAR_COLOR + "18" }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={starred ? "star" : "star-outline"} size={22} color={starred ? STAR_COLOR : colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.officialDivider, { backgroundColor: colors.border.subtle }]} />

      {/* Date + venue */}
      <View style={styles.officialDetails}>
        {dateLabel ? (
          <View style={styles.officialDetailItem}>
            <Ionicons name="calendar-outline" size={13} color={colors.text.tertiary} />
            <Text style={[styles.officialDetailText, { color: colors.text.secondary }]}>
              {dateLabel}{timeLabel ? `  ·  ${timeLabel}` : ""}
            </Text>
          </View>
        ) : null}
        <View style={styles.officialDetailItem}>
          <Ionicons name="location-outline" size={13} color={colors.text.tertiary} />
          <Text style={[styles.officialDetailText, { color: colors.text.secondary }]} numberOfLines={1}>
            {tournament.venue}{tournament.city ? `, ${tournament.city}` : ""}
          </Text>
        </View>
      </View>

      {/* Pills */}
      <View style={styles.officialPillsRow}>
        {tournament.buy_in != null && (
          <View style={[styles.officialPill, { backgroundColor: colors.bg.secondary }]}>
            <Text style={[styles.officialPillText, { color: colors.text.primary }]}>${tournament.buy_in.toLocaleString()} buy-in</Text>
          </View>
        )}
        {tournament.guarantee != null && (
          <View style={[styles.officialPill, { backgroundColor: "#22C55E18" }]}>
            <Text style={[styles.officialPillText, { color: "#16A34A" }]}>${tournament.guarantee.toLocaleString()} GTD</Text>
          </View>
        )}
        {tournament.format ? (
          <View style={[styles.officialPill, { backgroundColor: colors.bg.secondary }]}>
            <Text style={[styles.officialPillText, { color: colors.text.secondary }]}>{tournament.format}</Text>
          </View>
        ) : null}
        {lateReg ? (
          <View style={[styles.officialPill, { backgroundColor: "#F9731618" }]}>
            <Text style={[styles.officialPillText, { color: "#EA580C" }]}>{lateReg}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function parseStakeDealContent(content: string | null): { pct: string; remaining: string; price: string | null; markup: string | null; buyin: string | null } | null {
  if (!content || !content.startsWith("🃏 Selling action")) return null;
  const pctMatch      = content.match(/(\d+)% total/);
  const remainMatch   = content.match(/(\d+)% remaining/);
  const priceMatch    = content.match(/\$[\d.]+ per %/);
  const markupMatch   = content.match(/\(([\d.]+)× markup\)/);
  const buyinMatch    = content.match(/Buy-in: ([^\n]+)/);
  if (!pctMatch) return null;
  return {
    pct:     pctMatch[1],
    remaining: remainMatch?.[1] ?? pctMatch[1],
    price:   priceMatch?.[0] ?? null,
    markup:  markupMatch?.[1] ?? null,
    buyin:   buyinMatch?.[1] ?? null,
  };
}

function BuyStakesFromFeedModal({
  visible, onClose, authorId, authorName, tournamentName,
  remainingPct, pricePerPct, buyerId, colors,
}: {
  visible: boolean;
  onClose: () => void;
  authorId: string;
  authorName: string;
  tournamentName: string;
  remainingPct: number;
  pricePerPct: string | null;
  buyerId: string;
  colors: any;
}) {
  const [dealId,   setDealId]   = useState<string | null>(null);
  const [percent,  setPercent]  = useState("");
  const [message,  setMessage]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Fetch the live deal when modal opens
  useEffect(() => {
    if (!visible) return;
    setFetching(true);
    setError(null);
    setDealId(null);
    getOpenDealByAuthorAndTournament(authorId, tournamentName)
      .then((deal) => {
        if (deal) setDealId(deal.id);
        else setError("This stake deal is no longer available.");
      })
      .catch(() => setError("Failed to load deal."))
      .finally(() => setFetching(false));
  }, [visible, authorId, tournamentName]);

  async function handleBuy() {
    const pct = parseFloat(percent);
    if (!dealId)           { setError("Deal not found."); return; }
    if (isNaN(pct) || pct <= 0) { setError("Enter a valid percentage."); return; }
    if (pct > remainingPct)     { setError(`Only ${remainingPct}% remaining.`); return; }
    setLoading(true);
    setError(null);
    try {
      await claimStake(dealId, buyerId, pct, message || undefined);
      Alert.alert("Claim Submitted", `You claimed ${pct}% of ${authorName}'s action. They'll confirm shortly.`);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to claim stake.");
    } finally {
      setLoading(false);
    }
  }

  const estimatedCost = (() => {
    if (!pricePerPct) return null;
    // pricePerPct is a formatted string like "$5.00 per %" — extract the number
    const match = pricePerPct.match(/[\d.]+/);
    if (!match) return null;
    const pct = parseFloat(percent);
    if (isNaN(pct)) return null;
    return (parseFloat(match[0]) * pct).toFixed(2);
  })();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.bsOverlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.bsSheet, { backgroundColor: colors.bg.primary }]}>
        {/* Handle */}
        <View style={[styles.bsHandle, { backgroundColor: colors.border.default }]} />

        <Text style={[styles.bsTitle, { color: colors.text.primary }]}>Buy Stakes</Text>
        <Text style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 16 }}>
          {authorName} · {tournamentName}
        </Text>

        {fetching ? (
          <ActivityIndicator color={BRAND} />
        ) : error && !dealId ? (
          <Text style={{ color: "#EF4444", textAlign: "center", marginVertical: 16 }}>{error}</Text>
        ) : (
          <>
            <Text style={{ fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>
              Available: {remainingPct}%{pricePerPct ? `  ·  ${pricePerPct}` : ""}
            </Text>

            <View style={[styles.bsInputWrap, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}>
              <TextInput
                style={[styles.bsInput, { color: colors.text.primary }]}
                placeholder="% to claim (e.g. 5)"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="decimal-pad"
                value={percent}
                onChangeText={setPercent}
              />
              <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>%</Text>
            </View>

            {estimatedCost && (
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 8 }}>
                Estimated cost: ${estimatedCost}
              </Text>
            )}

            <View style={[styles.bsInputWrap, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary, marginTop: 4 }]}>
              <TextInput
                style={[styles.bsInput, { color: colors.text.primary }]}
                placeholder="Message to seller (optional)"
                placeholderTextColor={colors.text.tertiary}
                value={message}
                onChangeText={setMessage}
                multiline
              />
            </View>

            {error && (
              <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 4 }}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.bsBuyBtn, { backgroundColor: loading ? BRAND + "80" : BRAND }]}
              onPress={handleBuy}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>Submit Claim</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

function CommunityTournamentCard({
  post, colors, onToggleSave, currentUserId,
}: {
  post: SocialPost;
  colors: any;
  onToggleSave: () => void;
  currentUserId?: string;
}) {
  const authorName  = post.profile.display_name || post.profile.username || "Player";
  const isOwnPost   = !!currentUserId && currentUserId === post.profile.id;
  const [following, setFollowing] = useState<boolean | null>(null);
  const [buyModal,  setBuyModal]  = useState(false);

  // Check follow state once on mount
  useEffect(() => {
    if (!currentUserId || isOwnPost) return;
    import("@/lib/social").then(({ getFollowingIds }) =>
      getFollowingIds(currentUserId).then((ids) =>
        setFollowing(ids.includes(post.profile.id))
      ).catch(() => setFollowing(false))
    );
  }, [currentUserId, post.profile.id, isOwnPost]);

  async function handleFollow() {
    if (!currentUserId || isOwnPost) return;
    if (following) {
      setFollowing(false);
      await unfollowPlayer(currentUserId, post.profile.id).catch(() => setFollowing(true));
    } else {
      setFollowing(true);
      await followPlayer(currentUserId, post.profile.id).catch(() => setFollowing(false));
    }
  }

  const dateLabel  = post.status
    ? new Date(post.status + "T00:00:00").toLocaleDateString("en-AU", { month: "short", day: "numeric" })
    : null;
  const stakeDeal  = parseStakeDealContent(post.content ?? null);

  // ── Shared author header ──
  const AuthorRow = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 9 }}>
      {post.profile.avatar_url ? (
        <Image source={{ uri: post.profile.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} resizeMode="cover" />
      ) : (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND + "18", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="person" size={16} color={BRAND} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text.primary }}>{authorName}</Text>
        <Text style={{ fontSize: 11, color: colors.text.tertiary }}>{timeAgo(post.created_at)}</Text>
      </View>
      {!isOwnPost && (
        <TouchableOpacity
          onPress={handleFollow}
          style={{
            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
            backgroundColor: following ? colors.bg.secondary : BRAND,
            borderWidth: following ? 1 : 0, borderColor: colors.border.default,
          }}
          activeOpacity={0.75}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: following ? colors.text.secondary : "#fff" }}>
            {following === null ? "Follow" : following ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onToggleSave}
        style={[styles.starBtn, post.saved_by_me && { backgroundColor: "#F59E0B20" }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name={post.saved_by_me ? "star" : "star-outline"} size={17} color={post.saved_by_me ? "#F59E0B" : colors.text.tertiary} />
      </TouchableOpacity>
    </View>
  );

  /* ── Stake deal post ── */
  if (stakeDeal) {
    const sold    = parseInt(stakeDeal.pct) - parseInt(stakeDeal.remaining);
    const soldPct = Math.round((sold / parseInt(stakeDeal.pct)) * 100);
    const canBuy  = !isOwnPost && !!currentUserId && parseInt(stakeDeal.remaining) > 0;
    return (
      <>
        <View style={[styles.communityCard, { backgroundColor: colors.bg.primary, borderColor: "#7C3AED30", flexDirection: "column", padding: 0, overflow: "hidden" }]}>
          {/* Author header */}
          {AuthorRow}
          <View style={[styles.officialDivider, { backgroundColor: colors.border.subtle, marginHorizontal: 12 }]} />

          <View style={{ padding: 12, gap: 10 }}>
            {/* Type label */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="people" size={13} color="#7C3AED" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#7C3AED" }}>Selling Tournament Action</Text>
            </View>

            {/* Tournament name */}
            <Text style={[styles.communityName, { color: colors.text.primary }]}>{post.session_name || "Tournament"}</Text>

            {/* Pills */}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <View style={[styles.officialPill, { backgroundColor: "#7C3AED12" }]}>
                <Text style={[styles.officialPillText, { color: "#7C3AED" }]}>Selling {stakeDeal.pct}%</Text>
              </View>
              <View style={[styles.officialPill, { backgroundColor: parseInt(stakeDeal.remaining) > 0 ? "#22C55E12" : "#EF444412" }]}>
                <Text style={[styles.officialPillText, { color: parseInt(stakeDeal.remaining) > 0 ? "#16A34A" : "#DC2626" }]}>
                  {parseInt(stakeDeal.remaining) > 0 ? `${stakeDeal.remaining}% remaining` : "Sold out"}
                </Text>
              </View>
              {stakeDeal.markup && parseFloat(stakeDeal.markup) !== 1 && (
                <View style={[styles.officialPill, { backgroundColor: "#F9731612" }]}>
                  <Text style={[styles.officialPillText, { color: "#EA580C" }]}>{stakeDeal.markup}× markup</Text>
                </View>
              )}
              {stakeDeal.buyin && (
                <View style={[styles.officialPill, { backgroundColor: colors.bg.secondary }]}>
                  <Text style={[styles.officialPillText, { color: colors.text.secondary }]}>Buy-in: {stakeDeal.buyin}</Text>
                </View>
              )}
              {stakeDeal.price && (
                <View style={[styles.officialPill, { backgroundColor: colors.bg.secondary }]}>
                  <Text style={[styles.officialPillText, { color: colors.text.secondary }]}>{stakeDeal.price}</Text>
                </View>
              )}
            </View>

            {/* Progress bar */}
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: colors.text.tertiary }}>{sold}% claimed</Text>
                <Text style={{ fontSize: 11, color: colors.text.tertiary }}>{stakeDeal.remaining}% available</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bg.secondary, overflow: "hidden" }}>
                <View style={{ width: `${Math.min(soldPct, 100)}%`, height: "100%", backgroundColor: "#7C3AED", borderRadius: 3 }} />
              </View>
            </View>

            {/* Venue + Buy button */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {post.venue ? (
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location-outline" size={11} color={colors.text.tertiary} />
                  <Text style={[styles.communityMeta, { color: colors.text.tertiary, flex: 1 }]} numberOfLines={1}>{post.venue}</Text>
                </View>
              ) : <View style={{ flex: 1 }} />}
              {canBuy && (
                <TouchableOpacity
                  onPress={() => setBuyModal(true)}
                  style={{ backgroundColor: "#7C3AED", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Buy Stakes</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {buyModal && currentUserId && (
          <BuyStakesFromFeedModal
            visible={buyModal}
            onClose={() => setBuyModal(false)}
            authorId={post.profile.id}
            authorName={authorName}
            tournamentName={post.session_name ?? ""}
            remainingPct={parseInt(stakeDeal.remaining)}
            pricePerPct={stakeDeal.price}
            buyerId={currentUserId}
            colors={colors}
          />
        )}
      </>
    );
  }

  /* ── Regular tournament post ── */
  return (
    <View style={[styles.communityCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, flexDirection: "column", padding: 0, overflow: "hidden" }]}>
      {post.image_url ? (
        <Image source={{ uri: post.image_url }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
      ) : null}
      {AuthorRow}
      <View style={[styles.officialDivider, { backgroundColor: colors.border.subtle, marginHorizontal: 12 }]} />
      <View style={{ padding: 12, paddingTop: 10, gap: 4 }}>
        <Text style={[styles.communityName, { color: colors.text.primary }]}>
          {post.session_name || "Tournament"}
        </Text>
        {dateLabel ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="calendar-outline" size={11} color={colors.text.tertiary} />
            <Text style={[styles.communityMeta, { color: colors.text.tertiary }]}>{dateLabel}</Text>
          </View>
        ) : null}
        {post.venue ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="location-outline" size={11} color={colors.text.tertiary} />
            <Text style={[styles.communityMeta, { color: colors.text.tertiary }]}>{post.venue}</Text>
          </View>
        ) : null}
        {post.amount_label ? (
          <Text style={[styles.communityMeta, { color: colors.text.tertiary }]}>Buy-in: {post.amount_label}</Text>
        ) : null}
        {post.save_count > 0 && (
          <Text style={[styles.communityMeta, { color: colors.text.tertiary, marginTop: 2 }]}>{post.save_count} saved</Text>
        )}
      </View>
    </View>
  );
}

// ─── Saved Tournament Card ────────────────────────────────────────────────────

function SavedTournamentCard({ post, colors, onUnsave }: { post: SocialPost; colors: any; onUnsave?: () => void }) {
  const authorName = post.profile.display_name || post.profile.username || "Organiser";
  const dateLabel = post.status
    ? new Date(post.status + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "short", month: "short", day: "numeric",
      })
    : null;
  return (
    <View style={[styles.communityCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, flexDirection: "column", padding: 0, overflow: "hidden" }]}>
      {post.image_url ? (
        <Image source={{ uri: post.image_url }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 10 }}>
        <View style={[styles.communityBadge, { backgroundColor: PURPLE + "15" }]}>
          <Ionicons name="trophy" size={18} color={PURPLE} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.communityName, { color: colors.text.primary }]}>
            {post.session_name || "Tournament"}
          </Text>
          {dateLabel ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="calendar-outline" size={11} color={BRAND} />
              <Text style={[styles.communityMeta, { color: BRAND, fontWeight: "600" }]}>{dateLabel}</Text>
            </View>
          ) : null}
          {post.venue ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="location-outline" size={11} color={colors.text.tertiary} />
              <Text style={[styles.communityMeta, { color: colors.text.tertiary }]}>{post.venue}</Text>
            </View>
          ) : null}
          {post.amount_label ? (
            <Text style={[styles.communityMeta, { color: colors.text.tertiary }]}>Buy-in: {post.amount_label}</Text>
          ) : null}
          <Text style={[styles.communityMeta, { color: colors.text.tertiary, marginTop: 2 }]}>
            By {authorName}
          </Text>
        </View>
        {onUnsave && (
          <TouchableOpacity
            onPress={() => Alert.alert("Remove from schedule?", "This tournament will be removed from your schedule.", [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: onUnsave },
            ])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event, colors, onDelete, onShare, onShareStake, onCalendarSync, onSellStakes, showDate, past,
}: {
  event: TournamentEvent;
  colors: any;
  onDelete: () => void;
  onShare: () => void;
  onShareStake: () => void;
  onCalendarSync: () => void;
  onSellStakes: () => void;
  showDate?: boolean;
  past?: boolean;
}) {
  const [showSheet, setShowSheet] = useState(false);
  const hasImage      = !!event.image_url;
  const hasActiveDeal = !!event.stake_deal_id;

  function handleAction(action: () => void) {
    setShowSheet(false);
    setTimeout(action, 300);
  }

  return (
    <>
      <View style={[
        styles.eventCard,
        { backgroundColor: colors.bg.primary, borderColor: colors.border.default, flexDirection: "column", padding: 0, overflow: "hidden" },
        past && { opacity: 0.55 },
      ]}>
        {hasImage && (
          <Image source={{ uri: event.image_url }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 10 }}>
          <View style={[styles.eventDot, { backgroundColor: past ? colors.text.tertiary : BRAND, marginTop: 6 }]} />

          {/* Main content */}
          <View style={{ flex: 1, gap: 3 }}>
            {showDate && (
              <Text style={[styles.eventDate, { color: colors.text.tertiary }]}>
                {new Date(event.date + "T00:00:00").toLocaleDateString("en-AU", {
                  weekday: "short", month: "short", day: "numeric",
                })}
              </Text>
            )}
            <Text style={[styles.eventName, { color: colors.text.primary }]}>{event.name}</Text>
            {!!event.venue && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="location-outline" size={12} color={colors.text.tertiary} />
                <Text style={[styles.eventMeta, { color: colors.text.tertiary, flex: 1 }]} numberOfLines={1}>{event.venue}</Text>
              </View>
            )}
            {!!event.buyin && (
              <Text style={[styles.eventMeta, { color: colors.text.tertiary }]}>Buy-in: {event.buyin}</Text>
            )}
            {!!event.notes && (
              <Text style={[styles.eventMeta, { color: colors.text.tertiary }]}>{reformat24hInText(event.notes)}</Text>
            )}
          </View>

          {/* Right side: Sell Stakes chip + 3-dots */}
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            {!past && (
              <TouchableOpacity
                onPress={onSellStakes}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 9, paddingVertical: 5,
                  borderRadius: 20, borderWidth: 1,
                  backgroundColor: hasActiveDeal ? "#7C3AED14" : "transparent",
                  borderColor: hasActiveDeal ? "#7C3AED" : "#7C3AED50",
                }}
                activeOpacity={0.7}
              >
                <Ionicons name={hasActiveDeal ? "trending-up-outline" : "people-outline"} size={12} color="#7C3AED" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#7C3AED" }}>
                  {hasActiveDeal ? "Manage Stakes" : "Sell Stakes"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowSheet(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconBtn, { backgroundColor: colors.bg.secondary }]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom sheet */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowSheet(false)} />
        <View style={[styles.sheetContainer, { backgroundColor: colors.bg.primary }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border.default }]} />
          <Text style={[styles.sheetTitle, { color: colors.text.primary }]} numberOfLines={1}>{event.name}</Text>

          {!past && (
            <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(onShare)}>
              <View style={[styles.sheetIcon, { backgroundColor: BRAND + "15" }]}>
                <Ionicons name="share-social-outline" size={18} color={BRAND} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetRowText, { color: colors.text.primary }]}>Share Tournament</Text>
                <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }}>Post to the community feed</Text>
              </View>
            </TouchableOpacity>
          )}

          {!past && hasActiveDeal && (
            <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(onShareStake)}>
              <View style={[styles.sheetIcon, { backgroundColor: "#7C3AED15" }]}>
                <Ionicons name="people-outline" size={18} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetRowText, { color: colors.text.primary }]}>Advertise Stake Deal</Text>
                <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }}>Let the community know you're selling action</Text>
              </View>
            </TouchableOpacity>
          )}

          {!past && (
            <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(onCalendarSync)}>
              <View style={[styles.sheetIcon, { backgroundColor: "#22C55E15" }]}>
                <Ionicons name="calendar-outline" size={18} color="#22C55E" />
              </View>
              <Text style={[styles.sheetRowText, { color: colors.text.primary }]}>Add to Device Calendar</Text>
            </TouchableOpacity>
          )}

          {event.source === "directory" ? (
            <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(onDelete)}>
              <View style={[styles.sheetIcon, { backgroundColor: "#EF444415" }]}>
                <Ionicons name="star-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.sheetRowText, { color: "#EF4444" }]}>Remove from Schedule</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sheetRow} onPress={() => {
              setShowSheet(false);
              setTimeout(() => {
                Alert.alert(
                  "Delete Tournament",
                  `Are you sure you want to delete "${event.name}"? This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: onDelete },
                  ]
                );
              }, 300);
            }}>
              <View style={[styles.sheetIcon, { backgroundColor: "#EF444415" }]}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.sheetRowText, { color: "#EF4444" }]}>Delete Tournament</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.sheetCancel, { borderColor: colors.border.default }]} onPress={() => setShowSheet(false)}>
            <Text style={[styles.sheetCancelText, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ─── Share Tournament Modal ───────────────────────────────────────────────────

function ShareTournamentModal({
  event, userId, colors, insets, onClose,
}: {
  event: TournamentEvent;
  userId: string;
  colors: any;
  insets: any;
  onClose: () => void;
}) {
  const [caption,     setCaption]     = useState("");
  const [posting,     setPosting]     = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);

  const formattedDate = new Date(event.date + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long", month: "long", day: "numeric",
  });

  async function handleShare() {
    if (!userId) { Alert.alert("Not signed in", "Sign in to share to the community."); return; }
    setPosting(true);
    try {
      const content = caption.trim()
        ? caption.trim()
        : `Playing in ${event.name}${event.venue ? ` at ${event.venue}` : ""} on ${formattedDate}!`;
      await createPost({
        user_id: userId,
        session_type: "tournament",
        session_name: event.name,
        venue: event.venue || null,
        amount_label: event.buyin || null,
        content,
        visibility: friendsOnly ? "friends" : "public",
      });
      Alert.alert(
        friendsOnly ? "Shared with followers!" : "Shared to community!",
        friendsOnly ? "Only your followers can see this post." : "Your tournament is now on the community feed.",
      );
      onClose();
    } catch (e: any) {
      Alert.alert("Could not share", e?.message ?? "Please try again.");
    } finally { setPosting(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
            <View style={[styles.sheetModal, { backgroundColor: colors.bg.primary }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border.default }]} />
              <View style={styles.modalTitleRow}>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Share to Community</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <View style={[styles.closeBtn, { backgroundColor: colors.bg.secondary }]}>
                    <Ionicons name="close" size={16} color={colors.text.secondary} />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[styles.shareTournamentCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <View style={[styles.shareTournamentBadge, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
                  <Ionicons name="trophy" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shareTournamentName, { color: colors.text.primary }]}>{event.name}</Text>
                  <Text style={[styles.shareTournamentMeta, { color: colors.text.tertiary }]}>{formattedDate}</Text>
                  {!!event.venue && <Text style={[styles.shareTournamentMeta, { color: colors.text.tertiary }]}>{event.venue}</Text>}
                  {!!event.buyin && <Text style={[styles.shareTournamentMeta, { color: colors.text.tertiary }]}>Buy-in: {event.buyin}</Text>}
                </View>
              </View>

              <TextInput
                style={[styles.input, styles.inputMulti, { backgroundColor: colors.bg.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                placeholder="Add a caption… (optional)"
                placeholderTextColor={colors.text.tertiary}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={300}
                returnKeyType="done"
              />

              <View style={[styles.toggleRow, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="people-outline" size={15} color={friendsOnly ? BRAND : colors.text.secondary} />
                    <Text style={[styles.toggleLabel, { color: colors.text.primary }]}>Followers only</Text>
                  </View>
                  <Text style={[styles.toggleSub, { color: colors.text.tertiary }]}>
                    {friendsOnly ? "Only your followers will see this" : "Visible to everyone on the community feed"}
                  </Text>
                </View>
                <Switch
                  value={friendsOnly}
                  onValueChange={setFriendsOnly}
                  trackColor={{ false: colors.border.default, true: `${BRAND}55` }}
                  thumbColor={friendsOnly ? BRAND : colors.text.tertiary}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: BRAND, marginBottom: insets.bottom + 8 }, posting && { opacity: 0.6 }]}
                onPress={handleShare}
                disabled={posting}
                activeOpacity={0.88}
              >
                <Ionicons name={friendsOnly ? "people" : "earth"} size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>{posting ? "Sharing…" : friendsOnly ? "Post to Followers" : "Share to Community"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerGreeting: { fontSize: 12, fontWeight: "500" },
  headerName: { fontSize: 22, fontWeight: "800", marginTop: 1 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  addHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addHeaderBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  addCustomBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  addCustomBtnText: { fontSize: 12, fontWeight: "600" },

  segmented: {
    flexDirection: "row", borderRadius: 12, padding: 3, gap: 2,
  },
  segmentBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10,
  },
  segmentLabel: { fontSize: 13, fontWeight: "600" },

  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: { fontSize: 16, fontWeight: "700" },
  calCard: {
    marginHorizontal: 16, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 14,
  },
  dayRow: { flexDirection: "row", marginBottom: 6 },
  dayLabel: {
    flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  weekRow: { flexDirection: "row" },
  dayCell: { flex: 1, alignItems: "center", paddingVertical: 7, gap: 3 },
  dayNum: { fontSize: 14, fontWeight: "500" },
  dot: { width: 5, height: 5, borderRadius: 3 },

  addTournamentBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderRadius: 14,
  },
  addTournamentBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  emptyText: { fontSize: 14, marginTop: 4 },

  emptyState: {
    margin: 16, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 36, alignItems: "center", gap: 10,
  },
  emptyStateTitle: { fontSize: 16, fontWeight: "700", marginTop: 6, textAlign: "center" },
  emptyStateSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyAction: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  emptyActionText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  centered: { paddingTop: 60, alignItems: "center" },

  locationBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  locationBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },

  communityCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 10,
  },
  communityBadge: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  communityName: { fontSize: 14, fontWeight: "700" },
  communityMeta: { fontSize: 12, lineHeight: 17 },
  addScheduleBtn: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 4,
  },

  eventCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 10,
  },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  eventDate: {
    fontSize: 11, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2,
  },
  eventName: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  eventMeta: { fontSize: 12, lineHeight: 18 },

  shareTournamentCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 12,
  },
  shareTournamentBadge: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  shareTournamentName: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  shareTournamentMeta: { fontSize: 12, lineHeight: 18 },

  backdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetModal: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: "90%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, marginBottom: 10,
  },
  inputMulti: { height: 80, textAlignVertical: "top" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleSub: { fontSize: 12, lineHeight: 17 },
  saveBtn: {
    flexDirection: "row", borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
    justifyContent: "center", marginTop: 4, gap: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  starBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },

  // BuyStakesFromFeedModal
  bsOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  bsSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 0,
  },
  bsHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  bsTitle:  { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  bsInputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8,
  },
  bsInput: { flex: 1, fontSize: 15, padding: 0 },
  bsBuyBtn: {
    borderRadius: 12, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
    marginTop: 8,
  },

  calLegend: {
    flexDirection: "row", gap: 16,
    marginHorizontal: 16, marginBottom: 14,
  },
  calLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  calLegendText: { fontSize: 11, fontWeight: "500" },

  lockedCalWrap: { marginHorizontal: 16, marginTop: 20, position: "relative" },
  lockedCalOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    borderRadius: 16,
  },
  lockedCalBadge: {
    borderRadius: 16, padding: 20,
    alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOpacity: 0.08,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  lockedCalTitle: { fontSize: 16, fontWeight: "800" },
  lockedCalSub: { fontSize: 12, textAlign: "center", lineHeight: 17, maxWidth: 200 },
  lockedCalBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  lockedCalBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  publishBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginHorizontal: 16, marginBottom: 14,
    borderRadius: 12, paddingVertical: 12,
  },
  publishBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  eliteTeaser: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginBottom: 14,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  eliteTeaserText: { flex: 1, fontSize: 12, lineHeight: 18 },

  // Event card bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetContainer: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 16,
  },
  sheetTitle: { fontSize: 15, fontWeight: "700", marginBottom: 16, paddingHorizontal: 4 },
  sheetRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, borderRadius: 12,
  },
  sheetIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  sheetRowText: { fontSize: 15, fontWeight: "500" },
  sheetCancel: {
    marginTop: 8, paddingVertical: 14, borderRadius: 14,
    alignItems: "center", borderWidth: 1,
  },
  sheetCancelText: { fontSize: 15, fontWeight: "600" },

  // Official tournaments tab
  searchRow: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14 },
  stateChipsScroll: { borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0, flexShrink: 0, height: 46 },
  stateChipsRow: { paddingHorizontal: 16, paddingVertical: 7, alignItems: "center", gap: 8, flexDirection: "row" },
  stateChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  stateChipText: { fontSize: 13, fontWeight: "600" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },

  // Schedule view toggle pill
  calViewToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, alignSelf: "center",
    marginVertical: 10, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  calViewToggleText: { fontSize: 12, fontWeight: "600" },

  // View toggle row
  calSegmentWrap: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calSegmentText: { fontSize: 14, fontWeight: "500" },

  // Calendar grid
  calNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calNavTitle: { fontSize: 15, fontWeight: "700" },
  calDayRow: { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 4 },
  calDayLabel: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "600" },
  calGrid: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4, paddingBottom: 4 },
  calWeekRow: { flexDirection: "row" },
  calCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calCellInner: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  calCellNum: { fontSize: 12 },
  calDot: { width: 3, height: 3, borderRadius: 1.5, marginTop: 1 },
  calNoEvents: { textAlign: "center", marginTop: 24, fontSize: 13 },

  seriesCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1,
    marginHorizontal: 16, padding: 14,
  },
  seriesCardLogo: { width: 56, height: 56, borderRadius: 12 },

  officialCard: {
    borderRadius: 14, borderWidth: 1,
    marginHorizontal: 16, overflow: "hidden",
  },
  officialCardTop: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 10,
  },
  seriesLogo: { width: 44, height: 44, borderRadius: 10 },
  seriesLogoPlaceholder: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  officialSeries: { fontSize: 11, fontWeight: "700", marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: 0.4 },
  officialName: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  officialStarBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  officialDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  officialDetails: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  officialDetailItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  officialDetailText: { fontSize: 13, flex: 1 },
  officialPillsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", paddingHorizontal: 14, paddingBottom: 12 },
  officialPill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  officialPillText: { fontSize: 11, fontWeight: "600" },
});

// Settings modal styles
const stStyles = StyleSheet.create({
  page: { flex: 1 },
  navHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, alignItems: "flex-start" },
  navTitle: { fontSize: 17, fontWeight: "700" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  settingCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
  },
  settingIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  settingLabel: { fontSize: 14, fontWeight: "600" },
  settingSub: { fontSize: 12, lineHeight: 17 },
  proBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  proBadgeText: { fontSize: 10, fontWeight: "800" },
  connectedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  connectedText: { fontSize: 12, fontWeight: "700" },
  enableBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  enableBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  upgradeBanner: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 24,
  },
  upgradeIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  upgradeTitle: { fontSize: 15, fontWeight: "700" },
  upgradeSub: { fontSize: 12 },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center",
    gap: 12, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 18,
    marginTop: 24, marginBottom: 8,
  },
  upgradeBtnText: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700" },
  proBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 24,
  },
  proBannerText: { fontSize: 14, fontWeight: "600", flex: 1 },
});

// Add tournament modal styles
const addStyles = StyleSheet.create({
  page: { flex: 1 },
  navHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, alignItems: "flex-start" },
  navTitle: { fontSize: 17, fontWeight: "700" },
  navSub: { fontSize: 12, marginTop: 1 },
  saveHeaderBtn: { width: 50, alignItems: "flex-end" },
  saveHeaderBtnText: { fontSize: 16, fontWeight: "700" },
  imagePicker: {
    marginHorizontal: 16,
    marginTop: 16,
    height: 180,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: "100%" },
  imageRemoveBtn: {
    position: "absolute", top: 10, right: 10,
  },
  imagePickerPlaceholder: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 6,
  },
  imagePickerIcon: {
    width: 56, height: 56, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  imagePickerLabel: { fontSize: 14, fontWeight: "600" },
  imagePickerSub: { fontSize: 12 },
  imageHint: { fontSize: 11, textAlign: "center", marginTop: 6, marginHorizontal: 16 },
  fieldWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1, overflow: "hidden",
  },
  fieldWrapMulti: { alignItems: "flex-start" },
  fieldIcon: {
    width: 44, alignItems: "center", justifyContent: "center", paddingVertical: 14,
  },
  fieldInput: {
    flex: 1, fontSize: 15, paddingVertical: 14, paddingRight: 14,
  },
  fieldInputMulti: { height: 90, textAlignVertical: "top" },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  infoBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginHorizontal: 16, marginTop: 20,
    borderRadius: 14, paddingVertical: 16,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Inline calendar picker
  calendarSection: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  pickedDateLabel: { fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  calMonthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
  },
  calMonthLabel: { fontSize: 14, fontWeight: "700" },
  calDayRow:  { flexDirection: "row", marginBottom: 4 },
  calDayLabel: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600" },
  calWeekRow: { flexDirection: "row" },
  calDayCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calDayNum:  { fontSize: 13 },
});

// Publish tournament modal styles
const pubStyles = StyleSheet.create({
  page: { flex: 1 },
  navHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navSide: { width: 72 },
  navTitle: { fontSize: 17, fontWeight: "700" },
  navCancel: { fontSize: 16 },
  navPublish: { fontSize: 16, fontWeight: "700" },
  eliteBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 3,
  },
  eliteBadgeText: { fontSize: 10, fontWeight: "800" },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 4,
  },
  infoBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 4,
  },
  fieldWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1, overflow: "hidden",
  },
  fieldWrapMulti: { alignItems: "flex-start" },
  fieldIcon: {
    width: 44, alignItems: "center", justifyContent: "center", paddingVertical: 14,
  },
  fieldInput: {
    flex: 1, fontSize: 15, paddingVertical: 14, paddingRight: 14,
  },
  fieldInputMulti: { height: 100, textAlignVertical: "top" },
  fieldError: { fontSize: 12, color: "#EF4444", marginTop: -6, marginLeft: 4 },
  entryCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 2,
  },
  addEntryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 14,
  },
  publishBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  publishBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
