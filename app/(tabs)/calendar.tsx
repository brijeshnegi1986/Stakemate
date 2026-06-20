import {
  addTournamentEvent,
  deleteTournamentEvent,
  getTournamentEvents,
  TournamentEvent,
} from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { createPost } from "@/lib/social";
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toYMD(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") return false;

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
  const { colors, spacing } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const today = new Date();
  const [viewYear,      setViewYear]      = useState(today.getFullYear());
  const [viewMonth,     setViewMonth]     = useState(today.getMonth());
  const [selectedDate,  setSelectedDate]  = useState<string | null>(null);
  const [events,        setEvents]        = useState<TournamentEvent[]>([]);
  const [showModal,     setShowModal]     = useState(false);
  const [shareEvent,    setShareEvent]    = useState<TournamentEvent | null>(null);

  const [form, setForm] = useState({ name: "", venue: "", buyin: "", notes: "" });

  useFocusEffect(
    useCallback(() => {
      setEvents(getTournamentEvents());
    }, [])
  );

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
    setShowModal(true);
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
    setShowModal(false);

    const savedEvent: TournamentEvent = {
      id: saved, date, created_at: Date.now(),
      name: form.name.trim(), venue: form.venue.trim(),
      buyin: form.buyin.trim(), notes: form.notes.trim(),
    };

    // Schedule notifications
    await scheduleNotifications(savedEvent);

    // Offer calendar sync
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

  function handleDelete(id: number) {
    Alert.alert("Delete Event", "Remove this tournament from your calendar?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteTournamentEvent(id); refresh(); } },
    ]);
  }

  const selectedEvents  = selectedDate ? events.filter((e) => e.date === selectedDate) : [];
  const upcomingEvents  = events.filter((e) => e.date >= todayYMD);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>

      {/* ── Sticky header ── */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.bg.primary, paddingTop: insets.top + 12, borderBottomColor: colors.border.default }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text.primary }]}>Calendar</Text>
          <TouchableOpacity
            onPress={() => openAddModal(selectedDate ?? todayYMD)}
            style={[styles.addTournamentBtn, { backgroundColor: colors.bg.brand }]}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addTournamentBtnText}>Add Tournament</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Month navigator ── */}
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

        {/* ── Calendar grid ── */}
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
                const hasEvent   = eventDates.has(ymd);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayCell, isSelected && { backgroundColor: colors.bg.brand, borderRadius: 8 }]}
                    onPress={() => handleDayPress(day)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        { color: isSelected ? "#fff" : isToday ? colors.bg.brand : colors.text.primary },
                        isToday && !isSelected && { fontWeight: "700" },
                      ]}
                    >
                      {day}
                    </Text>
                    {hasEvent && (
                      <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : colors.bg.brand }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* ── Selected date events ── */}
        {selectedDate && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", {
                  weekday: "long", month: "long", day: "numeric",
                })}
              </Text>
              <TouchableOpacity
                onPress={() => openAddModal(selectedDate)}
                style={[styles.addBtn, { backgroundColor: colors.bg.brand }]}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {selectedEvents.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>No tournaments on this day</Text>
            ) : (
              selectedEvents.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  colors={colors}
                  onDelete={() => handleDelete(e.id)}
                  onShare={() => setShareEvent(e)}
                  onCalendarSync={() => addToDeviceCalendar(e).then((ok) => Alert.alert(ok ? "Added!" : "Error", ok ? "Added to your device calendar." : "Could not add to calendar."))}
                />
              ))
            )}
          </View>
        )}

        {/* ── Upcoming tournaments ── */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Upcoming</Text>
            {upcomingEvents.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                colors={colors}
                onDelete={() => handleDelete(e.id)}
                onShare={() => setShareEvent(e)}
                onCalendarSync={() => addToDeviceCalendar(e).then((ok) => Alert.alert(ok ? "Added!" : "Error", ok ? "Added to your device calendar." : "Could not add to calendar."))}
                showDate
              />
            ))}
          </View>
        )}

        {upcomingEvents.length === 0 && !selectedDate && (
          <View style={[styles.emptyState, { borderColor: colors.border.default }]}>
            <Ionicons name="calendar-outline" size={44} color={colors.text.tertiary} />
            <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments scheduled</Text>
            <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>Tap a date on the calendar or "Add Tournament" to get started.</Text>
          </View>
        )}
      </ScrollView>

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

      {/* ── Add Tournament Modal ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => { Keyboard.dismiss(); setShowModal(false); }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => { Keyboard.dismiss(); setShowModal(false); }} />
              <View style={[styles.modalSheet, { backgroundColor: colors.bg.primary }]}>
                <View style={[styles.modalHandle, { backgroundColor: colors.border.default }]} />
                <View style={styles.modalTitleRow}>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Add Tournament</Text>
                    {selectedDate && (
                      <Text style={[styles.modalSubtitle, { color: colors.text.tertiary }]}>
                        {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowModal(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <View style={[styles.closeBtn, { backgroundColor: colors.bg.secondary }]}>
                      <Ionicons name="close" size={16} color={colors.text.secondary} />
                    </View>
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                    placeholder="Tournament name *"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.name}
                    onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                    placeholder="Venue"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.venue}
                    onChangeText={(t) => setForm((f) => ({ ...f, venue: t }))}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                    placeholder="Buy-in (e.g. $200)"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.buyin}
                    onChangeText={(t) => setForm((f) => ({ ...f, buyin: t }))}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.input, styles.inputMulti, { backgroundColor: colors.bg.secondary, color: colors.text.primary, borderColor: colors.border.default }]}
                    placeholder="Notes"
                    placeholderTextColor={colors.text.tertiary}
                    value={form.notes}
                    onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
                    multiline
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit
                  />

                  {/* Notification + calendar info banner */}
                  <View style={[styles.infoBanner, { backgroundColor: colors.bg.brand + "12", borderColor: colors.bg.brand + "30" }]}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.bg.brand} />
                    <Text style={[styles.infoBannerText, { color: colors.text.secondary }]}>
                      You'll be asked to add this to your device calendar and will receive reminders the day before and on the day.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.bg.brand }, !form.name.trim() && { opacity: 0.5 }]}
                    onPress={handleSave}
                    disabled={!form.name.trim()}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>Save Tournament</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event, colors, onDelete, onShare, onCalendarSync, showDate,
}: {
  event: TournamentEvent;
  colors: any;
  onDelete: () => void;
  onShare: () => void;
  onCalendarSync: () => void;
  showDate?: boolean;
}) {
  return (
    <View style={[styles.eventCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={[styles.eventDot, { backgroundColor: colors.bg.brand }]} />
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
        <TouchableOpacity onPress={onShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="share-social-outline" size={18} color={colors.text.brand} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onCalendarSync} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="calendar-outline" size={18} color={colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Share Tournament Modal ───────────────────────────────────────────────────

const BRAND = "#155DFC";

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
            <View style={[styles.modalSheet, { backgroundColor: colors.bg.primary }]}>
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

              {/* Followers-only toggle */}
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
                style={[styles.saveBtn, { backgroundColor: colors.bg.brand, marginBottom: insets.bottom + 8 }, posting && { opacity: 0.6 }]}
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

  // Sticky header
  stickyHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
  },
  addTournamentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  addTournamentBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  calCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 20,
  },
  dayRow: { flexDirection: "row", marginBottom: 6 },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  weekRow: { flexDirection: "row" },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    gap: 3,
  },
  dayNum: { fontSize: 14, fontWeight: "500" },
  dot: { width: 5, height: 5, borderRadius: 3 },

  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  emptyText: { fontSize: 14, marginTop: 4 },

  emptyState: {
    margin: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 36,
    alignItems: "center",
    gap: 10,
  },
  emptyStateTitle: { fontSize: 16, fontWeight: "700", marginTop: 6, textAlign: "center" },
  emptyStateSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },

  eventCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  eventDate: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  eventName: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  eventMeta: { fontSize: 12, lineHeight: 18 },

  shareTournamentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  shareTournamentBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  shareTournamentName: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  shareTournamentMeta: { fontSize: 12, lineHeight: 18 },

  // Modal
  backdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalSubtitle: { fontSize: 13, marginTop: 3 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  infoBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, marginBottom: 10,
  },
  inputMulti: { height: 80, textAlignVertical: "top" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleSub: { fontSize: 12, lineHeight: 17 },
  saveBtn: {
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
