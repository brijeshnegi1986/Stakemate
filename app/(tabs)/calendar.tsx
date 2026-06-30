import { PaywallModal } from "@/components/PaywallModal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SignInSheet } from "@/components/SignInSheet";
import { SellStakesModal } from "@/components/SellStakesModal";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import {
  addTournamentEvent,
  deleteTournamentEvent,
  getSetting,
  setSetting,
  getTournamentEvents,
  TournamentEvent,
} from "@/db/database";
import { syncEventToCloud, deleteEventFromCloud } from "@/lib/sync";
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
import { cancelStakeDeal, claimStake, getOpenDealByAuthorAndTournament, getStakeDeal, isPublishedStatus } from "@/lib/stakes";
import { supabase } from "@/lib/supabase";
import { deleteMySubmission, deleteMyTournament, deleteSeriesTournaments, fetchMyPendingSubmissions, fetchOfficialTournaments, fetchSeries, fetchVenues, OfficialTournament, SeriesInfo, submitTournamentToDirectory, TournamentType, unpublishMyTournament, unpublishSeriesTournaments, updateMyTournament, VenueInfo } from "@/lib/tournaments";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
  Share,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const PURPLE = "#0891B2";

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

type CalendarResult = { ok: boolean; calEventId?: string; reason?: "denied" | "no_calendar" | "error" };

async function addToDeviceCalendar(event: TournamentEvent): Promise<CalendarResult> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") return { ok: false, reason: "denied" };

    let targetCalId: string | null = null;

    if (Platform.OS === "ios") {
      try { targetCalId = Calendar.getDefaultCalendarSync()?.id ?? null; } catch { /* fall through */ }
    }

    if (!targetCalId) {
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      let targetCal: any = null;
      if (Platform.OS === "ios") {
        targetCal = calendars.find((c: any) => c.allowsModifications && (c.type === "caldav" || c.type === "local"))
          ?? calendars.find((c: any) => c.allowsModifications);
      } else {
        targetCal = calendars.find((c: any) => c.isPrimary && c.allowsModifications)
          ?? calendars.find((c: any) => c.allowsModifications);
      }
      targetCalId = targetCal?.id ?? null;
    }

    if (!targetCalId) return { ok: false, reason: "no_calendar" };

    const start = new Date(event.date + "T09:00:00");
    const end   = new Date(event.date + "T18:00:00");
    const notes = [event.buyin ? `Buy-in: ${event.buyin}` : "", event.notes || ""].filter(Boolean).join("\n") || undefined;

    const calEventId = await Calendar.createEventAsync(targetCalId, {
      title: event.name,
      startDate: start,
      endDate: end,
      location: event.venue || undefined,
      notes,
      alarms: [{ relativeOffset: -1440 }, { relativeOffset: -60 }],
    });
    return { ok: true, calEventId };
  } catch (e) {
    console.error("[Calendar]", e);
    return { ok: false, reason: "error" };
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors, isDark } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const { user, profile, isSyncing } = useAuth();
  const { isPro, isElite } = useSubscription();
  const { openSeries } = useLocalSearchParams<{ openSeries?: string }>();

  const today = new Date();
  const [calTab, setCalTab]                     = useState<CalTab>("schedule");
  const [viewYear, setViewYear]                 = useState(today.getFullYear());
  const [viewMonth, setViewMonth]               = useState(today.getMonth());
  const [selectedDate, setSelectedDate]         = useState<string | null>(null);
  const [events, setEvents]                     = useState<TournamentEvent[]>([]);
  const [shareEvent, setShareEvent]             = useState<TournamentEvent | null>(null);
  const [stakeEvent, setStakeEvent]             = useState<TournamentEvent | null>(null);
  const [showPaywall, setShowPaywall]           = useState(false);
  const [showPublish, setShowPublish]           = useState(false);
  const [communityTournaments, setCommunityTournaments] = useState<SocialPost[]>([]);
  const [savedTournaments, setSavedTournaments] = useState<SocialPost[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [loadingSaved, setLoadingSaved]         = useState(false);
  const [officialTournaments, setOfficialTournaments] = useState<OfficialTournament[]>([]);
  const [loadingOfficial, setLoadingOfficial]   = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState<OfficialTournament[]>([]);
  const [editingSubmission, setEditingSubmission] = useState<OfficialTournament | null>(null);
  const [editingApproved, setEditingApproved] = useState<OfficialTournament | null>(null);
  const [filterState, setFilterState]           = useState<string | null>(null);
  const [filterOrganiser, setFilterOrganiser]   = useState<string | null>(null);
  const [filterDateFrom, setFilterDateFrom]     = useState<Date | null>(null);
  const [filterDateTo, setFilterDateTo]         = useState<Date | null>(null);
  const [showPastEvents, setShowPastEvents]     = useState(false);
  const [searchQuery, setSearchQuery]           = useState("");
  const [showStateFilter, setShowStateFilter]   = useState(false);
  const [showStateSubSheet, setShowStateSubSheet]       = useState(false);
  const [showOrganiserSubSheet, setShowOrganiserSubSheet] = useState(false);
  const [showDateFromPicker, setShowDateFromPicker]     = useState(false);
  const [showDateToPicker, setShowDateToPicker]         = useState(false);
  const [supabaseOrganisers, setSupabaseOrganisers]     = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries]     = useState<string | null>(null);

  // Auto-open series modal when navigated from the home screen carousel
  useEffect(() => {
    if (openSeries) setSelectedSeries(openSeries);
  }, [openSeries]);
  const [scheduleView, setScheduleView]         = useState<"list" | "month">("list");
  const [hidePastEvents, setHidePastEvents]     = useState(() => getSetting("hidePastEvents") !== "false");
  const [calAccessGranted, setCalAccessGranted] = useState<boolean | null>(null);
  const [calendarAddedMap, setCalendarAddedMap] = useState<Map<number, string>>(() => {
    try {
      const stored = getSetting("calendarAddedMap");
      return stored ? new Map<number, string>(JSON.parse(stored)) : new Map();
    } catch { return new Map(); }
  });

  // ── Header hide-on-scroll (Facebook style) ───────────────────────────────
  const headerTranslateY  = useRef(new Animated.Value(0)).current;
  const contentMarginTop  = useRef(new Animated.Value(0)).current;
  const headerShown       = useRef(true);
  const lastScrollY       = useRef(0);
  const headerHeightRef   = useRef(0);
  const [calHeaderHeight, setCalHeaderHeight] = useState(0);

  useEffect(() => {
    if (calHeaderHeight > 0 && headerShown.current) {
      contentMarginTop.setValue(calHeaderHeight);
    }
  }, [calHeaderHeight]);

  const handleCalScroll = useCallback((event: any) => {
    const y    = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;

    if (diff > 6 && y > 10 && headerShown.current) {
      headerShown.current = false;
      Animated.parallel([
        Animated.timing(headerTranslateY, { toValue: -headerHeightRef.current, duration: 220, useNativeDriver: true }),
        Animated.timing(contentMarginTop, { toValue: 0, duration: 220, useNativeDriver: false }),
      ]).start();
    } else if ((diff < -6 || y <= 0) && !headerShown.current) {
      headerShown.current = true;
      Animated.parallel([
        Animated.timing(headerTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(contentMarginTop, { toValue: headerHeightRef.current, duration: 220, useNativeDriver: false }),
      ]).start();
    }
  }, [headerTranslateY, contentMarginTop]);

  // ── Chips hide-on-scroll (Tournaments tab) ────────────────────────────────
  const chipsTranslateY    = useRef(new Animated.Value(0)).current;
  const chipsContentMargin = useRef(new Animated.Value(0)).current;
  const chipsVisible       = useRef(true);
  const lastTourneyScrollY = useRef(0);
  const chipsHeightRef     = useRef(0);
  const [chipsHeight, setChipsHeight] = useState(0);

  // Keep content margin in sync once chips height is first measured
  useEffect(() => {
    if (chipsHeight > 0 && chipsVisible.current) {
      chipsContentMargin.setValue(chipsHeight);
    }
  }, [chipsHeight]);

  const handleTourneyScroll = useCallback((event: any) => {
    const y    = event.nativeEvent.contentOffset.y;
    const diff = y - lastTourneyScrollY.current;
    lastTourneyScrollY.current = y;

    if (diff > 6 && y > 10 && chipsVisible.current) {
      chipsVisible.current = false;
      Animated.parallel([
        Animated.timing(chipsTranslateY, { toValue: -chipsHeightRef.current, duration: 220, useNativeDriver: true }),
        Animated.timing(chipsContentMargin, { toValue: 0, duration: 220, useNativeDriver: false }),
      ]).start();
    } else if ((diff < -6 || y <= 0) && !chipsVisible.current) {
      chipsVisible.current = true;
      Animated.parallel([
        Animated.timing(chipsTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(chipsContentMargin, { toValue: chipsHeightRef.current, duration: 220, useNativeDriver: false }),
      ]).start();
    }
  }, [chipsTranslateY, chipsContentMargin]);

  const displayName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Player";

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const stateMap: Record<string, string> = {
          "New South Wales": "NSW", "Victoria": "VIC", "Queensland": "QLD",
          "Western Australia": "WA", "South Australia": "SA",
          "Australian Capital Territory": "ACT", "Northern Territory": "NT", "Tasmania": "TAS",
        };
        // Location detected but we no longer auto-filter — user controls the state filter manually
      } catch { /* silently ignore */ }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setEvents(getTournamentEvents());
      setHidePastEvents(getSetting("hidePastEvents") === "true");
      (async () => {
        try {
          const r = await Calendar.getCalendarPermissionsAsync();
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
      fetchOfficialTournaments({ state: filterState ?? undefined, search: searchQuery })
        .then(setOfficialTournaments)
        .catch(() => setOfficialTournaments([]))
        .finally(() => setLoadingOfficial(false));
      if (user?.id) {
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

  // Reload from SQLite once cloud sync completes
  useEffect(() => {
    if (!isSyncing) refresh();
  }, [isSyncing]);

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

  // Apply client-side organiser + date filters
  const filteredOfficialTournaments = useMemo(() => {
    return officialTournaments.filter((t) => {
      if (filterOrganiser) {
        const org = t.series_info?.organiser ?? t.organiser_info?.name ?? null;
        if (org !== filterOrganiser) return false;
      }
      if (filterDateFrom && t.tournament_date < filterDateFrom.toISOString().split("T")[0]) return false;
      if (filterDateTo && t.tournament_date > filterDateTo.toISOString().split("T")[0]) return false;
      return true;
    });
  }, [officialTournaments, filterOrganiser, filterDateFrom, filterDateTo]);

  // Group official tournaments by series (only when not searching)
  const { seriesGroups, soloTournaments } = useMemo(() => {
    if (searchQuery.trim()) return { seriesGroups: [], soloTournaments: filteredOfficialTournaments };
    const map = new Map<string, OfficialTournament[]>();
    const solo: OfficialTournament[] = [];
    for (const t of filteredOfficialTournaments) {
      const seriesKey = t.series_info?.name ?? null;
      if (seriesKey) {
        const arr = map.get(seriesKey) ?? [];
        arr.push(t);
        map.set(seriesKey, arr);
      } else {
        solo.push(t);
      }
    }
    const groups: SeriesGroup[] = [];
    for (const [name, tournaments] of map) {
      if (tournaments.length === 1) {
        solo.push(tournaments[0]);
      } else {
        groups.push({
          name,
          seriesId: tournaments[0].series_id ?? null,
          submittedBy: tournaments[0].submitted_by ?? null,
          imageUrl: tournaments[0].series_info?.banner_url ?? null,
          dateFrom: tournaments[0].tournament_date,
          dateTo: tournaments[tournaments.length - 1].tournament_date,
          venue: tournaments[0].venue_info?.name ?? tournaments[0].venue_name ?? "",
          city: tournaments[0].city ?? "",
          logoUrl: (() => {
            const org = tournaments[0].series_info?.organiser_logo_url ?? tournaments[0].organiser_info?.logo_url ?? null;
            const ven = tournaments[0].venue_info?.logo_url ?? null;
            if (org) return org;
            return ven;
          })(),
          venueWebsite: tournaments[0].venue_info?.website ?? null,
          tournaments,
        });
      }
    }
    return { seriesGroups: groups, soloTournaments: solo };
  }, [filteredOfficialTournaments, searchQuery]);

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
      if (deal.status === "draft") {
        Alert.alert("Deal Not Published", "Publish your stake deal first by opening it and tapping Publish.");
        return;
      }
      if (!isPublishedStatus(deal.status)) {
        Alert.alert("Deal Unavailable", `This stake deal is "${deal.status}" and cannot be advertised.`);
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

  async function handleDelete(id: number) {
    const evt = events.find((e) => e.id === id);

    if (evt?.stake_deal_id) {
      const deal = await getStakeDeal(evt.stake_deal_id).catch(() => null);
      const activeStatuses = ["draft", "open", "active", "paused", "filled", "sold_out"];
      if (deal && activeStatuses.includes(deal.status)) {
        Alert.alert(
          "Active Deal Exists",
          "You have an active Marketplace deal on this tournament. Cancel your deal first before removing the tournament.",
          [{ text: "OK" }]
        );
        return;
      }
    }

    Alert.alert("Delete Event", "Remove this tournament from your schedule?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: () => {
          deleteTournamentEvent(id);
          if (user?.id) deleteEventFromCloud(user.id, id).catch(console.error);
          refresh();
        },
      },
    ]);
  }

  async function handleRequestCalAccess() {
    try {
      const r = await Calendar.requestCalendarPermissionsAsync();
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

  async function handleCalendarAdd(e: TournamentEvent) {
    const result = await addToDeviceCalendar(e);
    if (result.ok && result.calEventId) {
      setCalendarAddedMap(prev => {
        const next = new Map(prev).set(e.id, result.calEventId!);
        setSetting("calendarAddedMap", JSON.stringify([...next.entries()]));
        return next;
      });
      Alert.alert("Added!", "Added to your device calendar.");
    } else if (result.reason === "denied") {
      Alert.alert("Calendar Access Denied", "Go to Settings > Stakemate > Calendars to enable.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openURL("app-settings:") },
      ]);
    } else if (result.reason === "no_calendar") {
      Alert.alert("No Calendar Found", "Please ensure you have a writable calendar set up in the iOS Calendar app.");
    } else {
      Alert.alert("Error", "Could not add to calendar. Please try again.");
    }
  }

  async function handleCalendarRemove(e: TournamentEvent) {
    const calEventId = calendarAddedMap.get(e.id);
    if (calEventId) {
      try { await Calendar.deleteEventAsync(calEventId); } catch { /* already removed */ }
    }
    setCalendarAddedMap(prev => {
      const next = new Map(prev);
      next.delete(e.id);
      setSetting("calendarAddedMap", JSON.stringify([...next.entries()]));
      return next;
    });
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
    <View style={[styles.root, { backgroundColor: colors.bg.tertiary }]}>

      {/* ── Animated floating header ── */}
      <Animated.View
        style={[styles.animHeader, { transform: [{ translateY: headerTranslateY }] }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          headerHeightRef.current = h;
          setCalHeaderHeight(h);
        }}
      >
        <View style={[styles.header, { backgroundColor: BRAND, paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerName, { color: "#fff" }]} numberOfLines={1}>
                {calTab === "schedule" ? "My Schedule" : "Tournaments"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              {calTab === "tournaments" && isElite && (
                <TouchableOpacity
                  onPress={() => setShowPublish(true)}
                  style={[styles.addHeaderBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={16} color="#fff" />
                  <Text style={styles.addHeaderBtnText}>Publish</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Segmented control */}
          <SegmentedControl
            options={[
              { value: "schedule",    label: "My Tournaments", icon: "calendar-outline" },
              { value: "tournaments", label: "Tournaments",  icon: "trophy-outline"   },
            ]}
            selected={calTab}
            onChange={(v) => {
              setCalTab(v as CalTab);
              // Show header when switching tabs
              if (!headerShown.current) {
                headerShown.current = true;
                Animated.parallel([
                  Animated.timing(headerTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
                  Animated.timing(contentMarginTop, { toValue: headerHeightRef.current, duration: 220, useNativeDriver: false }),
                ]).start();
              }
            }}
          />
        </View>
      </Animated.View>

      {/* ── Scrollable content — margin shrinks to 0 when header hides ── */}
      <Animated.View style={{ flex: 1, marginTop: contentMarginTop }}>

      {/* ── My Tournaments tab ── */}
      {calTab === "schedule" && (
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32 }}
            showsVerticalScrollIndicator={false}
            onScroll={handleCalScroll}
            scrollEventThrottle={16}
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
                          onCalendarSync={() => handleCalendarAdd(e)}
                          calendarAdded={calendarAddedMap.has(e.id)}
                          onCalendarRemove={() => handleCalendarRemove(e)}
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
                      onCalendarSync={() => handleCalendarAdd(e)}
                      calendarAdded={calendarAddedMap.has(e.id)}
                      onCalendarRemove={() => handleCalendarRemove(e)}
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
                      onCalendarSync={() => handleCalendarAdd(e)}
                      calendarAdded={calendarAddedMap.has(e.id)}
                      onCalendarRemove={() => handleCalendarRemove(e)}
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
              {(() => {
                const pastWithDeal    = pastEvents.filter((e) => !!e.stake_deal_id);
                const pastWithoutDeal = pastEvents.filter((e) => !e.stake_deal_id);
                const visiblePast     = hidePastEvents ? pastWithDeal : pastEvents;
                if (visiblePast.length === 0) return null;
                return (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text.secondary, marginBottom: 10 }]}>Past</Text>
                    {visiblePast.map((e) => (
                      <EventCard key={e.id} event={e} colors={colors} past showDate
                        onDelete={() => handleDelete(e.id)} onShare={() => setShareEvent(e)}
                        onShareStake={() => handleShareStakeDeal(e)}
                        onSellStakes={() => handleSellStakesPress(e)} onCalendarSync={() => {}}
                      />
                    ))}
                    {hidePastEvents && pastWithoutDeal.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setHidePastEvents(false)}
                        style={{ paddingVertical: 10, alignItems: "center" }}
                      >
                        <Text style={{ fontSize: 12, color: colors.text.tertiary }}>
                          +{pastWithoutDeal.length} more past event{pastWithoutDeal.length > 1 ? "s" : ""} hidden — <Text style={{ color: BRAND }}>Show all</Text>
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}

              {/* Empty state / sync loader */}
              {events.length === 0 && savedTournaments.length === 0 && (
                isSyncing ? (
                  <View style={{ alignItems: "center", paddingVertical: 60, gap: 14 }}>
                    <ActivityIndicator size="large" color={BRAND} />
                    <Text style={{ color: colors.text.secondary, fontSize: 14 }}>Syncing your data…</Text>
                  </View>
                ) : (
                  <View style={[styles.emptyState, { borderColor: colors.border.default }]}>
                    <Ionicons name="calendar-outline" size={44} color={colors.text.tertiary} />
                    <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments yet</Text>
                    <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                      Browse the Tournaments tab and tap ⭐ to save events to My Tournaments.
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
                )
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Tournaments tab ── */}
      {calTab === "tournaments" && (
        <View style={{ flex: 1 }}>
          {/* Search bar — always visible */}
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

          {/* Filter bar */}
          {(() => {
            const activeFilterCount = [filterState, filterOrganiser, filterDateFrom, filterDateTo].filter(Boolean).length;
            return (
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default, backgroundColor: colors.bg.primary, gap: 8 }}>
                <Ionicons name="funnel-outline" size={13} color={colors.text.tertiary} />
                <Text style={{ fontSize: 12, color: colors.text.tertiary, fontWeight: "500", flex: 1 }}>
                  {activeFilterCount === 0
                    ? <>Showing <Text style={{ color: BRAND, fontWeight: "700" }}>all upcoming</Text> tournaments</>
                    : <Text style={{ color: BRAND, fontWeight: "700" }}>{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</Text>
                  }
                </Text>
                {activeFilterCount > 0 && (
                  <TouchableOpacity
                    onPress={() => { setFilterState(null); setFilterOrganiser(null); setFilterDateFrom(null); setFilterDateTo(null); }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={{ fontSize: 11, color: BRAND, fontWeight: "600" }}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowStateFilter(true)}
                  activeOpacity={0.75}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: activeFilterCount > 0 ? BRAND : colors.border.default, backgroundColor: activeFilterCount > 0 ? BRAND + "15" : colors.bg.secondary }}
                >
                  <Ionicons name="options-outline" size={12} color={activeFilterCount > 0 ? BRAND : colors.text.secondary} />
                  <Text style={{ fontSize: 11, fontWeight: "600", color: activeFilterCount > 0 ? BRAND : colors.text.secondary }}>Filter</Text>
                  {activeFilterCount > 0 && (
                    <View style={{ backgroundColor: BRAND, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{activeFilterCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })()}

          <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 49 + insets.bottom + 32, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => { handleCalScroll(e); handleTourneyScroll(e); }}
            scrollEventThrottle={16}
          >
            {/* Official tournaments */}
            {loadingOfficial ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={BRAND} />
              </View>
            ) : filteredOfficialTournaments.length === 0 ? (
              <View style={[styles.emptyState, { borderColor: colors.border.default, marginHorizontal: 16 }]}>
                <Ionicons name="trophy-outline" size={44} color={colors.text.tertiary} />
                <Text style={[styles.emptyStateTitle, { color: colors.text.primary }]}>No tournaments found</Text>
                <Text style={[styles.emptyStateSub, { color: colors.text.tertiary }]}>
                  {searchQuery.trim() ? "Try a different search term." : "Try adjusting your filters."}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginBottom: 4, paddingHorizontal: 16 }]}>
                  {filteredOfficialTournaments.length} UPCOMING TOURNAMENT{filteredOfficialTournaments.length !== 1 ? "S" : ""}
                </Text>

                {/* Series groups */}
                {seriesGroups.map((g) => {
                  const isSeriesOwner = !!user?.id && g.submittedBy === user.id;
                  return (
                    <SeriesCard
                      key={g.name}
                      group={g}
                      colors={colors}
                      onPress={() => setSelectedSeries(g.name)}
                      onEditSeries={isSeriesOwner ? () => setSelectedSeries(g.name) : undefined}
                      onUnpublishSeries={isSeriesOwner && g.seriesId ? () => Alert.alert(
                        "Unpublish Series",
                        `Move all events in "${g.name}" back to pending? They will be removed from the public directory until re-approved.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Unpublish All", style: "destructive", onPress: async () => {
                              try {
                                await unpublishSeriesTournaments(g.seriesId!);
                                setOfficialTournaments((prev) => prev.filter((t) => t.series_id !== g.seriesId));
                                setPendingSubmissions((prev) => [
                                  ...g.tournaments.map((t) => ({ ...t, status: "pending" as const })),
                                  ...prev,
                                ]);
                              } catch (e: any) {
                                Alert.alert("Could not unpublish", e?.message ?? "Please try again.");
                              }
                            },
                          },
                        ]
                      ) : undefined}
                      onDeleteSeries={isSeriesOwner && g.seriesId ? () => Alert.alert(
                        "Delete Series",
                        `Permanently delete all ${g.tournaments.length} events in "${g.name}"? This cannot be undone.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete All", style: "destructive", onPress: async () => {
                              try {
                                await deleteSeriesTournaments(g.seriesId!);
                                setOfficialTournaments((prev) => prev.filter((t) => t.series_id !== g.seriesId));
                              } catch (e: any) {
                                Alert.alert("Could not delete", e?.message ?? "Please try again.");
                              }
                            },
                          },
                        ]
                      ) : undefined}
                    />
                  );
                })}

                {/* Solo / non-series tournaments */}
                {soloTournaments.length > 0 && seriesGroups.length > 0 && (
                  <Text style={[styles.sectionLabel, { color: colors.text.tertiary, marginTop: 4, paddingHorizontal: 16 }]}>
                    WEEKLY TOURNEYS
                  </Text>
                )}
                {soloTournaments.map((t) => (
                  <OfficialTournamentCard
                    key={t.id}
                    tournament={t}
                    colors={colors}
                    onAdded={refresh}
                    onEditOwn={() => setEditingApproved(t)}
                    onUnpublishOwn={async () => {
                      try {
                        await unpublishMyTournament(t.id);
                        setOfficialTournaments((prev) => prev.filter((x) => x.id !== t.id));
                        setPendingSubmissions((prev) => [{ ...t, status: "pending" as const }, ...prev]);
                      } catch (e: any) {
                        Alert.alert("Could not unpublish", e?.message ?? "Please try again.");
                      }
                    }}
                    onDeleteOwn={async () => {
                      try {
                        await deleteMyTournament(t.id);
                        setOfficialTournaments((prev) => prev.filter((x) => x.id !== t.id));
                      } catch (e: any) {
                        Alert.alert("Could not delete", e?.message ?? "Please try again.");
                      }
                    }}
                  />
                ))}
              </View>
            )}

            {/* My pending submissions */}
            {pendingSubmissions.length > 0 && (
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
                    onEdit={() => setEditingSubmission(t)}
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
        </View>
      )}

      {/* ── State Filter Modal ── */}
      {/* ── Filter Tournament Modal ── */}
      <Modal
        visible={showStateFilter}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStateFilter(false)}
        onShow={() => {
          supabase.from("tournaments").select("organiser_info->name").eq("status", "approved").then(({ data }) => {
            const names = [...new Set((data ?? []).map((r: any) => r.name).filter(Boolean))].sort() as string[];
            setSupabaseOrganisers(names);
          });
        }}
      >
        <View style={[styles.filterNavBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity style={{ width: 72 }} onPress={() => setShowStateFilter(false)}>
            <Text style={{ fontSize: 16, color: BRAND }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.filterNavTitle, { color: colors.text.primary }]}>Filter Tournaments</Text>
          <TouchableOpacity style={{ width: 72, alignItems: "flex-end" }} onPress={() => { setFilterState(null); setFilterOrganiser(null); setFilterDateFrom(null); setFilterDateTo(null); }}>
            <Text style={{ fontSize: 16, color: BRAND }}>Reset</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, backgroundColor: colors.bg.secondary }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          {/* State */}
          <Text style={[styles.filterSectionLabel, { color: colors.text.tertiary }]}>STATE</Text>
          <View style={[styles.filterGroup, { borderColor: colors.border.default }]}>
            <TouchableOpacity
              style={[styles.filterRow, { backgroundColor: colors.bg.primary }]}
              activeOpacity={0.6}
              onPress={() => setShowStateSubSheet(true)}
            >
              <Text style={[styles.filterRowLabel, { color: colors.text.primary }]}>State</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 15, color: filterState ? BRAND : colors.text.tertiary }}>
                  {filterState ?? "All"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Organiser */}
          <Text style={[styles.filterSectionLabel, { color: colors.text.tertiary }]}>ORGANISER</Text>
          <View style={[styles.filterGroup, { borderColor: colors.border.default }]}>
            <TouchableOpacity
              style={[styles.filterRow, { backgroundColor: colors.bg.primary }]}
              activeOpacity={0.6}
              onPress={() => setShowOrganiserSubSheet(true)}
            >
              <Text style={[styles.filterRowLabel, { color: colors.text.primary }]}>Organiser</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 15, color: filterOrganiser ? BRAND : colors.text.tertiary }} numberOfLines={1}>
                  {filterOrganiser ?? "All"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Date range */}
          <Text style={[styles.filterSectionLabel, { color: colors.text.tertiary }]}>DATE RANGE</Text>
          <View style={[styles.filterGroup, { borderColor: colors.border.default }]}>
            <TouchableOpacity
              style={[styles.filterRow, { backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }]}
              activeOpacity={0.6}
              onPress={() => setShowDateFromPicker(true)}
            >
              <Text style={[styles.filterRowLabel, { color: colors.text.primary }]}>From</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 15, color: filterDateFrom ? BRAND : colors.text.tertiary }}>
                  {filterDateFrom ? filterDateFrom.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Any date"}
                </Text>
                {filterDateFrom
                  ? <TouchableOpacity onPress={() => setFilterDateFrom(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={16} color={colors.text.tertiary} /></TouchableOpacity>
                  : <Ionicons name="calendar-outline" size={16} color={colors.text.tertiary} />
                }
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterRow, { backgroundColor: colors.bg.primary }]}
              activeOpacity={0.6}
              onPress={() => setShowDateToPicker(true)}
            >
              <Text style={[styles.filterRowLabel, { color: colors.text.primary }]}>To</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 15, color: filterDateTo ? BRAND : colors.text.tertiary }}>
                  {filterDateTo ? filterDateTo.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Any date"}
                </Text>
                {filterDateTo
                  ? <TouchableOpacity onPress={() => setFilterDateTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={16} color={colors.text.tertiary} /></TouchableOpacity>
                  : <Ionicons name="calendar-outline" size={16} color={colors.text.tertiary} />
                }
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: BRAND }]}
              onPress={() => setShowStateFilter(false)}
              activeOpacity={0.88}
            >
              <Text style={styles.saveBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* State sub-sheet */}
        <Modal visible={showStateSubSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowStateSubSheet(false)}>
          <View style={[styles.filterNavBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
            <TouchableOpacity style={{ width: 72 }} onPress={() => setShowStateSubSheet(false)}>
              <Text style={{ fontSize: 16, color: BRAND }}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.filterNavTitle, { color: colors.text.primary }]}>Select State</Text>
            <View style={{ width: 72 }} />
          </View>
          <ScrollView style={{ flex: 1, backgroundColor: colors.bg.secondary }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
            <View style={{ height: 24 }} />
            <View style={[styles.filterGroup, { borderColor: colors.border.default }]}>
              {[null, "NSW", "VIC", "QLD", "WA", "SA", "ACT", "NT", "TAS"].map((s, i, arr) => (
                <TouchableOpacity
                  key={s ?? "all"}
                  style={[
                    styles.filterRow,
                    { backgroundColor: colors.bg.primary },
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => { setFilterState(s); setShowStateSubSheet(false); }}
                >
                  <Text style={[styles.filterRowLabel, { color: colors.text.primary }]}>{s ?? "All States"}</Text>
                  {filterState === s && <Ionicons name="checkmark" size={20} color={BRAND} />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Modal>

        {/* Organiser sub-sheet */}
        <Modal visible={showOrganiserSubSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowOrganiserSubSheet(false)}>
          <View style={[styles.filterNavBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
            <TouchableOpacity style={{ width: 72 }} onPress={() => setShowOrganiserSubSheet(false)}>
              <Text style={{ fontSize: 16, color: BRAND }}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.filterNavTitle, { color: colors.text.primary }]}>Select Organiser</Text>
            <View style={{ width: 72 }} />
          </View>
          <ScrollView style={{ flex: 1, backgroundColor: colors.bg.secondary }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
            <View style={{ height: 24 }} />
            <View style={[styles.filterGroup, { borderColor: colors.border.default }]}>
              {[null, ...supabaseOrganisers].map((org, i, arr) => (
                <TouchableOpacity
                  key={org ?? "all"}
                  style={[
                    styles.filterRow,
                    { backgroundColor: colors.bg.primary },
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => { setFilterOrganiser(org); setShowOrganiserSubSheet(false); }}
                >
                  <Text style={[styles.filterRowLabel, { color: colors.text.primary }]}>{org ?? "All Organisers"}</Text>
                  {filterOrganiser === org && <Ionicons name="checkmark" size={20} color={BRAND} />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Modal>

        {/* Date pickers */}
        {showDateFromPicker && (
          <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDateFromPicker(false)}>
            <View style={[styles.filterNavBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
              <TouchableOpacity style={{ width: 72 }} onPress={() => setShowDateFromPicker(false)}>
                <Text style={{ fontSize: 16, color: BRAND }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.filterNavTitle, { color: colors.text.primary }]}>From Date</Text>
              <TouchableOpacity style={{ width: 72, alignItems: "flex-end" }} onPress={() => setShowDateFromPicker(false)}>
                <Text style={{ fontSize: 16, color: BRAND, fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7", alignItems: "center", paddingTop: 20 }}>
              <DateTimePicker
                value={filterDateFrom ?? new Date()}
                mode="date"
                display="inline"
                onChange={(_, date) => date && setFilterDateFrom(date)}
                minimumDate={new Date()}
                accentColor={BRAND}
                textColor={isDark ? "#FFFFFF" : "#000000"}
                themeVariant={isDark ? "dark" : "light"}
                style={{ width: "100%" }}
              />
            </View>
          </Modal>
        )}
        {showDateToPicker && (
          <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDateToPicker(false)}>
            <View style={[styles.filterNavBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
              <TouchableOpacity style={{ width: 72 }} onPress={() => setShowDateToPicker(false)}>
                <Text style={{ fontSize: 16, color: BRAND }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.filterNavTitle, { color: colors.text.primary }]}>To Date</Text>
              <TouchableOpacity style={{ width: 72, alignItems: "flex-end" }} onPress={() => setShowDateToPicker(false)}>
                <Text style={{ fontSize: 16, color: BRAND, fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7", alignItems: "center", paddingTop: 20 }}>
              <DateTimePicker
                value={filterDateTo ?? filterDateFrom ?? new Date()}
                mode="date"
                display="inline"
                onChange={(_, date) => date && setFilterDateTo(date)}
                minimumDate={filterDateFrom ?? new Date()}
                accentColor={BRAND}
                textColor={isDark ? "#FFFFFF" : "#000000"}
                themeVariant={isDark ? "dark" : "light"}
                style={{ width: "100%" }}
              />
            </View>
          </Modal>
        )}
      </Modal>


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

      {/* ── Edit Submission ── */}
      {editingSubmission && user?.id && (
        <EditSubmissionModal
          visible={!!editingSubmission}
          onClose={() => setEditingSubmission(null)}
          tournament={editingSubmission}
          userId={user.id}
          onUpdated={(updated) => {
            setPendingSubmissions((prev) => prev.map((p) => p.id === updated.id ? updated : p));
            setEditingSubmission(null);
          }}
          onDeleted={(id) => {
            setPendingSubmissions((prev) => prev.filter((p) => p.id !== id));
            setEditingSubmission(null);
          }}
          insets={insets}
          colors={colors}
        />
      )}

      {/* ── Edit Approved Tournament ── */}
      {editingApproved && user?.id && (
        <EditSubmissionModal
          visible={!!editingApproved}
          onClose={() => setEditingApproved(null)}
          tournament={editingApproved}
          userId={user.id}
          onUpdated={(updated) => {
            setOfficialTournaments((prev) => prev.filter((t) => t.id !== updated.id));
            setPendingSubmissions((prev) => [updated, ...prev]);
            setEditingApproved(null);
          }}
          onDeleted={(id) => {
            setOfficialTournaments((prev) => prev.filter((t) => t.id !== id));
            setEditingApproved(null);
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

      </Animated.View>{/* end scrollable content */}
    </View>
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
      <View style={[addStyles.page, { backgroundColor: colors.bg.tertiary }]}>

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

function PubField({ icon, children, borderColor, colors, style }: { icon: string; children: React.ReactNode; borderColor?: string; colors: any; style?: any }) {
  return (
    <View style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: borderColor ?? colors.border.default }, style]}>
      <View style={pubStyles.fieldIcon}><Ionicons name={icon as any} size={16} color={borderColor ?? colors.text.tertiary} /></View>
      {children}
    </View>
  );
}

// ─── Pending Submission Card ──────────────────────────────────────────────────

function PendingSubmissionCard({
  tournament, colors, userId, onDeleted, onEdit,
}: {
  tournament: OfficialTournament;
  colors: any;
  userId: string;
  onDeleted: () => void;
  onEdit?: () => void;
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
        tournament.series_info?.name ? `Part of ${tournament.series_info.name}` : null,
        `📍 ${tournament.venue_info?.name ?? tournament.venue_name ?? ""}${tournament.city ? `, ${tournament.city}` : ""}`,
        `📅 ${new Date(tournament.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long" })}${tournament.tournament_time ? ` · ${fmt12h(tournament.tournament_time)}` : ""}`,
        tournament.buy_in ? `💰 Buy-in: $${tournament.buy_in}${tournament.guarantee ? ` · GTD $${tournament.guarantee.toLocaleString()}` : ""}` : null,
        "Just submitted this to the Stakemate tournament directory! 🃏",
      ].filter(Boolean).join("\n");

      await createPost({
        user_id: userId,
        session_type: "tournament",
        session_name: tournament.name,
        venue: tournament.venue_info?.name ?? tournament.venue_name ?? null,
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
            {tournament.series_info?.name ? <Text style={[styles.officialSeries, { color: BRAND }]}>{tournament.series_info.name}</Text> : null}
            <Text style={[styles.officialName, { color: colors.text.primary }]} numberOfLines={2}>{tournament.name}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: "#F59E0B15", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#F59E0B" }}>Pending</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowSheet(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconBtn, { backgroundColor: colors.bg.tertiary }]}
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
              {tournament.venue_info?.name ?? tournament.venue_name ?? ""}{tournament.city ? `, ${tournament.city}` : ""}
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

          {onEdit && (
            <TouchableOpacity style={styles.sheetRow} onPress={() => handleAction(onEdit)}>
              <View style={[styles.sheetIcon, { backgroundColor: PURPLE + "15" }]}>
                <Ionicons name="create-outline" size={18} color={PURPLE} />
              </View>
              <Text style={[styles.sheetRowText, { color: colors.text.primary }]}>Edit Submission</Text>
            </TouchableOpacity>
          )}

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

// ─── Date Picker Modal ────────────────────────────────────────────────────────

function DatePickerModal({
  visible, onClose, onConfirm, initialIso, colors, insets,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (iso: string) => void;
  initialIso?: string;
  colors: any;
  insets?: any;
}) {
  const todayJs = new Date();
  const parseIso = (iso?: string) => iso ? new Date(iso + "T00:00:00") : todayJs;

  const [viewYear,  setViewYear]  = useState(() => parseIso(initialIso).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parseIso(initialIso).getMonth());
  const [selIso,    setSelIso]    = useState<string | null>(initialIso ?? null);

  useEffect(() => {
    if (visible) {
      const d = parseIso(initialIso);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelIso(initialIso ?? null);
    }
  }, [visible, initialIso]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const todayIso = `${todayJs.getFullYear()}-${String(todayJs.getMonth() + 1).padStart(2, "0")}-${String(todayJs.getDate()).padStart(2, "0")}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
        </TouchableOpacity>
        <View style={{ backgroundColor: colors.bg.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: (insets?.bottom ?? 0) + 24 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: colors.text.secondary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text.primary }}>Select Date</Text>
            <TouchableOpacity
              onPress={() => { if (selIso) { onConfirm(selIso); onClose(); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ color: selIso ? BRAND : colors.text.tertiary, fontSize: 16, fontWeight: "700" }}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Month navigation */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color={BRAND} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text.primary }}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-forward" size={22} color={BRAND} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: colors.text.tertiary }}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((day, idx) => {
              const thisIso = day ? `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
              const isSelected = !!thisIso && thisIso === selIso;
              const isToday    = thisIso === todayIso;
              return (
                <TouchableOpacity
                  key={idx}
                  style={{ width: "14.2857%", alignItems: "center", justifyContent: "center", paddingVertical: 3 }}
                  onPress={() => { if (thisIso) setSelIso(thisIso); }}
                  disabled={!day}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: isSelected ? BRAND : "transparent",
                    alignItems: "center", justifyContent: "center",
                    borderWidth: isToday && !isSelected ? 1.5 : 0,
                    borderColor: BRAND,
                  }}>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: isSelected || isToday ? "700" : "400",
                      color: isSelected ? "#fff" : day ? colors.text.primary : "transparent",
                    }}>
                      {day ?? ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Submission Modal ────────────────────────────────────────────────────

function EditSubmissionModal({
  visible, onClose, tournament, userId, onUpdated, onDeleted, insets, colors,
}: {
  visible: boolean;
  onClose: () => void;
  tournament: OfficialTournament;
  userId: string;
  onUpdated: (t: OfficialTournament) => void;
  onDeleted: (id: string) => void;
  insets: any;
  colors: any;
}) {
  const [saving, setSaving] = useState(false);
  const [name,    setName]    = useState(tournament.name);
  const [date,    setDate]    = useState(tournament.tournament_date);
  const [venue,   setVenue]   = useState(tournament.venue_info?.name ?? tournament.venue_name ?? "");
  const [city,    setCity]    = useState(tournament.city ?? "");
  const [iState,  setIState]  = useState(tournament.state ?? "");
  const [buyIn,   setBuyIn]   = useState(tournament.buy_in != null ? String(tournament.buy_in) : "");
  const [guarantee, setGuarantee] = useState(tournament.guarantee != null ? String(tournament.guarantee) : "");
  const [time,    setTime]    = useState(tournament.tournament_time ?? "");
  const [format,  setFormat]  = useState(tournament.format ?? "");
  const [website, setWebsite] = useState(tournament.website_url ?? "");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Venue picker state
  const [allVenues,      setAllVenues]      = useState<VenueInfo[]>([]);
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const [venueSearch,    setVenueSearch]    = useState("");
  const [venueId,        setVenueId]        = useState<string | null>(tournament.venue_id);
  const [venueIsCustom,  setVenueIsCustom]  = useState(!tournament.venue_id);

  useEffect(() => {
    if (visible && allVenues.length === 0) {
      fetchVenues().then(setAllVenues).catch(() => {});
    }
  }, [visible]);

  function parseMoney(s: string) {
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    if (!name.trim() || !date || !venue.trim() || !city.trim()) return;
    setSaving(true);
    try {
      const updated = await updateMyTournament(tournament.id, {
        userId,
        name: name.trim(), tournament_date: date,
        city: city.trim(), state: iState,
        venue_id: venueId,
        venue_name: !venueId && venue.trim() ? venue.trim() : null,
        buy_in: parseMoney(buyIn), guarantee: parseMoney(guarantee),
        tournament_time: time.trim() || null,
        format: format.trim() || null, website_url: website.trim() || null,
      });
      onUpdated(updated);
    } catch (e: any) {
      Alert.alert("Could not update", e?.message ?? "Please try again.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    Alert.alert(
      "Delete Submission",
      `Remove "${tournament.name}" permanently?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive", onPress: async () => {
            try {
              await deleteMySubmission(tournament.id);
              onDeleted(tournament.id);
            } catch (e: any) {
              Alert.alert("Could not delete", e?.message ?? "Please try again.");
            }
          },
        },
      ]
    );
  }

  const canSave = !saving && name.trim().length > 0 && !!date && venue.trim().length > 0 && city.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[pubStyles.page, { backgroundColor: colors.bg.tertiary }]}>
        {/* Nav header */}
        <View style={[pubStyles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={onClose} style={pubStyles.navSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[pubStyles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[pubStyles.navTitle, { color: colors.text.primary }]}>Edit Submission</Text>
          <TouchableOpacity onPress={handleSave} disabled={!canSave} style={[pubStyles.navSide, { alignItems: "flex-end" }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[pubStyles.navPublish, { color: canSave ? PURPLE : colors.text.tertiary }]}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}>

              <View style={[pubStyles.infoBanner, { backgroundColor: "#F59E0B10", borderColor: "#F59E0B25" }]}>
                <Ionicons name="information-circle-outline" size={15} color="#F59E0B" />
                <Text style={[pubStyles.infoBannerText, { color: colors.text.secondary }]}>
                  Editing will re-queue this submission for review.
                </Text>
              </View>

              <PubField icon="trophy-outline" borderColor={PURPLE} colors={colors}>
                <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                  placeholder="Tournament name *" placeholderTextColor={colors.text.tertiary}
                  value={name} onChangeText={setName} returnKeyType="next" autoFocus />
              </PubField>

              {/* Date picker */}
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.75}
                style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: date ? BRAND : colors.border.default }]}
              >
                <View style={pubStyles.fieldIcon}>
                  <Ionicons name="calendar-outline" size={16} color={date ? BRAND : colors.text.tertiary} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, color: date ? colors.text.primary : colors.text.tertiary }}>
                  {date
                    ? new Date(date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
                    : "Select date *"}
                </Text>
                <View style={{ paddingRight: 14 }}>
                  <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                </View>
              </TouchableOpacity>

              {/* Venue picker */}
              {!venueIsCustom ? (
                <TouchableOpacity
                  onPress={() => setShowVenuePicker(true)}
                  activeOpacity={0.75}
                  style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: venueId ? PURPLE : colors.border.default }]}
                >
                  <View style={pubStyles.fieldIcon}>
                    <Ionicons name="business-outline" size={16} color={venueId ? PURPLE : colors.text.tertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {venueId ? (
                      <View>
                        <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{venue}</Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }}>{city}, {iState}</Text>
                      </View>
                    ) : (
                      <Text style={{ color: colors.text.tertiary, fontSize: 15 }}>Select venue / casino *</Text>
                    )}
                  </View>
                  {venueId ? (
                    <TouchableOpacity
                      onPress={() => { setVenueId(null); setVenue(""); setCity(""); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ paddingRight: 14 }}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ paddingRight: 14 }}>
                      <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={() => { setVenueIsCustom(false); setVenue(""); setCity(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Ionicons name="arrow-back-outline" size={14} color={BRAND} />
                    <Text style={{ color: BRAND, fontSize: 13, fontWeight: "600" }}>Back to venue list</Text>
                  </TouchableOpacity>
                  <PubField icon="business-outline" colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Venue / Casino *" placeholderTextColor={colors.text.tertiary}
                      value={venue} onChangeText={setVenue} returnKeyType="next" />
                  </PubField>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="location-outline" colors={colors} style={{ flex: 1 }}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
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
                </>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <PubField icon="cash-outline" colors={colors} style={{ flex: 1 }}>
                  <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="Buy-in ($)" placeholderTextColor={colors.text.tertiary}
                    value={buyIn} onChangeText={setBuyIn} keyboardType="numeric" returnKeyType="next" />
                </PubField>
                <PubField icon="trending-up-outline" colors={colors} style={{ flex: 1 }}>
                  <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                    placeholder="GTD ($)" placeholderTextColor={colors.text.tertiary}
                    value={guarantee} onChangeText={setGuarantee} keyboardType="numeric" returnKeyType="next" />
                </PubField>
              </View>

              <PubField icon="time-outline" colors={colors}>
                <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                  placeholder="Start time (HH:MM)" placeholderTextColor={colors.text.tertiary}
                  value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" returnKeyType="next" />
              </PubField>

              <PubField icon="options-outline" colors={colors}>
                <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                  placeholder="Format (NLH, PLO…)" placeholderTextColor={colors.text.tertiary}
                  value={format} onChangeText={setFormat} returnKeyType="next" />
              </PubField>

              <PubField icon="globe-outline" colors={colors}>
                <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                  placeholder="Website URL" placeholderTextColor={colors.text.tertiary}
                  value={website} onChangeText={setWebsite} keyboardType="url" returnKeyType="done" autoCapitalize="none" />
              </PubField>

              {/* Delete */}
              <TouchableOpacity
                onPress={handleDelete}
                style={[pubStyles.addEntryBtn, { borderColor: "#EF444440", backgroundColor: "#EF444408", marginTop: 8 }]}
                activeOpacity={0.75}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>Delete Submission</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>

      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(iso) => setDate(iso)}
        initialIso={date || undefined}
        colors={colors}
        insets={insets}
      />

      {/* Venue picker modal */}
      <Modal visible={showVenuePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowVenuePicker(false); setVenueSearch(""); }}>
        <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
          <View style={[pubStyles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
            <TouchableOpacity onPress={() => { setShowVenuePicker(false); setVenueSearch(""); }} style={pubStyles.navSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[pubStyles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[pubStyles.navTitle, { color: colors.text.primary }]}>Select Venue</Text>
            <View style={pubStyles.navSide} />
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg.secondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, gap: 8 }}>
              <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
              <TextInput
                value={venueSearch} onChangeText={setVenueSearch}
                placeholder="Search venues..." placeholderTextColor={colors.text.tertiary}
                style={{ flex: 1, color: colors.text.primary, fontSize: 15, paddingVertical: 10 }}
                autoFocus returnKeyType="search"
              />
              {venueSearch.length > 0 && (
                <TouchableOpacity onPress={() => setVenueSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {allVenues
              .filter((v) => {
                if (!venueSearch.trim()) return true;
                const q = venueSearch.toLowerCase();
                return v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q) || v.state.toLowerCase().includes(q);
              })
              .map((v) => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => {
                    setVenueId(v.id); setVenue(v.name); setCity(v.city); setIState(v.state); setVenueIsCustom(false);
                    setShowVenuePicker(false); setVenueSearch("");
                  }}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: v.logo_url ? colors.bg.secondary : BRAND + "14", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: colors.border.subtle }}>
                    {v.logo_url ? (
                      <Image source={{ uri: v.logo_url }} style={{ width: 40, height: 40 }} resizeMode="contain" />
                    ) : (
                      <Text style={{ color: BRAND, fontSize: 16, fontWeight: "800" }}>{v.name.charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{v.name}</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>{v.city} · {v.state}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              ))}
            <TouchableOpacity
              onPress={() => { setVenueId(null); setVenueIsCustom(true); setVenue(""); setCity(""); setShowVenuePicker(false); setVenueSearch(""); }}
              activeOpacity={0.7}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle, marginTop: 8 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.default }}>
                <Ionicons name="pencil-outline" size={20} color={colors.text.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>Other</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>Enter venue name manually</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Publish Tournament Modal ─────────────────────────────────────────────────

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

  // ── Venue picker ──
  const [allVenues,       setAllVenues]       = useState<VenueInfo[]>([]);
  const [venuePickerFor,  setVenuePickerFor]  = useState<"individual" | "series" | null>(null);
  const [venueSearch,     setVenueSearch]     = useState("");

  // ── Series picker (for series mode) ──
  const [allSeries,        setAllSeries]        = useState<SeriesInfo[]>([]);
  const [showSeriesPicker, setShowSeriesPicker] = useState(false);
  const [seriesPickerSearch, setSeriesPickerSearch] = useState("");
  const [pickedSeriesId,   setPickedSeriesId]   = useState<string | null>(null);
  const [pickedSeriesName, setPickedSeriesName] = useState("");

  // ── Individual fields ──
  const [name,              setName]              = useState("");
  const [date,              setDate]              = useState("");
  const [showDatePicker,    setShowDatePicker]    = useState(false);
  const [recurrence,        setRecurrence]        = useState<"none"|"weekly"|"fortnightly"|"monthly">("none");
  const [recEndDate,        setRecEndDate]        = useState("");
  const [showRecEndPicker,  setShowRecEndPicker]  = useState(false);
  const [showSeriesDateFor, setShowSeriesDateFor] = useState<string | null>(null);
  const [venue,             setVenue]             = useState("");
  const [city,              setCity]              = useState("");
  const [iState,            setIState]            = useState("NSW");
  const [venueId,           setVenueId]           = useState<string | null>(null);
  const [venueIsCustom,     setVenueIsCustom]     = useState(false);
  const [buyIn,             setBuyIn]             = useState("");
  const [guarantee,         setGuarantee]         = useState("");
  const [time,              setTime]              = useState("");
  const [lateReg,           setLateReg]           = useState("");
  const [format,            setFormat]            = useState("");
  const [website,           setWebsite]           = useState("");

  // ── Series-event fields ──
  const [seriesVenue,       setSeriesVenue]       = useState("");
  const [seriesCity,        setSeriesCity]        = useState("");
  const [seriesState,       setSeriesState]       = useState("NSW");
  const [seriesVenueId,     setSeriesVenueId]     = useState<string | null>(null);
  const [seriesVenueIsCustom, setSeriesVenueIsCustom] = useState(false);
  const [entries,           setEntries]           = useState<SeriesEntry[]>([makeEntry()]);

  // Load venues + series once when modal opens
  useEffect(() => {
    if (visible) {
      if (allVenues.length === 0) fetchVenues().then(setAllVenues).catch(() => {});
      if (allSeries.length === 0) fetchSeries().then(setAllSeries).catch(() => {});
    }
  }, [visible]);

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
    setVenueId(null); setVenueIsCustom(false);
    setBuyIn(""); setGuarantee(""); setTime(""); setLateReg(""); setFormat(""); setWebsite("");
    setRecurrence("none"); setRecEndDate(""); setShowDatePicker(false); setShowRecEndPicker(false); setShowSeriesDateFor(null);
    setPickedSeriesId(null); setPickedSeriesName(""); setShowSeriesPicker(false); setSeriesPickerSearch("");
    setSeriesVenue(""); setSeriesCity(""); setSeriesState("NSW");
    setSeriesVenueId(null); setSeriesVenueIsCustom(false);
    setVenueSearch(""); setVenuePickerFor(null);
    setEntries([makeEntry()]);
  }

  function handleVenuePick(v: VenueInfo | null) {
    if (venuePickerFor === "individual") {
      if (v) {
        setVenueId(v.id); setVenue(v.name); setCity(v.city); setIState(v.state); setVenueIsCustom(false);
      } else {
        setVenueId(null); setVenueIsCustom(true); setVenue(""); setCity("");
      }
    } else {
      if (v) {
        setSeriesVenueId(v.id); setSeriesVenue(v.name); setSeriesCity(v.city); setSeriesState(v.state); setSeriesVenueIsCustom(false);
      } else {
        setSeriesVenueId(null); setSeriesVenueIsCustom(true); setSeriesVenue(""); setSeriesCity("");
      }
    }
    setVenuePickerFor(null);
    setVenueSearch("");
  }

  function handleClose() { reset(); onClose(); }


  function parseMoney(s: string) {
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  function generateRecurringDates(startIso: string, rec: string, endIso: string): string[] {
    const dates: string[] = [startIso];
    const end = new Date(endIso + "T00:00:00");
    let current = new Date(startIso + "T00:00:00");
    while (true) {
      if (rec === "monthly") current.setMonth(current.getMonth() + 1);
      else current.setDate(current.getDate() + (rec === "weekly" ? 7 : 14));
      if (current > end || dates.length >= 52) break;
      dates.push(current.toISOString().split("T")[0]);
    }
    return dates;
  }

  async function handleSubmit() {
    setPosting(true);
    try {
      if (mode === "individual") {
        if (!date) { setPosting(false); return; }
        const allDates = recurrence !== "none" && recEndDate
          ? generateRecurringDates(date, recurrence, recEndDate)
          : [date];
        const isRecurring = allDates.length > 1;
        const tournType: TournamentType = isRecurring ? "weekly" : "regular";
        const results = await Promise.all(allDates.map((d) =>
          submitTournamentToDirectory({
            userId, type: tournType,
            name: name.trim(), tournament_date: d,
            city: city.trim(), state: iState,
            venue_id: venueId,
            venue_name: !venueId && venue.trim() ? venue.trim() : null,
            buy_in: parseMoney(buyIn), guarantee: parseMoney(guarantee),
            tournament_time: time.trim() || null, late_reg_end: lateReg.trim() || null,
            format: format.trim() || null, website_url: website.trim() || null,
            recurrence: recurrence !== "none" ? recurrence : null,
          })
        ));
        reset(); onSubmitted(results[0]);
        Alert.alert(
          "Submitted for review!",
          isRecurring
            ? `${results.length} occurrence${results.length > 1 ? "s" : ""} submitted. We'll approve shortly.`
            : "We'll approve your tournament shortly."
        );
      } else {
        // Validate entries
        const hasError = entries.some((e) => !e.date || !e.name.trim());
        if (hasError || !seriesVenue.trim() || !seriesCity.trim()) {
          Alert.alert("Missing fields", "Please fill in name and date for every event.");
          setPosting(false); return;
        }
        const results = await Promise.all(entries.map((e) => submitTournamentToDirectory({
          userId, type: "series",
          name: e.name.trim(),
          tournament_date: e.date,
          city: seriesCity.trim(), state: seriesState,
          venue_id: seriesVenueId,
          venue_name: !seriesVenueId && seriesVenue.trim() ? seriesVenue.trim() : null,
          series_id: pickedSeriesId,
          buy_in: parseMoney(e.buyIn), guarantee: parseMoney(e.guarantee),
          tournament_time: e.time.trim() || null, late_reg_end: e.lateReg.trim() || null,
          format: e.format.trim() || null,
        })));
        reset(); onSubmitted(results[0]);
        const label = pickedSeriesName || "this series";
        Alert.alert("Submitted for review!", `${results.length} tournament${results.length > 1 ? "s" : ""} submitted under "${label}".`);
      }
    } catch (e: any) {
      Alert.alert("Could not submit", e?.message || "Check your connection and try again.");
    } finally { setPosting(false); }
  }

  const canSubmit = !posting && (
    mode === "individual"
      ? name.trim().length > 0 && !!date && venue.trim().length > 0 && city.trim().length > 0
      : seriesVenue.trim().length > 0 && seriesCity.trim().length > 0 && entries.every((e) => e.name.trim().length > 0 && !!e.date)
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[pubStyles.page, { backgroundColor: colors.bg.tertiary }]}>

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
                  { value: "individual", label: "Regular", icon: "trophy-outline" },
                  { value: "series",     label: "Series",  icon: "layers-outline" },
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

                  {/* Date picker */}
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.75}
                    style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: date ? BRAND : colors.border.default }]}
                  >
                    <View style={pubStyles.fieldIcon}>
                      <Ionicons name="calendar-outline" size={16} color={date ? BRAND : colors.text.tertiary} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, color: date ? colors.text.primary : colors.text.tertiary }}>
                      {date
                        ? new Date(date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
                        : "Select date *"}
                    </Text>
                    <View style={{ paddingRight: 14 }}>
                      <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                    </View>
                  </TouchableOpacity>

                  {/* Recurrence selector */}
                  {date ? (
                    <View style={{ gap: 8 }}>
                      <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary }]}>RECURRENCE</Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {(["none","weekly","fortnightly","monthly"] as const).map((opt) => (
                          <TouchableOpacity
                            key={opt}
                            onPress={() => { setRecurrence(opt); if (opt === "none") setRecEndDate(""); }}
                            style={{
                              flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, alignItems: "center",
                              backgroundColor: recurrence === opt ? PURPLE + "15" : colors.bg.primary,
                              borderColor: recurrence === opt ? PURPLE : colors.border.default,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: recurrence === opt ? "700" : "500", color: recurrence === opt ? PURPLE : colors.text.secondary }}>
                              {opt === "none" ? "None" : opt === "weekly" ? "Weekly" : opt === "fortnightly" ? "Fortnightly" : "Monthly"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {recurrence !== "none" && (
                        <TouchableOpacity
                          onPress={() => setShowRecEndPicker(true)}
                          activeOpacity={0.75}
                          style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: recEndDate ? PURPLE : colors.border.default }]}
                        >
                          <View style={pubStyles.fieldIcon}>
                            <Ionicons name="repeat-outline" size={16} color={recEndDate ? PURPLE : colors.text.tertiary} />
                          </View>
                          <Text style={{ flex: 1, fontSize: 15, color: recEndDate ? colors.text.primary : colors.text.tertiary }}>
                            {recEndDate
                              ? `Repeat until: ${new Date(recEndDate + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`
                              : "Repeat until… (optional)"}
                          </Text>
                          {recEndDate ? (
                            <TouchableOpacity onPress={() => setRecEndDate("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingRight: 14 }}>
                              <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                            </TouchableOpacity>
                          ) : (
                            <View style={{ paddingRight: 14 }}>
                              <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                            </View>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : null}

                  {/* Venue picker */}
                  {!venueIsCustom ? (
                    <TouchableOpacity
                      onPress={() => setVenuePickerFor("individual")}
                      activeOpacity={0.75}
                      style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: venueId ? PURPLE : colors.border.default }]}
                    >
                      <View style={pubStyles.fieldIcon}>
                        <Ionicons name="business-outline" size={16} color={venueId ? PURPLE : colors.text.tertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {venueId ? (
                          <View>
                            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{venue}</Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }}>{city}, {iState}</Text>
                          </View>
                        ) : (
                          <Text style={{ color: colors.text.tertiary, fontSize: 15 }}>Select venue / casino *</Text>
                        )}
                      </View>
                      {venueId ? (
                        <TouchableOpacity
                          onPress={() => { setVenueId(null); setVenue(""); setCity(""); }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{ paddingRight: 14 }}
                        >
                          <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                        </TouchableOpacity>
                      ) : (
                        <View style={{ paddingRight: 14 }}>
                          <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => { setVenueIsCustom(false); setVenue(""); setCity(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <Ionicons name="arrow-back-outline" size={14} color={BRAND} />
                        <Text style={{ color: BRAND, fontSize: 13, fontWeight: "600" }}>Back to venue list</Text>
                      </TouchableOpacity>
                      <PubField icon="business-outline" colors={colors}>
                        <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                          placeholder="Venue / Casino *" placeholderTextColor={colors.text.tertiary}
                          value={venue} onChangeText={setVenue} returnKeyType="next" autoFocus />
                      </PubField>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PubField icon="location-outline" colors={colors} style={{ flex: 1 }}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
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
                    </>
                  )}

                  <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary, marginTop: 6 }]}>OPTIONAL</Text>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="cash-outline" colors={colors} style={{ flex: 1 }}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                        placeholder="Buy-in ($)" placeholderTextColor={colors.text.tertiary}
                        value={buyIn} onChangeText={setBuyIn} keyboardType="numeric" returnKeyType="next" />
                    </PubField>
                    <PubField icon="trending-up-outline" colors={colors} style={{ flex: 1 }}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                        placeholder="GTD ($)" placeholderTextColor={colors.text.tertiary}
                        value={guarantee} onChangeText={setGuarantee} keyboardType="numeric" returnKeyType="next" />
                    </PubField>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PubField icon="time-outline" colors={colors} style={{ flex: 1 }}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                        placeholder="Start time (HH:MM)" placeholderTextColor={colors.text.tertiary}
                        value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                    </PubField>
                    <PubField icon="hourglass-outline" colors={colors} style={{ flex: 1 }}>
                      <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                        placeholder="Late reg (HH:MM)" placeholderTextColor={colors.text.tertiary}
                        value={lateReg} onChangeText={setLateReg} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                    </PubField>
                  </View>

                  <PubField icon="options-outline" colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Format (NLH, PLO…)" placeholderTextColor={colors.text.tertiary}
                      value={format} onChangeText={setFormat} returnKeyType="next" />
                  </PubField>

                  <PubField icon="globe-outline" colors={colors}>
                    <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                      placeholder="Website URL" placeholderTextColor={colors.text.tertiary}
                      value={website} onChangeText={setWebsite} keyboardType="url" returnKeyType="done" autoCapitalize="none" />
                  </PubField>
                </>
              )}

              {/* ─── SERIES MODE ─── */}
              {mode === "series" && (
                <>
                  <Text style={[pubStyles.sectionLabel, { color: colors.text.tertiary }]}>SERIES</Text>

                  {/* Series picker */}
                  <TouchableOpacity
                    onPress={() => setShowSeriesPicker(true)}
                    activeOpacity={0.75}
                    style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: pickedSeriesId ? PURPLE : colors.border.default }]}
                  >
                    <View style={pubStyles.fieldIcon}>
                      <Ionicons name="layers-outline" size={16} color={pickedSeriesId ? PURPLE : colors.text.tertiary} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, color: pickedSeriesId ? colors.text.primary : colors.text.tertiary }}>
                      {pickedSeriesName || "Select series (optional)"}
                    </Text>
                    {pickedSeriesId ? (
                      <TouchableOpacity
                        onPress={() => { setPickedSeriesId(null); setPickedSeriesName(""); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ paddingRight: 14 }}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                      </TouchableOpacity>
                    ) : (
                      <View style={{ paddingRight: 14 }}>
                        <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Series venue picker */}
                  {!seriesVenueIsCustom ? (
                    <TouchableOpacity
                      onPress={() => setVenuePickerFor("series")}
                      activeOpacity={0.75}
                      style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: seriesVenueId ? PURPLE : colors.border.default }]}
                    >
                      <View style={pubStyles.fieldIcon}>
                        <Ionicons name="business-outline" size={16} color={seriesVenueId ? PURPLE : colors.text.tertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {seriesVenueId ? (
                          <View>
                            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{seriesVenue}</Text>
                            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }}>{seriesCity}, {seriesState}</Text>
                          </View>
                        ) : (
                          <Text style={{ color: colors.text.tertiary, fontSize: 15 }}>Select venue / casino *</Text>
                        )}
                      </View>
                      {seriesVenueId ? (
                        <TouchableOpacity
                          onPress={() => { setSeriesVenueId(null); setSeriesVenue(""); setSeriesCity(""); }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{ paddingRight: 14 }}
                        >
                          <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                        </TouchableOpacity>
                      ) : (
                        <View style={{ paddingRight: 14 }}>
                          <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => { setSeriesVenueIsCustom(false); setSeriesVenue(""); setSeriesCity(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <Ionicons name="arrow-back-outline" size={14} color={BRAND} />
                        <Text style={{ color: BRAND, fontSize: 13, fontWeight: "600" }}>Back to venue list</Text>
                      </TouchableOpacity>
                      <PubField icon="business-outline" colors={colors}>
                        <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                          placeholder="Venue / Casino *" placeholderTextColor={colors.text.tertiary}
                          value={seriesVenue} onChangeText={setSeriesVenue} returnKeyType="next" autoFocus />
                      </PubField>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PubField icon="location-outline" colors={colors} style={{ flex: 1 }}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
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
                    </>
                  )}

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

                      <TouchableOpacity
                        onPress={() => setShowSeriesDateFor(entry.id)}
                        activeOpacity={0.75}
                        style={[pubStyles.fieldWrap, { backgroundColor: colors.bg.primary, borderColor: entry.date ? BRAND : colors.border.default }]}
                      >
                        <View style={pubStyles.fieldIcon}>
                          <Ionicons name="calendar-outline" size={16} color={entry.date ? BRAND : colors.text.tertiary} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 15, color: entry.date ? colors.text.primary : colors.text.tertiary }}>
                          {entry.date
                            ? new Date(entry.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                            : "Select date *"}
                        </Text>
                        <View style={{ paddingRight: 14 }}>
                          <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                        </View>
                      </TouchableOpacity>

                      <View style={{ height: 8 }} />

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PubField icon="cash-outline" colors={colors} style={{ flex: 1 }}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                            placeholder="Buy-in ($)" placeholderTextColor={colors.text.tertiary}
                            value={entry.buyIn} onChangeText={(t) => updateEntry(entry.id, { buyIn: t })} keyboardType="numeric" returnKeyType="next" />
                        </PubField>
                        <PubField icon="trending-up-outline" colors={colors} style={{ flex: 1 }}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                            placeholder="GTD ($)" placeholderTextColor={colors.text.tertiary}
                            value={entry.guarantee} onChangeText={(t) => updateEntry(entry.id, { guarantee: t })} keyboardType="numeric" returnKeyType="next" />
                        </PubField>
                      </View>

                      <View style={{ height: 8 }} />

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PubField icon="time-outline" colors={colors} style={{ flex: 1 }}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
                            placeholder="Start (HH:MM)" placeholderTextColor={colors.text.tertiary}
                            value={entry.time} onChangeText={(t) => updateEntry(entry.id, { time: t })} keyboardType="numbers-and-punctuation" returnKeyType="next" />
                        </PubField>
                        <PubField icon="hourglass-outline" colors={colors} style={{ flex: 1 }}>
                          <TextInput style={[pubStyles.fieldInput, { color: colors.text.primary }]}
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

      {/* ─── Date Picker Modals ─── */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(iso) => setDate(iso)}
        initialIso={date || undefined}
        colors={colors}
        insets={insets}
      />
      <DatePickerModal
        visible={showRecEndPicker}
        onClose={() => setShowRecEndPicker(false)}
        onConfirm={(iso) => setRecEndDate(iso)}
        initialIso={recEndDate || date || undefined}
        colors={colors}
        insets={insets}
      />
      <DatePickerModal
        visible={!!showSeriesDateFor}
        onClose={() => setShowSeriesDateFor(null)}
        onConfirm={(iso) => {
          if (showSeriesDateFor) { updateEntry(showSeriesDateFor, { date: iso }); setShowSeriesDateFor(null); }
        }}
        initialIso={entries.find((e) => e.id === showSeriesDateFor)?.date || undefined}
        colors={colors}
        insets={insets}
      />

      {/* ─── Series Picker Modal ─── */}
      <Modal
        visible={showSeriesPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowSeriesPicker(false); setSeriesPickerSearch(""); }}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
          <View style={[pubStyles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
            <TouchableOpacity onPress={() => { setShowSeriesPicker(false); setSeriesPickerSearch(""); }} style={pubStyles.navSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[pubStyles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[pubStyles.navTitle, { color: colors.text.primary }]}>Select Series</Text>
            <View style={pubStyles.navSide} />
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg.secondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, gap: 8 }}>
              <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
              <TextInput
                value={seriesPickerSearch} onChangeText={setSeriesPickerSearch}
                placeholder="Search series..." placeholderTextColor={colors.text.tertiary}
                style={{ flex: 1, color: colors.text.primary, fontSize: 15, paddingVertical: 10 }}
                autoFocus returnKeyType="search"
              />
              {seriesPickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setSeriesPickerSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {allSeries.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                <Ionicons name="layers-outline" size={36} color={colors.text.tertiary} />
                <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>No series in the directory yet</Text>
              </View>
            ) : allSeries
              .filter((s) => {
                if (!seriesPickerSearch.trim()) return true;
                const q = seriesPickerSearch.toLowerCase();
                return s.name.toLowerCase().includes(q) || (s.organiser ?? "").toLowerCase().includes(q);
              })
              .map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => {
                    setPickedSeriesId(s.id);
                    setPickedSeriesName(s.name);
                    setShowSeriesPicker(false);
                    setSeriesPickerSearch("");
                  }}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: s.banner_url ? colors.bg.secondary : PURPLE + "14", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: colors.border.subtle }}>
                    {s.banner_url ? (
                      <Image source={{ uri: s.banner_url }} style={{ width: 44, height: 44 }} resizeMode="cover" />
                    ) : (
                      <Text style={{ color: PURPLE, fontSize: 16, fontWeight: "800" }}>{s.name.charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{s.name}</Text>
                    {s.organiser ? <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>{s.organiser}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Venue Picker Modal ─── */}
      <Modal
        visible={venuePickerFor !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setVenuePickerFor(null); setVenueSearch(""); }}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
          {/* Header */}
          <View style={[pubStyles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
            <TouchableOpacity onPress={() => { setVenuePickerFor(null); setVenueSearch(""); }} style={pubStyles.navSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[pubStyles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[pubStyles.navTitle, { color: colors.text.primary }]}>Select Venue</Text>
            <View style={pubStyles.navSide} />
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg.secondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, gap: 8 }}>
              <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
              <TextInput
                value={venueSearch}
                onChangeText={setVenueSearch}
                placeholder="Search venues..."
                placeholderTextColor={colors.text.tertiary}
                style={{ flex: 1, color: colors.text.primary, fontSize: 15, paddingVertical: 10 }}
                autoFocus
                returnKeyType="search"
              />
              {venueSearch.length > 0 && (
                <TouchableOpacity onPress={() => setVenueSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {allVenues
              .filter((v) => {
                if (!venueSearch.trim()) return true;
                const q = venueSearch.toLowerCase();
                return v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q) || v.state.toLowerCase().includes(q);
              })
              .map((v) => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => handleVenuePick(v)}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle }}
                >
                  {/* Logo or initial */}
                  <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: v.logo_url ? colors.bg.secondary : BRAND + "14", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: colors.border.subtle }}>
                    {v.logo_url ? (
                      <Image source={{ uri: v.logo_url }} style={{ width: 40, height: 40 }} resizeMode="contain" />
                    ) : (
                      <Text style={{ color: BRAND, fontSize: 16, fontWeight: "800" }}>{v.name.charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{v.name}</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>{v.city} · {v.state}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              ))}

            {/* Other option */}
            <TouchableOpacity
              onPress={() => handleVenuePick(null)}
              activeOpacity={0.7}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle, marginTop: 8 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.default }}>
                <Ionicons name="pencil-outline" size={20} color={colors.text.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>Other</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>Enter venue name manually</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Series Card + Detail Modal ───────────────────────────────────────────────

const STAR_COLOR = "#F59E0B";

type SeriesGroup = {
  name: string;
  seriesId: string | null;
  submittedBy: string | null;
  imageUrl: string | null;
  dateFrom: string;
  dateTo: string;
  venue: string;
  city: string;
  logoUrl: string | null;
  venueWebsite: string | null;
  tournaments: OfficialTournament[];
};

function fmtDateShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ─── iOS-style action sheet ────────────────────────────────────────────────────

type SheetAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  iconColor?: string;
};

function CardActionsSheet({ visible, title, subtitle, onClose, actions }: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  actions: SheetAction[];
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: colors.bg.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default, alignSelf: "center", marginTop: 10, marginBottom: 10 }} />
        {(title || subtitle) && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
            {title && <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: 15, fontWeight: "700" }}>{title}</Text>}
            {subtitle && <Text numberOfLines={1} style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>}
          </View>
        )}
        <View style={{ marginHorizontal: 16, borderRadius: 14, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
          {actions.map((action, i) => (
            <View key={action.label}>
              {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle, marginLeft: 62 }} />}
              <TouchableOpacity
                onPress={() => { onClose(); setTimeout(action.onPress, 250); }}
                activeOpacity={0.6}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
              >
                <View style={{
                  width: 34, height: 34, borderRadius: 9,
                  backgroundColor: action.destructive ? "#EF444418" : (action.iconColor ? action.iconColor + "18" : colors.bg.tertiary),
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name={action.icon} size={17} color={action.destructive ? "#EF4444" : (action.iconColor ?? colors.text.secondary)} />
                </View>
                <Text style={{ flex: 1, fontSize: 16, color: action.destructive ? "#EF4444" : colors.text.primary }}>{action.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 14, paddingVertical: 16, alignItems: "center", backgroundColor: colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text.primary }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function SeriesCard({ group, colors, onPress, onEditSeries, onUnpublishSeries, onDeleteSeries }: {
  group: SeriesGroup;
  colors: any;
  onPress: () => void;
  onEditSeries?: () => void;
  onUnpublishSeries?: () => void;
  onDeleteSeries?: () => void;
}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const isOwner = !!(onEditSeries || onUnpublishSeries || onDeleteSeries);
  const dateRange = group.dateFrom === group.dateTo
    ? fmtDateShort(group.dateFrom)
    : `${fmtDateShort(group.dateFrom)} – ${fmtDateShort(group.dateTo)}`;

  return (
    <>
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.officialCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
    >
      {/* Banner */}
      <View style={{ position: "relative" }}>
        {group.imageUrl ? (
          <Image source={{ uri: group.imageUrl }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
        ) : (
          <View style={{ width: "100%", height: 72, backgroundColor: BRAND + "12", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="trophy" size={28} color={BRAND} />
          </View>
        )}
        {/* Organiser / venue logo badge — bottom-left of banner */}
        {group.logoUrl && (
          <View style={{ position: "absolute", bottom: -16, left: 14, width: 34, height: 34, borderRadius: 8, backgroundColor: colors.bg.primary, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3, overflow: "hidden" }}>
            <Image source={{ uri: group.logoUrl }} style={{ width: 34, height: 34 }} resizeMode="contain" />
          </View>
        )}
      </View>

      {/* Info row */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: group.logoUrl ? 22 : 12, paddingBottom: 12, gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.officialName, { color: colors.text.primary, flexShrink: 1 }]} numberOfLines={1}>{group.name}</Text>
            <View style={[styles.officialPill, { backgroundColor: BRAND + "12", paddingHorizontal: 6, paddingVertical: 2 }]}>
              <Text style={[styles.officialPillText, { color: BRAND, fontSize: 10 }]}>SERIES</Text>
            </View>
          </View>
          <Text style={[styles.officialDetailText, { color: colors.text.tertiary }]}>
            {group.tournaments.length} events · {dateRange}
          </Text>
          {(group.venue || group.city) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
              <Ionicons name="location-outline" size={12} color={colors.text.tertiary} />
              <Text style={[styles.officialDetailText, { color: colors.text.tertiary }]} numberOfLines={1}>
                {[group.venue, group.city].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isOwner ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setSheetVisible(true); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconBtn, { backgroundColor: colors.bg.secondary }]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
          )}
        </View>
      </View>
    </TouchableOpacity>
    <CardActionsSheet
      visible={sheetVisible}
      title={group.name}
      subtitle={`${group.tournaments.length} events · ${dateRange}`}
      onClose={() => setSheetVisible(false)}
      actions={[
        ...(onEditSeries ? [{ icon: "create-outline" as const, label: "Edit Series", iconColor: BRAND, onPress: onEditSeries }] : []),
        ...(onUnpublishSeries ? [{ icon: "eye-off-outline" as const, label: "Unpublish Series", iconColor: "#F97316", onPress: onUnpublishSeries }] : []),
        ...(onDeleteSeries ? [{ icon: "trash-outline" as const, label: "Delete Series", destructive: true, onPress: onDeleteSeries }] : []),
      ]}
    />
  </>
  );
}

type SeriesFilter = "all" | "games" | "satellites";

function isSatellite(t: OfficialTournament) {
  const haystack = `${t.name} ${t.format ?? ""} ${t.structure ?? ""}`.toLowerCase();
  return haystack.includes("satellite") || haystack.includes("sat ") || haystack.includes("satty");
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
  const { user: modalUser } = useAuth();
  const [filter, setFilter] = useState<SeriesFilter>("all");
  const [localTournaments, setLocalTournaments] = useState<OfficialTournament[]>([]);
  const [editingTournament, setEditingTournament] = useState<OfficialTournament | null>(null);

  // Sync local list whenever the group changes
  useEffect(() => {
    if (group) setLocalTournaments(group.tournaments);
  }, [group]);

  if (!group) return null;

  const dateRange = group.dateFrom === group.dateTo
    ? fmtDateShort(group.dateFrom)
    : `${fmtDateShort(group.dateFrom)} – ${fmtDateShort(group.dateTo)}`;

  const hasSatellites = localTournaments.some(isSatellite);

  const filtered = filter === "satellites"
    ? localTournaments.filter(isSatellite)
    : filter === "games"
    ? localTournaments.filter((t) => !isSatellite(t))
    : localTournaments;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 4 }}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text.primary }} numberOfLines={1}>{group.name}</Text>
            <Text style={[styles.officialDetailText, { color: colors.text.tertiary }]}>{filtered.length} of {group.tournaments.length} events · {dateRange}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Full-width series banner */}
        {group.imageUrl ? (
          <Image source={{ uri: group.imageUrl }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
        ) : null}

        {/* Filter pills — only show if series has satellites */}
        {hasSatellites && (
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bg.primary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }}>
            {(["all", "games", "satellites"] as SeriesFilter[]).map((opt) => {
              const active = filter === opt;
              const label = opt === "all" ? "All" : opt === "games" ? "Games" : "Satties";
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setFilter(opt)}
                  activeOpacity={0.75}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
                    backgroundColor: active ? BRAND : colors.bg.secondary,
                    borderColor: active ? BRAND : colors.border.default,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : colors.text.secondary }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
              <Ionicons name="trophy-outline" size={36} color={colors.text.tertiary} />
              <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>No {filter} found</Text>
            </View>
          ) : filtered.map((t) => (
            <OfficialTournamentCard
              key={t.id}
              tournament={t}
              colors={colors}
              onAdded={onAdded}
              hideBanner
              hideSeriesName
              onEditOwn={modalUser?.id && t.submitted_by === modalUser.id ? () => setEditingTournament(t) : undefined}
              onUnpublishOwn={modalUser?.id && t.submitted_by === modalUser.id ? async () => {
                try {
                  await unpublishMyTournament(t.id);
                  setLocalTournaments((prev) => prev.filter((x) => x.id !== t.id));
                  onAdded();
                } catch (e: any) {
                  Alert.alert("Could not unpublish", e?.message ?? "Please try again.");
                }
              } : undefined}
              onDeleteOwn={modalUser?.id && t.submitted_by === modalUser.id ? async () => {
                try {
                  await deleteMyTournament(t.id);
                  setLocalTournaments((prev) => prev.filter((x) => x.id !== t.id));
                  onAdded();
                } catch (e: any) {
                  Alert.alert("Could not delete", e?.message ?? "Please try again.");
                }
              } : undefined}
            />
          ))}
        </ScrollView>
      </View>

      {editingTournament && modalUser?.id && (
        <EditSubmissionModal
          visible={!!editingTournament}
          onClose={() => setEditingTournament(null)}
          tournament={editingTournament}
          userId={modalUser.id}
          onUpdated={(updated) => {
            setLocalTournaments((prev) => prev.filter((x) => x.id !== updated.id));
            setEditingTournament(null);
            onAdded();
          }}
          onDeleted={(id) => {
            setLocalTournaments((prev) => prev.filter((x) => x.id !== id));
            setEditingTournament(null);
            onAdded();
          }}
          insets={insets}
          colors={colors}
        />
      )}
    </Modal>
  );
}

function OfficialTournamentCard({
  tournament, colors, onAdded, hideBanner = false, hideSeriesName = false, onEditOwn, onDeleteOwn, onUnpublishOwn,
}: {
  tournament: OfficialTournament;
  colors: any;
  onAdded: () => void;
  hideBanner?: boolean;
  hideSeriesName?: boolean;
  onEditOwn?: () => void;
  onDeleteOwn?: () => void;
  onUnpublishOwn?: () => void;
}) {
  const { user: cardUser } = useAuth();
  const [starred, setStarred] = useState(false);
  const [savedEventId, setSavedEventId] = useState<number | null>(null);
  const [ownerSheetVisible, setOwnerSheetVisible] = useState(false);
  const [starSignInVisible, setStarSignInVisible] = useState(false);
  const isOwner = !!cardUser?.id && tournament.submitted_by === cardUser.id;

  // Animated confirmation toast
  const toastOpacity    = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(8)).current;
  const [toastMessage, setToastMessage] = useState("");

  function showToast(msg: string) {
    setToastMessage(msg);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(toastOpacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity,    { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(toastTranslateY, { toValue: -6, duration: 300, useNativeDriver: true }),
        ]).start();
      }, 1600);
    });
  }

  const dateLabel = tournament.tournament_date
    ? new Date(tournament.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    : null;
  const timeLabel = tournament.tournament_time ? fmt12h(tournament.tournament_time) : null;
  const lateReg   = tournament.late_reg_end ? `Late reg until ${fmt12h(tournament.late_reg_end)}` : null;

  function handleStar() {
    if (!cardUser?.id) {
      setStarSignInVisible(true);
      return;
    }
    if (starred && savedEventId != null) {
      deleteTournamentEvent(savedEventId);
      if (cardUser?.id) deleteEventFromCloud(cardUser.id, savedEventId).catch(console.error);
      setSavedEventId(null);
      setStarred(false);
      showToast("Removed from My Tournaments");
      return;
    }
    const eventId = addTournamentEvent({
      name:      tournament.name,
      date:      tournament.tournament_date,
      venue:     [tournament.venue_info?.name, tournament.city].filter(Boolean).join(", "),
      buyin:     tournament.buy_in != null ? `$${tournament.buy_in.toLocaleString()}` : "",
      notes:     [
        tournament.format,
        tournament.guarantee != null ? `GTD $${tournament.guarantee.toLocaleString()}` : null,
        timeLabel ? `Starts ${timeLabel}` : null,
      ].filter(Boolean).join(" · "),
      image_url: tournament.series_info?.banner_url ?? tournament.banner_url ?? "",
      source:    "directory",
    });
    if (cardUser?.id) syncEventToCloud(cardUser.id, eventId).catch(console.error);
    setSavedEventId(eventId);
    setStarred(true);
    showToast("Added to My Tournaments");
    onAdded();
  }

  const bannerUrl = tournament.series_info?.banner_url ?? tournament.banner_url ?? null;
  const hasBanner = !!bannerUrl && !hideBanner;

  // Organiser logo: series organiser > standalone organiser
  const organiserLogoUrl = tournament.series_info?.organiser_logo_url ?? tournament.organiser_info?.logo_url ?? null;
  const organiserName    = tournament.series_info?.organiser ?? tournament.organiser_info?.name ?? null;
  // Only show venue logo when there's no organiser logo and the URLs aren't the same
  const _venueLogoUrl    = tournament.venue_info?.logo_url ?? null;
  const venueLogoUrl     = (!organiserLogoUrl && _venueLogoUrl) ? _venueLogoUrl
                         : (organiserLogoUrl && _venueLogoUrl && _venueLogoUrl !== organiserLogoUrl) ? _venueLogoUrl
                         : null;
  // Single badge for banner overlay: always organiser first, then venue only if distinct
  const bannerBadgeUrl   = organiserLogoUrl ?? venueLogoUrl;

  return (
    <>
    <View style={[styles.officialCard, { backgroundColor: colors.bg.primary, borderColor: starred ? STAR_COLOR + "60" : colors.border.default }]}>
      {/* Full-width banner image with logo badges */}
      {hasBanner && (
        <View style={{ position: "relative" }}>
          <Image source={{ uri: bannerUrl! }} style={{ width: "100%", height: 120 }} resizeMode="cover" />
          {/* Single logo badge at bottom-left of banner: organiser takes priority */}
          {bannerBadgeUrl && (
            <View style={{ position: "absolute", bottom: -16, left: 14, width: 34, height: 34, borderRadius: 8, backgroundColor: colors.bg.primary, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3, overflow: "hidden" }}>
              <Image source={{ uri: bannerBadgeUrl }} style={{ width: 34, height: 34 }} resizeMode="contain" />
            </View>
          )}
        </View>
      )}

      {/* Name row */}
      <View style={[styles.officialCardTop, !hasBanner && { paddingTop: 14 }, hasBanner && { paddingTop: bannerBadgeUrl ? 22 : 12 }]}>
        {!hasBanner && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {/* Organiser logo */}
            <View style={[styles.seriesLogoPlaceholder, {
              backgroundColor: organiserLogoUrl ? colors.bg.secondary : BRAND + "18",
              overflow: "hidden",
            }]}>
              {organiserLogoUrl ? (
                <Image source={{ uri: organiserLogoUrl }} style={{ width: 36, height: 36 }} resizeMode="contain" />
              ) : (
                <Ionicons name="trophy" size={18} color={BRAND} />
              )}
            </View>
            {/* Venue logo — only show if different from organiser */}
            {venueLogoUrl && (
              <View style={[styles.seriesLogoPlaceholder, { backgroundColor: colors.bg.secondary, overflow: "hidden" }]}>
                <Image source={{ uri: venueLogoUrl }} style={{ width: 36, height: 36 }} resizeMode="contain" />
              </View>
            )}
          </View>
        )}
        <View style={{ flex: 1 }}>
          {organiserName ? (
            <Text style={[styles.officialSeries, { color: colors.text.tertiary, fontSize: 11 }]}>{organiserName.toUpperCase()}</Text>
          ) : null}
          {!hideSeriesName && tournament.series_info?.name ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <Text style={[styles.officialSeries, { color: BRAND }]}>{tournament.series_info.name}</Text>
              <View style={{ backgroundColor: BRAND + "15", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: BRAND, letterSpacing: 0.4 }}>SERIES</Text>
              </View>
            </View>
          ) : null}
          <Text style={[styles.officialName, { color: colors.text.primary }]} numberOfLines={2}>{tournament.name}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isOwner && (onEditOwn || onUnpublishOwn || onDeleteOwn) && (
            <TouchableOpacity
              onPress={() => setOwnerSheetVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.iconBtn, { backgroundColor: colors.bg.secondary }]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
          <View style={{ alignItems: "center", gap: 0 }}>
            <TouchableOpacity
              onPress={handleStar}
              style={[styles.officialStarBtn, starred && { backgroundColor: STAR_COLOR + "18" }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={starred ? "star" : "star-outline"} size={22} color={starred ? STAR_COLOR : colors.text.tertiary} />
            </TouchableOpacity>
            {!starred && (
              <Text style={{ fontSize: 9, color: colors.text.disabled, textAlign: "center", maxWidth: 48, marginTop: -4 }}>
                Tap to save
              </Text>
            )}
          </View>
        </View>
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
        <TouchableOpacity
          activeOpacity={tournament.venue_info?.lat ? 0.6 : 1}
          onPress={() => {
            const v = tournament.venue_info;
            if (!v?.lat || !v?.lng) return;
            const label = encodeURIComponent(v.name);
            const url = Platform.OS === "ios"
              ? `maps://?q=${label}&ll=${v.lat},${v.lng}`
              : `geo:${v.lat},${v.lng}?q=${label}`;
            Linking.openURL(url).catch(() => {});
          }}
          style={styles.officialDetailItem}
        >
          <Ionicons name="location-outline" size={13} color={tournament.venue_info?.lat ? BRAND : colors.text.tertiary} />
          <Text style={[styles.officialDetailText, { color: tournament.venue_info?.lat ? BRAND : colors.text.secondary }]} numberOfLines={1}>
            {tournament.venue_info?.address
              ? `${tournament.venue_info.address}, ${tournament.city}`
              : `${tournament.venue_info?.name ?? tournament.venue_name ?? ""}${tournament.city ? `, ${tournament.city}` : ""}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pills */}
      <View style={styles.officialPillsRow}>
        {tournament.buy_in != null && (
          <View style={[styles.officialPill, { backgroundColor: colors.bg.tertiary }]}>
            <Text style={[styles.officialPillText, { color: colors.text.primary }]}>${tournament.buy_in.toLocaleString()} buy-in</Text>
          </View>
        )}
        {tournament.guarantee != null && (
          <View style={[styles.officialPill, { backgroundColor: "#22C55E18" }]}>
            <Text style={[styles.officialPillText, { color: "#16A34A" }]}>${tournament.guarantee.toLocaleString()} GTD</Text>
          </View>
        )}
        {tournament.format ? (
          <View style={[styles.officialPill, { backgroundColor: colors.bg.tertiary }]}>
            <Text style={[styles.officialPillText, { color: colors.text.secondary }]}>{tournament.format}</Text>
          </View>
        ) : null}
        {lateReg ? (
          <View style={[styles.officialPill, { backgroundColor: "#F9731618" }]}>
            <Text style={[styles.officialPillText, { color: "#EA580C" }]}>{lateReg}</Text>
          </View>
        ) : null}
      </View>

      {/* Full-card toast overlay */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          opacity: toastOpacity,
          transform: [{ translateY: toastTranslateY }],
          backgroundColor: toastMessage.startsWith("Added") ? STAR_COLOR : "#64748B",
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Ionicons
          name={toastMessage.startsWith("Added") ? "star" : "star-outline"}
          size={13}
          color="#fff"
        />
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{toastMessage}</Text>
      </Animated.View>

    </View>
    <CardActionsSheet
      visible={ownerSheetVisible}
      title={tournament.name}
      onClose={() => setOwnerSheetVisible(false)}
      actions={[
        ...(onEditOwn ? [{ icon: "create-outline" as const, label: "Edit Tournament", iconColor: BRAND, onPress: onEditOwn }] : []),
        ...(onUnpublishOwn ? [{ icon: "eye-off-outline" as const, label: "Unpublish", iconColor: "#F97316",
          onPress: () => Alert.alert("Unpublish Tournament", `Move "${tournament.name}" back to pending? It will be removed from the public directory until re-approved.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Unpublish", style: "destructive", onPress: onUnpublishOwn },
          ]) }] : []),
        ...(onDeleteOwn ? [{ icon: "trash-outline" as const, label: "Delete Tournament", destructive: true,
          onPress: () => Alert.alert("Delete Tournament", `Remove "${tournament.name}"? This cannot be undone.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: onDeleteOwn },
          ]) }] : []),
      ]}
    />
    <SignInSheet
      visible={starSignInVisible}
      onClose={() => setStarSignInVisible(false)}
      icon="star-outline"
      title="Save to Your Schedule"
      description="Sign in to add tournaments to your schedule and track upcoming events."
    />
  </>
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

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        {/* Nav header */}
        <View style={[styles.filterNavBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity style={{ width: 72 }} onPress={onClose}>
            <Text style={{ fontSize: 16, color: BRAND }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.filterNavTitle, { color: colors.text.primary }]}>Buy Stake</Text>
          <View style={{ width: 72 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
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
        </ScrollView>
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
        <View style={[styles.communityCard, { backgroundColor: colors.bg.primary, borderColor: "#0891B230", flexDirection: "column", padding: 0, overflow: "hidden" }]}>
          {/* Author header */}
          {AuthorRow}
          <View style={[styles.officialDivider, { backgroundColor: colors.border.subtle, marginHorizontal: 12 }]} />

          <View style={{ padding: 12, gap: 10 }}>
            {/* Type label */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="people" size={13} color="#0891B2" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#0891B2" }}>Selling Tournament Action</Text>
            </View>

            {/* Tournament name */}
            <Text style={[styles.communityName, { color: colors.text.primary }]}>{post.session_name || "Tournament"}</Text>

            {/* Pills */}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <View style={[styles.officialPill, { backgroundColor: "#0891B212" }]}>
                <Text style={[styles.officialPillText, { color: "#0891B2" }]}>Selling {stakeDeal.pct}%</Text>
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
                <View style={[styles.officialPill, { backgroundColor: colors.bg.tertiary }]}>
                  <Text style={[styles.officialPillText, { color: colors.text.secondary }]}>Buy-in: {stakeDeal.buyin}</Text>
                </View>
              )}
              {stakeDeal.price && (
                <View style={[styles.officialPill, { backgroundColor: colors.bg.tertiary }]}>
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
                <View style={{ width: `${Math.min(soldPct, 100)}%`, height: "100%", backgroundColor: "#0891B2", borderRadius: 3 }} />
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
                  style={{ backgroundColor: "#0891B2", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>BUY</Text>
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
  event, colors, onDelete, onShare, onShareStake, onCalendarSync, onCalendarRemove, calendarAdded, onSellStakes, showDate, past,
}: {
  event: TournamentEvent;
  colors: any;
  onDelete: () => void;
  onShare: () => void;
  onShareStake: () => void;
  onCalendarSync: () => void;
  onCalendarRemove?: () => void;
  calendarAdded?: boolean;
  onSellStakes: () => void;
  showDate?: boolean;
  past?: boolean;
}) {
  const { user: evtUser } = useAuth();
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [stakeSignInVisible, setStakeSignInVisible] = useState(false);
  const hasImage      = !!event.image_url;
  const hasActiveDeal = !!event.stake_deal_id;

  function handleShareAction(action: () => void) {
    setShowShareSheet(false);
    setTimeout(action, 300);
  }

  function handleSellStakesGuarded() {
    if (!evtUser?.id) { setStakeSignInVisible(true); return; }
    onSellStakes();
  }

  function handleAdvertiseGuarded() {
    if (!evtUser?.id) { setShowShareSheet(false); setTimeout(() => setStakeSignInVisible(true), 300); return; }
    handleShareAction(onShareStake);
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

          {/* Right side: Sell Stakes chip + icons (bottom-aligned) */}
          <View style={{ alignItems: "flex-end", justifyContent: "space-between", alignSelf: "stretch" }}>
            {!past && (
              <TouchableOpacity
                onPress={handleSellStakesGuarded}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 9, paddingVertical: 5,
                  borderRadius: 20, borderWidth: 1,
                  backgroundColor: "#0891B214",
                  borderColor: "#0891B2",
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="storefront-outline" size={12} color="#0891B2" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#0891B2" }}>
                  {hasActiveDeal ? "Manage Deal" : "SELL"}
                </Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {/* More actions */}
              <TouchableOpacity
                onPress={() => setShowShareSheet(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.iconBtn, { backgroundColor: colors.bg.secondary }]}
              >
                <Ionicons name="ellipsis-horizontal" size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <SignInSheet
        visible={stakeSignInVisible}
        onClose={() => setStakeSignInVisible(false)}
        icon="storefront-outline"
        title="Staking Marketplace"
        description="Sign in to sell poker action and advertise stake deals to the community."
      />
      <CardActionsSheet
        visible={showShareSheet}
        title={event.name}
        onClose={() => setShowShareSheet(false)}
        actions={[
          ...(!past ? [{
            icon: (calendarAdded ? "checkmark-circle-outline" : "calendar-outline") as any,
            label: calendarAdded ? "Added to Calendar" : "Add to Calendar",
            iconColor: "#22C55E",
            onPress: calendarAdded
              ? () => Alert.alert("Remove from Calendar", "Remove this tournament from your device calendar?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => { setShowShareSheet(false); setTimeout(() => onCalendarRemove?.(), 300); } },
                ])
              : onCalendarSync,
          }] : []),
          ...(!past && !hasActiveDeal ? [{ icon: "people-outline" as const, label: "Post on Community", iconColor: BRAND, onPress: onShare }] : []),
          {
            icon: "share-outline" as const,
            label: "Share Tournament",
            iconColor: "#8B5CF6",
            onPress: () => {
              setShowShareSheet(false);
              const date = new Date(event.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
              const lines = [
                `🃏 ${event.name}`,
                `📅 ${date}`,
                event.venue ? `📍 ${event.venue}` : null,
                event.buyin ? `💰 Buy-in: ${event.buyin}` : null,
                `\nTracking this on Stakemate – the poker staking app\nhttps://stakemate.com.au`,
              ].filter(Boolean).join("\n");
              Share.share({ message: lines });
            },
          },
          {
            icon: "star-outline" as const,
            label: event.source === "directory" ? "Remove from Schedule" : "Delete",
            destructive: true,
            onPress: onDelete,
          },
        ]}
      />
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
        stake_deal_id: event.stake_deal_id || null,
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

  const vis = friendsOnly ? "friends" : "public";

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.shareTmNavHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
        <TouchableOpacity style={styles.shareTmNavSide} onPress={onClose}>
          <Text style={[styles.shareTmNavCancel, { color: BRAND }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.shareTmNavTitle, { color: colors.text.primary }]}>Post to Community</Text>
        <View style={styles.shareTmNavSide} />
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.shareTournamentCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <View style={[styles.shareTournamentBadge, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
            <Ionicons name="trophy" size={18} color="#0891B2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.shareTournamentName, { color: colors.text.primary }]}>{event.name}</Text>
            <Text style={[styles.shareTournamentMeta, { color: colors.text.tertiary }]}>{formattedDate}</Text>
            {!!event.venue && <Text style={[styles.shareTournamentMeta, { color: colors.text.tertiary }]}>{event.venue}</Text>}
            {!!event.buyin && <Text style={[styles.shareTournamentMeta, { color: colors.text.tertiary }]}>Buy-in: {event.buyin}</Text>}
          </View>
        </View>

        <TextInput
          style={[styles.input, styles.inputMulti, { backgroundColor: colors.bg.secondary, color: colors.text.primary, borderColor: colors.border.default, marginTop: 14 }]}
          placeholder="Add a caption… (optional)"
          placeholderTextColor={colors.text.tertiary}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={300}
          returnKeyType="done"
        />

        <Text style={[styles.shareTmSectionLabel, { color: colors.text.tertiary }]}>AUDIENCE</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          {([ ["public", "globe-outline", "Public"] , ["friends", "people-outline", "Followers Only"] ] as const).map(([val, icon, label]) => (
            <TouchableOpacity
              key={val}
              onPress={() => setFriendsOnly(val === "friends")}
              activeOpacity={0.8}
              style={[
                styles.shareTmVisBtn,
                {
                  borderColor: vis === val ? BRAND : colors.border.default,
                  backgroundColor: vis === val ? `${BRAND}14` : colors.bg.secondary,
                },
              ]}
            >
              <Ionicons name={icon} size={14} color={vis === val ? BRAND : colors.text.secondary} />
              <Text style={[styles.shareTmVisBtnText, { color: vis === val ? BRAND : colors.text.primary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: BRAND }, posting && { opacity: 0.6 }]}
          onPress={handleShare}
          disabled={posting}
          activeOpacity={0.88}
        >
          <Ionicons name={friendsOnly ? "people" : "earth"} size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.saveBtnText}>{posting ? "Sharing…" : friendsOnly ? "Post to Followers" : "Share to Community"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  animHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },

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

  // Shared pageSheet nav bar — iOS standard spacing
  shareTmNavHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shareTmNavSide: { width: 72 },
  shareTmNavTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  shareTmNavCancel: { fontSize: 16 },

  // Filter modal styles
  filterNavBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterNavTitle: { fontSize: 17, fontWeight: "700" },
  filterSectionLabel: {
    fontSize: 12, fontWeight: "600", letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8,
  },
  filterGroup: {
    marginHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  filterRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
  },
  filterRowLabel: { fontSize: 16 },
  shareTmSectionLabel: {
    fontSize: 11, fontWeight: "600", letterSpacing: 0.5,
    marginTop: 20, marginBottom: 10,
  },
  shareTmVisBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
  },
  shareTmVisBtnText: { fontSize: 13, fontWeight: "600" },

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
  stateChipsAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
    borderRadius: 12, borderWidth: 1.5, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
    borderRadius: 12, borderWidth: 1.5, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
