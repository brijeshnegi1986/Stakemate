import { PaywallModal } from "@/components/PaywallModal";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import {
  addTournamentEvent,
  deleteTournamentEvent,
  getTournamentEvents,
  TournamentEvent,
} from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import {
  createPost,
  fetchSavedTournamentPosts,
  fetchTournamentFeed,
  publishTournament,
  PublishTournamentInput,
  saveTournamentPost,
  SocialPost,
  unsaveTournamentPost,
} from "@/lib/social";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
    const permResult = await (Calendar as any).requestCalendarPermissionsAsync?.();
    if (permResult?.status !== "granted") return false;

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    let calendarId: string | undefined;

    if (Platform.OS === "ios") {
      const defaultCal = calendars.find((c) => c.allowsModifications && c.type === "local");
      calendarId = defaultCal?.id;
    } else {
      const primary = calendars.find((c) => c.isPrimary && c.allowsModifications);
      calendarId = primary?.id ?? calendars.find((c) => c.allowsModifications)?.id;
    }
    if (!calendarId) return false;

    const start = new Date(event.date + "T09:00:00");
    const end   = new Date(event.date + "T18:00:00");

    await Calendar.createEventAsync(calendarId, {
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
  const [showSettings, setShowSettings]         = useState(false);
  const [showPaywall, setShowPaywall]           = useState(false);
  const [showPublish, setShowPublish]           = useState(false);
  const [communityTournaments, setCommunityTournaments] = useState<SocialPost[]>([]);
  const [savedTournaments, setSavedTournaments] = useState<SocialPost[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [loadingSaved, setLoadingSaved]         = useState(false);
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
          const r = await (Calendar as any).getCalendarPermissionsAsync?.();
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

  async function handleSave() {
    if (!form.name.trim()) return;
    const date = selectedDate ?? todayYMD;
    const saved = addTournamentEvent({
      name:  form.name.trim(),
      date,
      venue: form.venue.trim(),
      buyin: form.buyin.trim(),
      notes: form.notes.trim(),
    });

    refresh();
    setShowAddModal(false);

    const savedEvent: TournamentEvent = {
      id: saved, date, created_at: Date.now(),
      name: form.name.trim(), venue: form.venue.trim(),
      buyin: form.buyin.trim(), notes: form.notes.trim(),
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setFormImage(result.assets[0].uri);
    }
  }

  function handleDelete(id: number) {
    Alert.alert("Delete Event", "Remove this tournament from your calendar?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteTournamentEvent(id); refresh(); } },
    ]);
  }

  async function handleRequestCalAccess() {
    try {
      const r = await (Calendar as any).requestCalendarPermissionsAsync?.();
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
            {/* Add personal tournament — Pro/Elite only */}
            {isPro && (
              <TouchableOpacity
                onPress={() => openAddModal(selectedDate ?? todayYMD)}
                style={[styles.addHeaderBtn, { backgroundColor: BRAND }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addHeaderBtnText}>Add</Text>
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
        <View style={[styles.segmented, { backgroundColor: colors.bg.secondary }]}>
          {(["schedule", "tournaments"] as CalTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setCalTab(t)}
              style={[
                styles.segmentBtn,
                calTab === t && {
                  backgroundColor: colors.bg.primary,
                  shadowColor: "#000", shadowOpacity: 0.08,
                  shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
                },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={t === "schedule"
                  ? (calTab === t ? "calendar" : "calendar-outline")
                  : (calTab === t ? "trophy" : "trophy-outline")}
                size={14}
                color={calTab === t ? colors.text.primary : colors.text.tertiary}
              />
              <Text style={[styles.segmentLabel, { color: calTab === t ? colors.text.primary : colors.text.tertiary }]}>
                {t === "schedule" ? "My Schedule" : "Tournaments"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── My Schedule tab ── */}
      {calTab === "schedule" && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── FREE tier: upcoming saved list + locked calendar teaser ── */}
          {!isPro && (
            <>
              {/* Saved upcoming tournaments */}
              {loadingSaved ? (
                <View style={styles.centered}><ActivityIndicator color={BRAND} /></View>
              ) : savedTournaments.length === 0 ? (
                <View style={[styles.emptyState, { borderColor: colors.border.default }]}>
                  <Ionicons name="star-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No saved tournaments</Text>
                  <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                    Browse the Tournaments tab and tap ⭐ to save events to your schedule.
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
              ) : (
                <>
                  {/* Today section */}
                  {savedTournaments.filter((p) => p.status === todayYMD).length > 0 && (
                    <View style={styles.section}>
                      <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Today</Text>
                      {savedTournaments.filter((p) => p.status === todayYMD).map((post) => (
                        <SavedTournamentCard key={post.id} post={post} colors={colors} onUnsave={() => handleToggleSave(post)} />
                      ))}
                    </View>
                  )}

                  {/* Upcoming section */}
                  {savedTournaments.filter((p) => (p.status ?? "") > todayYMD).length > 0 && (
                    <View style={styles.section}>
                      <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Upcoming</Text>
                      {savedTournaments
                        .filter((p) => (p.status ?? "") > todayYMD)
                        .map((post) => (
                          <SavedTournamentCard key={post.id} post={post} colors={colors} onUnsave={() => handleToggleSave(post)} />
                        ))}
                    </View>
                  )}
                </>
              )}

              {/* Locked calendar teaser */}
              <View style={styles.lockedCalWrap}>
                <View style={[styles.calCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, opacity: 0.35 }]} pointerEvents="none">
                  <View style={styles.dayRow}>
                    {DAYS.map((d) => (
                      <Text key={d} style={[styles.dayLabel, { color: colors.text.tertiary }]}>{d}</Text>
                    ))}
                  </View>
                  {Array.from({ length: cells.length / 7 }, (_, w) => (
                    <View key={w} style={styles.weekRow}>
                      {cells.slice(w * 7, w * 7 + 7).map((day, i) => (
                        <View key={i} style={styles.dayCell}>
                          {day ? <Text style={[styles.dayNum, { color: colors.text.primary }]}>{day}</Text> : null}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
                <View style={styles.lockedCalOverlay}>
                  <View style={[styles.lockedCalBadge, { backgroundColor: colors.bg.primary }]}>
                    <Ionicons name="lock-closed" size={20} color={PURPLE} />
                    <Text style={[styles.lockedCalTitle, { color: colors.text.primary }]}>Full Calendar</Text>
                    <Text style={[styles.lockedCalSub, { color: colors.text.tertiary }]}>
                      Add personal tournaments & navigate months
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowPaywall(true)}
                      style={[styles.lockedCalBtn, { backgroundColor: PURPLE }]}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trophy-outline" size={14} color="#fff" />
                      <Text style={styles.lockedCalBtnText}>Upgrade to Pro</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ── PRO / ELITE tier: full calendar + all events ── */}
          {isPro && (
            <>
              {/* Month navigator */}
              <View style={[styles.monthNav, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[styles.monthLabel, { color: colors.text.primary }]}>
                  {MONTHS[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="chevron-forward" size={20} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Calendar grid */}
              <View style={[styles.calCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                <View style={styles.dayRow}>
                  {DAYS.map((d) => (
                    <Text key={d} style={[styles.dayLabel, { color: colors.text.tertiary }]}>{d}</Text>
                  ))}
                </View>
                {Array.from({ length: cells.length / 7 }, (_, w) => (
                  <View key={w} style={styles.weekRow}>
                    {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
                      if (!day) return <View key={i} style={styles.dayCell} />;
                      const ymd        = toYMD(viewYear, viewMonth, day);
                      const isToday    = ymd === todayYMD;
                      const isSelected = ymd === selectedDate;
                      const hasPersonal = eventDates.has(ymd);
                      const hasSaved    = savedEventDates.has(ymd);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.dayCell, isSelected && { backgroundColor: BRAND, borderRadius: 8 }]}
                          onPress={() => handleDayPress(day)}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.dayNum,
                            { color: isSelected ? "#fff" : isToday ? BRAND : colors.text.primary },
                            isToday && !isSelected && { fontWeight: "700" },
                          ]}>
                            {day}
                          </Text>
                          <View style={{ flexDirection: "row", gap: 3 }}>
                            {hasPersonal && <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : BRAND }]} />}
                            {hasSaved    && <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : "#F59E0B" }]} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Legend */}
              <View style={[styles.calLegend]}>
                <View style={styles.calLegendItem}>
                  <View style={[styles.dot, { backgroundColor: BRAND }]} />
                  <Text style={[styles.calLegendText, { color: colors.text.tertiary }]}>Personal</Text>
                </View>
                <View style={styles.calLegendItem}>
                  <View style={[styles.dot, { backgroundColor: "#F59E0B" }]} />
                  <Text style={[styles.calLegendText, { color: colors.text.tertiary }]}>Saved</Text>
                </View>
              </View>

              {/* Selected date events */}
              {selectedDate && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", {
                      weekday: "long", month: "long", day: "numeric",
                    })}
                  </Text>
                  {selectedEvents.length === 0 && selectedSavedPosts.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>No tournaments on this day.</Text>
                  ) : (
                    <>
                      {selectedEvents.map((e) => (
                        <EventCard key={e.id} event={e} colors={colors}
                          onDelete={() => handleDelete(e.id)}
                          onShare={() => setShareEvent(e)}
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

              {/* Upcoming personal */}
              {allUpcoming.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Upcoming</Text>
                  {allUpcoming.map((e) => (
                    <EventCard key={e.id} event={e} colors={colors} showDate
                      onDelete={() => handleDelete(e.id)}
                      onShare={() => setShareEvent(e)}
                      onCalendarSync={() => addToDeviceCalendar(e).then((ok) => Alert.alert(ok ? "Added!" : "Error", ok ? "Added to your device calendar." : "Could not add to calendar."))}
                    />
                  ))}
                </View>
              )}

              {/* Upcoming saved community */}
              {savedTournaments.filter((p) => (p.status ?? "") >= todayYMD).length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Saved Tournaments</Text>
                  {savedTournaments
                    .filter((p) => (p.status ?? "") >= todayYMD)
                    .map((p) => <SavedTournamentCard key={p.id} post={p} colors={colors} onUnsave={() => handleToggleSave(p)} />)}
                </View>
              )}

              {/* Past personal */}
              {!hidePastEvents && pastEvents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Past</Text>
                  {pastEvents.map((e) => (
                    <EventCard key={e.id} event={e} colors={colors} past showDate
                      onDelete={() => handleDelete(e.id)}
                      onShare={() => setShareEvent(e)}
                      onCalendarSync={() => {}}
                    />
                  ))}
                </View>
              )}

              {events.length === 0 && savedTournaments.length === 0 && !selectedDate && (
                <View style={[styles.emptyState, { borderColor: colors.border.default }]}>
                  <Ionicons name="calendar-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments scheduled</Text>
                  <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                    Tap a date and "Add" to schedule a personal tournament, or browse the Tournaments tab.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Tournaments tab ── */}
      {calTab === "tournaments" && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Elite: Publish button */}
          {isElite && (
            <TouchableOpacity
              onPress={() => setShowPublish(true)}
              activeOpacity={0.88}
              style={[styles.publishBtn, { backgroundColor: PURPLE }]}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.publishBtnText}>Publish a Tournament</Text>
            </TouchableOpacity>
          )}

          {/* Non-Elite: teaser to publish */}
          {!isElite && (
            <TouchableOpacity
              onPress={() => setShowPaywall(true)}
              activeOpacity={0.85}
              style={[styles.eliteTeaser, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "30" }]}
            >
              <Ionicons name="trophy" size={16} color={PURPLE} />
              <Text style={[styles.eliteTeaserText, { color: colors.text.secondary }]}>
                <Text style={{ fontWeight: "700", color: PURPLE }}>Elite organisers</Text> publish tournaments here for the community to discover.
              </Text>
              <Ionicons name="chevron-forward" size={14} color={PURPLE} />
            </TouchableOpacity>
          )}

          {loadingTournaments ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={BRAND} />
            </View>
          ) : communityTournaments.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border.default }]}>
              <Ionicons name="trophy-outline" size={44} color={colors.text.tertiary} />
              <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments yet</Text>
              <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                Elite organisers publish tournaments here. Upgrade to Elite to be the first.
              </Text>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 12 }]}>
                {communityTournaments.length} tournament{communityTournaments.length !== 1 ? "s" : ""} available
              </Text>
              {communityTournaments.map((post) => (
                <CommunityTournamentCard
                  key={post.id}
                  post={post}
                  colors={colors}
                  onToggleSave={() => handleToggleSave(post)}
                />
              ))}
            </View>
          )}
        </ScrollView>
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
        selectedDate={selectedDate}
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
          onPublished={(post: SocialPost) => {
            setCommunityTournaments((prev) => [post, ...prev]);
            setShowPublish(false);
          }}
          insets={insets}
          colors={colors}
        />
      )}
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

          {/* ── Section: Sync ── */}
          <Text style={[stStyles.sectionLabel, { color: colors.text.tertiary }]}>SYNC</Text>

          <TouchableOpacity
            onPress={isPro ? undefined : onOpenPaywall}
            activeOpacity={isPro ? 1 : 0.75}
          >
            <View style={[stStyles.settingCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
              <View style={[stStyles.settingIconWrap, { backgroundColor: BRAND + "15" }]}>
                <Ionicons name="sync" size={18} color={BRAND} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[stStyles.settingLabel, { color: colors.text.primary }]}>Sync with Device Calendar</Text>
                  {!isPro && (
                    <View style={[stStyles.proBadge, { backgroundColor: PURPLE + "18" }]}>
                      <Ionicons name="lock-closed" size={10} color={PURPLE} />
                      <Text style={[stStyles.proBadgeText, { color: PURPLE }]}>PRO</Text>
                    </View>
                  )}
                </View>
                <Text style={[stStyles.settingSub, { color: colors.text.tertiary }]}>
                  {isPro
                    ? "Automatically sync all scheduled tournaments to your phone's calendar"
                    : "Upgrade to Pro to enable automatic calendar sync"}
                </Text>
              </View>
              {isPro
                ? <Switch value={false} trackColor={{ false: colors.border.default, true: `${BRAND}55` }} thumbColor={BRAND} />
                : <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
              }
            </View>
          </TouchableOpacity>

          {/* ── Section: Device Calendar ── */}
          <Text style={[stStyles.sectionLabel, { color: colors.text.tertiary, marginTop: 24 }]}>DEVICE CALENDAR</Text>

          <View style={[stStyles.settingCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <View style={[stStyles.settingIconWrap, { backgroundColor: "#22C55E15" }]}>
              <Ionicons name="calendar" size={18} color="#22C55E" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[stStyles.settingLabel, { color: colors.text.primary }]}>Calendar Access</Text>
              <Text style={[stStyles.settingSub, { color: colors.text.tertiary }]}>
                {calAccessGranted === true
                  ? "Connected — Stakemate can read/write your calendar"
                  : calAccessGranted === false
                    ? "Not granted — tap to request access"
                    : "Checking permission…"}
              </Text>
            </View>
            {calAccessGranted ? (
              <View style={[stStyles.connectedBadge, { backgroundColor: "#22C55E18" }]}>
                <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                <Text style={[stStyles.connectedText, { color: "#22C55E" }]}>Connected</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onRequestCalAccess}
                style={[stStyles.enableBtn, { backgroundColor: BRAND }]}
              >
                <Text style={stStyles.enableBtnText}>Enable</Text>
              </TouchableOpacity>
            )}
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
  visible, onClose, selectedDate, todayYMD, form, setForm,
  formImage, onPickImage, onRemoveImage, onSave, insets, colors,
}: {
  visible: boolean;
  onClose: () => void;
  selectedDate: string | null;
  todayYMD: string;
  form: { name: string; venue: string; buyin: string; notes: string };
  setForm: (f: any) => void;
  formImage: string | null;
  onPickImage: () => void;
  onRemoveImage: () => void;
  onSave: () => void;
  insets: any;
  colors: any;
}) {
  const dateLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })
    : new Date(todayYMD + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[addStyles.page, { backgroundColor: colors.bg.secondary }]}>

        {/* Nav header */}
        <View style={[addStyles.navHeader, { paddingTop: 16, backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={addStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[addStyles.navTitle, { color: colors.text.primary }]}>Add Tournament</Text>
            <Text style={[addStyles.navSub, { color: colors.text.tertiary }]}>{dateLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={onSave}
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
                    <Text style={[addStyles.imagePickerSub, { color: colors.text.tertiary }]}>Optional</Text>
                  </View>
                )}
              </TouchableOpacity>

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
                    blurOnSubmit
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
                onPress={onSave}
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

type ScannedTournament = {
  name: string;
  date: string;
  venue: string | null;
  buyIn: string | null;
  series: string | null;
  description: string | null;
  selected: boolean;
};

function PublishTournamentModal({
  visible, onClose, userId, onPublished, insets, colors,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onPublished: (post: SocialPost) => void;
  insets: any;
  colors: any;
}) {
  // manual form
  const [name,        setName]        = useState("");
  const [date,        setDate]        = useState("");
  const [venue,       setVenue]       = useState("");
  const [buyIn,       setBuyIn]       = useState("");
  const [series,      setSeries]      = useState("");
  const [description, setDescription] = useState("");
  const [posting,     setPosting]     = useState(false);
  const [dateError,   setDateError]   = useState("");

  // scan flow
  const [mode,             setMode]             = useState<"manual" | "scan">("manual");
  const [scanning,         setScanning]         = useState(false);
  const [scannedList,      setScannedList]      = useState<ScannedTournament[]>([]);
  const [publishingBulk,   setPublishingBulk]   = useState(false);
  const [bulkDone,         setBulkDone]         = useState(0);

  function reset() {
    setName(""); setDate(""); setVenue(""); setBuyIn("");
    setSeries(""); setDescription(""); setPosting(false); setDateError("");
    setMode("manual"); setScanning(false); setScannedList([]);
    setPublishingBulk(false); setBulkDone(0);
  }

  function handleClose() { reset(); onClose(); }

  function validateDate(raw: string): string | null {
    const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,"0")}-${ddmm[1].padStart(2,"0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
  }

  // ── Manual publish ──────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!name.trim()) return;
    const isoDate = validateDate(date.trim());
    if (!isoDate) { setDateError("Enter date as DD/MM/YYYY"); return; }
    setDateError("");
    setPosting(true);
    try {
      const post = await publishTournament({
        userId, name: name.trim(), date: isoDate,
        venue: venue.trim() || null, buyIn: buyIn.trim() || null,
        series: series.trim() || null, description: description.trim() || null,
      });
      reset();
      onPublished(post);
    } catch (e: any) {
      Alert.alert("Could not publish", e?.message ?? "Please try again.");
    } finally { setPosting(false); }
  }

  // ── Scan brochure ───────────────────────────────────────────────────────────
  async function handleScanBrochure() {
    Alert.alert("Upload Brochure", "Choose a format to scan", [
      { text: "Photo / Image", onPress: () => pickImage() },
      { text: "PDF Document",  onPress: () => pickPDF() },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to scan a brochure.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert("Error", "Could not read image data."); return; }
    const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
    const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    await runScan(asset.base64, mediaType);
  }

  async function pickPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      // Read file as base64
      const { readAsStringAsync, EncodingType } = await import("expo-file-system");
      const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
      if (!base64) { Alert.alert("Error", "Could not read PDF data."); return; }
      await runScan(base64, "application/pdf");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not open PDF picker.");
    }
  }

  async function runScan(base64: string, mediaType: string) {
    setMode("scan");
    setScanning(true);
    setScannedList([]);
    try {
      const { BACKEND_URL } = await import("@/constants/config");
      const res = await fetch(`${BACKEND_URL}/api/scan-brochure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch {
        throw new Error("Server returned an unexpected response. Please try again.");
      }
      if (!res.ok) throw new Error(json.error ?? "Scan failed");
      const list: ScannedTournament[] = (json.tournaments ?? []).map((t: any) => ({
        name:        t.name        ?? "Tournament",
        date:        t.date        ?? "",
        venue:       t.venue       ?? null,
        buyIn:       t.buyIn       ?? null,
        series:      t.series      ?? null,
        description: t.description ?? null,
        selected:    true,
      }));
      if (list.length === 0) {
        Alert.alert("No tournaments found", "Couldn't detect any tournaments. Try a clearer photo or a different page of the PDF.");
        setMode("manual");
      } else {
        setScannedList(list);
      }
    } catch (e: any) {
      Alert.alert("Scan failed", e?.message ?? "Please try again.");
      setMode("manual");
    } finally { setScanning(false); }
  }

  // ── Bulk publish scanned results ────────────────────────────────────────────
  async function handlePublishAll() {
    const toPublish = scannedList.filter((t) => t.selected && t.date);
    if (toPublish.length === 0) { Alert.alert("Nothing selected", "Select at least one tournament."); return; }
    setPublishingBulk(true);
    setBulkDone(0);
    let lastPost: SocialPost | null = null;
    for (const t of toPublish) {
      try {
        lastPost = await publishTournament({
          userId, name: t.name, date: t.date,
          venue: t.venue, buyIn: t.buyIn,
          series: t.series, description: t.description,
        });
        setBulkDone((n) => n + 1);
      } catch { /* skip failed ones silently */ }
    }
    setPublishingBulk(false);
    if (lastPost) onPublished(lastPost);
    reset();
    Alert.alert("Published!", `${toPublish.length} tournament${toPublish.length !== 1 ? "s" : ""} added to the community calendar.`);
  }

  const canPublish = name.trim().length > 0 && date.trim().length > 0 && !posting;
  const selectedCount = scannedList.filter((t) => t.selected).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[pubStyles.page, { backgroundColor: colors.bg.secondary }]}>

        {/* Nav header */}
        <View style={[pubStyles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={handleClose} style={pubStyles.navSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[pubStyles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[pubStyles.navTitle, { color: colors.text.primary }]}>Publish Tournament</Text>
            <View style={[pubStyles.eliteBadge, { backgroundColor: PURPLE + "18" }]}>
              <Ionicons name="trophy" size={10} color={PURPLE} />
              <Text style={[pubStyles.eliteBadgeText, { color: PURPLE }]}>ELITE</Text>
            </View>
          </View>
          {mode === "manual" ? (
            <TouchableOpacity
              onPress={handlePublish}
              disabled={!canPublish}
              style={[pubStyles.navSide, { alignItems: "flex-end" }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[pubStyles.navPublish, { color: canPublish ? PURPLE : colors.text.tertiary }]}>
                {posting ? "Saving…" : "Publish"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => { setMode("manual"); setScannedList([]); }}
              style={[pubStyles.navSide, { alignItems: "flex-end" }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[pubStyles.navPublish, { color: colors.text.secondary }]}>Manual</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── SCAN MODE ── */}
        {mode === "scan" && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {scanning ? (
              <View style={pubStyles.scanLoadingWrap}>
                <ActivityIndicator size="large" color={PURPLE} />
                <Text style={[pubStyles.scanLoadingTitle, { color: colors.text.primary }]}>Scanning brochure…</Text>
                <Text style={[pubStyles.scanLoadingSub, { color: colors.text.tertiary }]}>
                  Claude is reading your image and extracting tournament details
                </Text>
              </View>
            ) : (
              <>
                {/* Results header */}
                <View style={pubStyles.scanResultsHeader}>
                  <View style={[pubStyles.scanResultsBadge, { backgroundColor: PURPLE + "15" }]}>
                    <Ionicons name="sparkles" size={14} color={PURPLE} />
                    <Text style={[pubStyles.scanResultsCount, { color: PURPLE }]}>
                      {scannedList.length} tournament{scannedList.length !== 1 ? "s" : ""} found
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleScanBrochure} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[pubStyles.scanAgainText, { color: BRAND }]}>Scan another</Text>
                  </TouchableOpacity>
                </View>

                {/* Scanned tournament rows */}
                {scannedList.map((t, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setScannedList((prev) =>
                      prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item)
                    )}
                    activeOpacity={0.8}
                    style={[
                      pubStyles.scannedRow,
                      {
                        backgroundColor: colors.bg.primary,
                        borderColor: t.selected ? PURPLE : colors.border.default,
                      },
                    ]}
                  >
                    <View style={[
                      pubStyles.scannedCheck,
                      { backgroundColor: t.selected ? PURPLE : colors.bg.secondary, borderColor: t.selected ? PURPLE : colors.border.default },
                    ]}>
                      {t.selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[pubStyles.scannedName, { color: colors.text.primary }]}>{t.name}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {t.date ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Ionicons name="calendar-outline" size={11} color={BRAND} />
                            <Text style={[pubStyles.scannedMeta, { color: BRAND }]}>
                              {new Date(t.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </Text>
                          </View>
                        ) : null}
                        {t.venue ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Ionicons name="location-outline" size={11} color={colors.text.tertiary} />
                            <Text style={[pubStyles.scannedMeta, { color: colors.text.tertiary }]}>{t.venue}</Text>
                          </View>
                        ) : null}
                        {t.buyIn ? (
                          <Text style={[pubStyles.scannedMeta, { color: colors.text.tertiary }]}>Buy-in: {t.buyIn}</Text>
                        ) : null}
                      </View>
                      {t.description ? (
                        <Text style={[pubStyles.scannedDesc, { color: colors.text.tertiary }]} numberOfLines={2}>{t.description}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Publish all */}
                <TouchableOpacity
                  style={[pubStyles.publishBtn, { backgroundColor: PURPLE, opacity: selectedCount > 0 && !publishingBulk ? 1 : 0.45 }]}
                  onPress={handlePublishAll}
                  disabled={selectedCount === 0 || publishingBulk}
                  activeOpacity={0.88}
                >
                  <Ionicons name="earth-outline" size={18} color="#fff" />
                  <Text style={pubStyles.publishBtnText}>
                    {publishingBulk
                      ? `Publishing ${bulkDone}/${selectedCount}…`
                      : `Publish ${selectedCount} Tournament${selectedCount !== 1 ? "s" : ""}`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {/* ── MANUAL MODE ── */}
        {mode === "manual" && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
              >
                {/* Scan brochure CTA */}
                <TouchableOpacity
                  onPress={handleScanBrochure}
                  activeOpacity={0.88}
                  style={[pubStyles.scanCta, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "30" }]}
                >
                  <View style={[pubStyles.scanCtaIcon, { backgroundColor: PURPLE + "20" }]}>
                    <Ionicons name="sparkles" size={20} color={PURPLE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pubStyles.scanCtaTitle, { color: colors.text.primary }]}>Scan a Brochure</Text>
                    <Text style={[pubStyles.scanCtaSub, { color: colors.text.tertiary }]}>
                      Upload a tournament schedule image — AI extracts all dates automatically
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={PURPLE} />
                </TouchableOpacity>

                <View style={pubStyles.dividerRow}>
                  <View style={[pubStyles.dividerLine, { backgroundColor: colors.border.default }]} />
                  <Text style={[pubStyles.dividerText, { color: colors.text.tertiary }]}>or add manually</Text>
                  <View style={[pubStyles.dividerLine, { backgroundColor: colors.border.default }]} />
                </View>

                {/* Info banner */}
                <View style={[pubStyles.infoBanner, { backgroundColor: PURPLE + "10", borderColor: PURPLE + "25" }]}>
                  <Ionicons name="earth-outline" size={15} color={PURPLE} />
                  <Text style={[pubStyles.infoBannerText, { color: colors.text.secondary }]}>
                    This tournament will be visible to all Stakemate users in the community calendar.
                  </Text>
                </View>

                <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary }]}>REQUIRED</Text>

                <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={pubStyles.fieldIcon}>
                    <Ionicons name="trophy-outline" size={16} color={PURPLE} />
                  </View>
                  <TextInput
                    style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Tournament name *"
                    placeholderTextColor={colors.text.tertiary}
                    value={name}
                    onChangeText={setName}
                    returnKeyType="next"
                  />
                </View>

                <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: dateError ? "#EF4444" : colors.border.default }]}>
                  <View style={pubStyles.fieldIcon}>
                    <Ionicons name="calendar-outline" size={16} color={dateError ? "#EF4444" : colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Date (DD/MM/YYYY) *"
                    placeholderTextColor={colors.text.tertiary}
                    value={date}
                    onChangeText={(t) => { setDate(t); if (dateError) setDateError(""); }}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="next"
                  />
                </View>
                {dateError ? <Text style={pubStyles.fieldError}>{dateError}</Text> : null}

                <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary, marginTop: 6 }]}>OPTIONAL</Text>

                <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={pubStyles.fieldIcon}>
                    <Ionicons name="location-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Venue / Casino"
                    placeholderTextColor={colors.text.tertiary}
                    value={venue}
                    onChangeText={setVenue}
                    returnKeyType="next"
                  />
                </View>

                <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={pubStyles.fieldIcon}>
                    <Ionicons name="cash-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Buy-in (e.g. $550)"
                    placeholderTextColor={colors.text.tertiary}
                    value={buyIn}
                    onChangeText={setBuyIn}
                    returnKeyType="next"
                  />
                </View>

                <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={pubStyles.fieldIcon}>
                    <Ionicons name="layers-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Series name (e.g. WSOP Circuit)"
                    placeholderTextColor={colors.text.tertiary}
                    value={series}
                    onChangeText={setSeries}
                    returnKeyType="next"
                  />
                </View>

                <View style={[pubStyles.fieldWrap, pubStyles.fieldWrapMulti, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={[pubStyles.fieldIcon, { paddingTop: 14 }]}>
                    <Ionicons name="document-text-outline" size={16} color={colors.text.tertiary} />
                  </View>
                  <TextInput
                    style={[pubStyles.fieldInput, pubStyles.fieldInputMulti, { color: colors.text.primary }]}
                    placeholder="Description, structure, guarantee…"
                    placeholderTextColor={colors.text.tertiary}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    returnKeyType="done"
                  />
                </View>

                <TouchableOpacity
                  style={[pubStyles.publishBtn, { backgroundColor: PURPLE, opacity: canPublish ? 1 : 0.45 }]}
                  onPress={handlePublish}
                  disabled={!canPublish}
                  activeOpacity={0.88}
                >
                  <Ionicons name="earth-outline" size={18} color="#fff" />
                  <Text style={pubStyles.publishBtnText}>
                    {posting ? "Publishing…" : "Publish to Community"}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

// ─── Community Tournament Card ────────────────────────────────────────────────

function CommunityTournamentCard({
  post, colors, onToggleSave,
}: {
  post: SocialPost;
  colors: any;
  onToggleSave: () => void;
}) {
  const authorName = post.profile.display_name || post.profile.username || "Player";
  const dateLabel = post.status
    ? new Date(post.status + "T00:00:00").toLocaleDateString("en-AU", { month: "short", day: "numeric" })
    : null;
  return (
    <View style={[styles.communityCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={[styles.communityBadge, { backgroundColor: "#7C3AED15" }]}>
        <Ionicons name="trophy" size={18} color="#7C3AED" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <Ionicons name="person-outline" size={11} color={colors.text.tertiary} />
          <Text style={[styles.communityMeta, { color: colors.text.tertiary }]}>
            By {authorName} · {timeAgo(post.created_at)}
          </Text>
        </View>
      </View>
      <View style={{ gap: 8, alignItems: "center" }}>
        {/* Star/save button */}
        <TouchableOpacity
          onPress={onToggleSave}
          style={[styles.starBtn, post.saved_by_me && { backgroundColor: "#F59E0B20" }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name={post.saved_by_me ? "star" : "star-outline"} size={18} color={post.saved_by_me ? "#F59E0B" : colors.text.tertiary} />
        </TouchableOpacity>
        {post.save_count > 0 && (
          <Text style={[styles.communityMeta, { color: colors.text.tertiary, fontSize: 10 }]}>{post.save_count}</Text>
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
    <View style={[styles.communityCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
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
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event, colors, onDelete, onShare, onCalendarSync, showDate, past,
}: {
  event: TournamentEvent;
  colors: any;
  onDelete: () => void;
  onShare: () => void;
  onCalendarSync: () => void;
  showDate?: boolean;
  past?: boolean;
}) {
  return (
    <View style={[
      styles.eventCard,
      { backgroundColor: colors.bg.primary, borderColor: colors.border.default },
      past && { opacity: 0.55 },
    ]}>
      <View style={[styles.eventDot, { backgroundColor: past ? colors.text.tertiary : BRAND }]} />
      <View style={{ flex: 1 }}>
        {showDate && (
          <Text style={[styles.eventDate, { color: colors.text.tertiary }]}>
            {new Date(event.date + "T00:00:00").toLocaleDateString("en-AU", {
              weekday: "short", month: "short", day: "numeric",
            })}
          </Text>
        )}
        <Text style={[styles.eventName, { color: colors.text.primary }]}>{event.name}</Text>
        {!!event.venue && (
          <Text style={[styles.eventMeta, { color: colors.text.tertiary }]}>
            <Ionicons name="location-outline" size={12} color={colors.text.tertiary} /> {event.venue}
          </Text>
        )}
        {!!event.buyin && (
          <Text style={[styles.eventMeta, { color: colors.text.tertiary }]}>Buy-in: {event.buyin}</Text>
        )}
        {!!event.notes && (
          <Text style={[styles.eventMeta, { color: colors.text.tertiary }]}>{event.notes}</Text>
        )}
      </View>
      <View style={{ gap: 10, alignItems: "center" }}>
        {!past && (
          <TouchableOpacity onPress={onShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-social-outline" size={18} color={BRAND} />
          </TouchableOpacity>
        )}
        {!past && (
          <TouchableOpacity onPress={onCalendarSync} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="calendar-outline" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>
    </View>
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
                blurOnSubmit
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
  publishBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  publishBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Scan CTA (manual mode)
  scanCta: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  scanCtaIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  scanCtaTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  scanCtaSub: { fontSize: 12, lineHeight: 17 },

  // Divider between scan CTA and manual form
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: "500" },

  // Scan loading state
  scanLoadingWrap: {
    paddingVertical: 60, alignItems: "center", gap: 14,
  },
  scanLoadingTitle: { fontSize: 17, fontWeight: "700" },
  scanLoadingSub: { fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 260 },

  // Scan results
  scanResultsHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  scanResultsBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  scanResultsCount: { fontSize: 13, fontWeight: "700" },
  scanAgainText: { fontSize: 13, fontWeight: "600" },

  // Scanned tournament row
  scannedRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 12, borderWidth: 1.5, padding: 14,
  },
  scannedCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  scannedName: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  scannedMeta: { fontSize: 11, fontWeight: "500" },
  scannedDesc: { fontSize: 11, lineHeight: 16, marginTop: 2 },
});
