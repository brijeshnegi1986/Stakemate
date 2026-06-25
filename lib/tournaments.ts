import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VenueInfo = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  address: string | null;
  suburb: string | null;
  city: string;
  state: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
};

export type SeriesInfo = {
  id: string;
  name: string;
  organiser: string | null;
  organiser_logo_url: string | null;
  banner_url: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  website_url: string | null;
};

export type OrganiserInfo = {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  state: string | null;
};

export type TournamentType = "series" | "regular" | "weekly";

export type OfficialTournament = {
  id: string;
  type: TournamentType;
  name: string;
  series_id: string | null;
  series_info: SeriesInfo | null;
  organiser_id: string | null;
  organiser_info: OrganiserInfo | null;
  venue_id: string | null;
  venue_info: VenueInfo | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  tournament_date: string;
  tournament_time: string | null;
  late_reg_end: string | null;
  buy_in: number | null;
  guarantee: number | null;
  format: string | null;
  structure: string | null;
  recurrence: string | null;
  banner_url: string | null;
  website_url: string | null;
  notes: string | null;
  status: "approved" | "pending";
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Venues ───────────────────────────────────────────────────────────────────

export async function fetchVenues(state?: string): Promise<VenueInfo[]> {
  let query = supabase.from("venues").select("*").order("name");
  if (state) query = query.eq("state", state);
  const { data } = await query;
  return (data ?? []) as VenueInfo[];
}

// ─── Series ───────────────────────────────────────────────────────────────────

export async function fetchSeries(): Promise<SeriesInfo[]> {
  const { data } = await supabase
    .from("series")
    .select("id, name, organiser, organiser_logo_url, banner_url, start_date, end_date, city, state, website_url")
    .order("start_date", { ascending: true });
  return (data ?? []) as SeriesInfo[];
}

export async function fetchTournamentsBySeries(seriesId: string): Promise<OfficialTournament[]> {
  const { data, error } = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT)
    .eq("series_id", seriesId)
    .eq("status", "approved")
    .order("tournament_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OfficialTournament[];
}

// ─── Tournaments ──────────────────────────────────────────────────────────────

const TOURNAMENT_SELECT = `
  *,
  venue_info:venues(id, name, slug, logo_url, address, suburb, city, state, postcode, lat, lng, website),
  series_info:series(id, name, organiser, organiser_logo_url, banner_url, start_date, end_date, city, state, website_url),
  organiser_info:organisers(id, name, logo_url, website_url, state)
`.trim();

export async function fetchOfficialTournaments({
  state,
  search,
}: {
  state?: string;
  search?: string;
} = {}): Promise<OfficialTournament[]> {
  let query = supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT)
    .eq("status", "approved")
    .gte("tournament_date", new Date().toISOString().split("T")[0])
    .order("tournament_date", { ascending: true });

  if (state) query = query.eq("state", state);

  if (search?.trim()) {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as OfficialTournament[];
}

export async function fetchMyPendingSubmissions(
  userId: string
): Promise<OfficialTournament[]> {
  const { data, error } = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT)
    .eq("submitted_by", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as OfficialTournament[];
}

// ─── Submit / Edit / Delete ───────────────────────────────────────────────────

export type SubmitTournamentInput = {
  userId: string;
  type: TournamentType;
  name: string;
  tournament_date: string;
  series_id?: string | null;
  venue_id?: string | null;
  venue_name?: string | null;
  city?: string | null;
  state?: string | null;
  tournament_time?: string | null;
  late_reg_end?: string | null;
  buy_in?: number | null;
  guarantee?: number | null;
  format?: string | null;
  structure?: string | null;
  recurrence?: string | null;
  banner_url?: string | null;
  website_url?: string | null;
  notes?: string | null;
};

export async function submitTournamentToDirectory(
  input: SubmitTournamentInput
): Promise<OfficialTournament> {
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      type:             input.type,
      name:             input.name,
      tournament_date:  input.tournament_date,
      series_id:        input.series_id        ?? null,
      venue_id:         input.venue_id         ?? null,
      venue_name:       input.venue_name       ?? null,
      city:             input.city             ?? null,
      state:            input.state            ?? null,
      tournament_time:  input.tournament_time  ?? null,
      late_reg_end:     input.late_reg_end     ?? null,
      buy_in:           input.buy_in           ?? null,
      guarantee:        input.guarantee        ?? null,
      format:           input.format           ?? null,
      structure:        input.structure        ?? null,
      recurrence:       input.recurrence       ?? null,
      banner_url:       input.banner_url        ?? null,
      website_url:      input.website_url      ?? null,
      notes:            input.notes            ?? null,
      status:           "pending",
      submitted_by:     input.userId,
    })
    .select(TOURNAMENT_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as OfficialTournament;
}

export async function updateMyTournament(
  tournamentId: string,
  input: Partial<SubmitTournamentInput>
): Promise<OfficialTournament> {
  const patch: Record<string, any> = { status: "pending" };
  if (input.type             !== undefined) patch.type             = input.type;
  if (input.name             !== undefined) patch.name             = input.name;
  if (input.tournament_date  !== undefined) patch.tournament_date  = input.tournament_date;
  if (input.series_id        !== undefined) patch.series_id        = input.series_id;
  if (input.venue_id         !== undefined) patch.venue_id         = input.venue_id;
  if (input.venue_name       !== undefined) patch.venue_name       = input.venue_name;
  if (input.city             !== undefined) patch.city             = input.city;
  if (input.state            !== undefined) patch.state            = input.state;
  if (input.tournament_time  !== undefined) patch.tournament_time  = input.tournament_time;
  if (input.late_reg_end     !== undefined) patch.late_reg_end     = input.late_reg_end;
  if (input.buy_in           !== undefined) patch.buy_in           = input.buy_in;
  if (input.guarantee        !== undefined) patch.guarantee        = input.guarantee;
  if (input.format           !== undefined) patch.format           = input.format;
  if (input.structure        !== undefined) patch.structure        = input.structure;
  if (input.recurrence       !== undefined) patch.recurrence       = input.recurrence;
  if (input.banner_url        !== undefined) patch.banner_url       = input.banner_url;
  if (input.website_url      !== undefined) patch.website_url      = input.website_url;
  if (input.notes            !== undefined) patch.notes            = input.notes;

  const { data, error } = await supabase
    .from("tournaments")
    .update(patch)
    .eq("id", tournamentId)
    .select(TOURNAMENT_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as OfficialTournament;
}

export async function deleteMyTournament(tournamentId: string): Promise<void> {
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);
  if (error) throw error;
}

export async function unpublishMyTournament(tournamentId: string): Promise<void> {
  const { error } = await supabase
    .from("tournaments")
    .update({ status: "pending" })
    .eq("id", tournamentId);
  if (error) throw error;
}

export async function deleteSeriesTournaments(seriesId: string): Promise<void> {
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("series_id", seriesId);
  if (error) throw error;
}

export async function unpublishSeriesTournaments(seriesId: string): Promise<void> {
  const { error } = await supabase
    .from("tournaments")
    .update({ status: "pending" })
    .eq("series_id", seriesId);
  if (error) throw error;
}

export async function deleteMySubmission(tournamentId: string): Promise<void> {
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId)
    .eq("status", "pending");
  if (error) throw error;
}
