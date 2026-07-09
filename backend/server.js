require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const app  = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY is not set.");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — AI Hand Review usage caps cannot be enforced.");
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Stakemate AI Proxy", keySet: !!ANTHROPIC_API_KEY });
});

// ── AI Hand Review usage cap ──────────────────────────────────────────────────
// Elite: unlimited. Pro: HAND_REVIEW_MONTHLY_LIMIT / calendar month. Free: blocked.
//
// NOTE ON TRUST: subscription_tier on `profiles` is set client-side by the app
// after a successful IAP purchase (see SubscriptionContext.tsx) — it is not
// verified against Apple/Google server receipts here. A user could in theory
// edit their own profile row to claim a higher tier. This is a pre-existing gap
// (no part of this app currently does real server-side receipt validation); this
// cap improves on the status quo by requiring a genuine authenticated Supabase
// user and tracking real per-user usage, but it is not abuse-proof against a
// user willing to tamper with their own account data.
const HAND_REVIEW_MONTHLY_LIMIT = 20;
const HAND_REVIEW_FEATURE = "hand_review";

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function authenticate(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function getSubscriptionTier(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();
  if (error || !data) return "free";
  return data.subscription_tier ?? "free";
}

// Returns { allowed, count, limit } and increments the counter when allowed.
async function checkAndIncrementUsage(userId, feature, limit) {
  const period = currentPeriod();
  const { data: existing } = await supabaseAdmin
    .from("ai_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("period", period)
    .maybeSingle();

  const count = existing?.count ?? 0;
  if (count >= limit) return { allowed: false, count, limit };

  await supabaseAdmin
    .from("ai_usage")
    .upsert(
      { user_id: userId, feature, period, count: count + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,feature,period" }
    );

  return { allowed: true, count: count + 1, limit };
}

// ── Hand analysis ─────────────────────────────────────────────────────────────

app.post("/api/analyze", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server is not configured for authenticated requests." });
  }

  const { userMessage } = req.body;
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }

  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "Sign in to use AI Hand Review." });
  }

  const tier = await getSubscriptionTier(user.id);
  if (tier !== "pro" && tier !== "elite") {
    return res.status(403).json({ error: "subscription_required", message: "AI Hand Review requires a Pro or Elite subscription." });
  }

  let usage = null;
  if (tier === "pro") {
    usage = await checkAndIncrementUsage(user.id, HAND_REVIEW_FEATURE, HAND_REVIEW_MONTHLY_LIMIT);
    if (!usage.allowed) {
      return res.status(429).json({
        error: "cap_exceeded",
        message: `You've used all ${HAND_REVIEW_MONTHLY_LIMIT} AI Hand Reviews included with Pro this month. Upgrade to Elite for unlimited reviews, or check back next month.`,
        usage,
      });
    }
  }

  const systemPrompt = `You are an expert No-Limit Hold'em poker coach. Analyze the hand provided and return ONLY a valid JSON object — no markdown fences, no text before or after the JSON. Use this exact shape:
{"preflop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"A"},"flop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"B"},"turn":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"C"},"river":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"D"},"summary":"Overall hand summary in 2-3 sentences"}
Only include streets that were actually played. Keep each field under 60 words. Grades: A = excellent, B = good, C = marginal, D = mistake.`;

  try {
    console.log("Calling Anthropic API (analyze)...");
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content?.[0]?.text ?? "";
    console.log("Analyze response length:", text.length);
    res.json({ text, usage: tier === "pro" ? usage : { allowed: true, count: null, limit: null } });
  } catch (err) {
    console.error("analyze error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ── Hand compression ──────────────────────────────────────────────────────────

app.post("/api/compress-hand", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }

  const { notes } = req.body;
  if (!notes || typeof notes !== "string") {
    return res.status(400).json({ error: "notes is required" });
  }

  const systemPrompt = `You are a poker hand compression assistant. Convert the player's hand description into compact, readable poker notation. Be concise but use clear labels so anyone can read it at a glance.

NOTATION RULES:
- Positions: UTG / UTG+1 / MP / HJ / CO / BTN / SB / BB
- Hands: AKo (offsuit), AKs (suited), TT (pairs), T = Ten
- Actions — always write the full word followed by a colon and the amount, no extra spaces:
  "Raise: $X", "Call: $X", "Check", "Fold", "All-in: $X"
  "3-bet: $X", "4-bet: $X", "C-bet: $X", "Check-raise: $X"
- Board cards: use shorthand Ah Kd Ts 2c — note texture in brackets e.g. (rainbow) (two-suited) (monotone)
- Format each street on its own line with a label:
  Preflop: ...
  Flop (Xh Yd Zc): ...
  Turn (Xh): ...
  River (Xh): ...
  Result: Won $X / Lost $X
- Stack and pot sizes: use $ amounts

RULES:
- Every action must be readable without a legend — no single-letter codes
- Preserve all key facts: positions, hand, board, bet sizes, outcome
- If the input is already in this format or is not a hand description, return it unchanged
- Return ONLY the compressed hand — no explanation, no preamble`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: notes }],
    });
    const compressed = message.content?.[0]?.text ?? notes;
    res.json({ compressed });
  } catch (err) {
    console.error("compress-hand error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ── Brochure scan ─────────────────────────────────────────────────────────────

app.post("/api/scan-brochure", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return res.status(400).json({ error: "imageBase64 is required" });
  }

  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const isPDF = mediaType === "application/pdf";
  const type  = isPDF ? "application/pdf" : (allowedImageTypes.includes(mediaType) ? mediaType : "image/jpeg");

  const systemPrompt = `You are a poker tournament data extraction assistant. The user will send you an image or PDF of a poker tournament brochure, schedule, or flyer. Extract every tournament listed and return ONLY a valid JSON array — no markdown, no explanation, nothing outside the JSON.

Each item in the array must have this exact shape:
{
  "name": "Tournament name (string, required)",
  "date": "YYYY-MM-DD (string, required — if only month/day is visible use current year; if date is unclear omit the tournament)",
  "venue": "Venue or casino name (string or null)",
  "buyIn": "Buy-in amount as a string e.g. '$550' (string or null)",
  "series": "Series name if part of a series e.g. 'WSOP Circuit' (string or null)",
  "description": "Any additional info: guarantees, starting stack, blind levels, re-entry rules (string or null)"
}

Rules:
- Only include tournaments with a readable date
- If a series name appears at the top of the brochure, apply it to all events
- Normalise dates to YYYY-MM-DD using the current year if only day/month shown
- Return [] if no tournaments are found`;

  try {
    console.log("Scanning brochure, type:", type);
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            isPDF
              ? { type: "document", source: { type: "base64", media_type: type, data: imageBase64 } }
              : { type: "image",    source: { type: "base64", media_type: type, data: imageBase64 } },
            { type: "text", text: "Extract all poker tournaments from this brochure and return them as a JSON array." },
          ],
        },
      ],
    });

    const text  = (message.content?.[0]?.text ?? "").trim();
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let tournaments;
    try {
      tournaments = JSON.parse(clean);
      if (!Array.isArray(tournaments)) tournaments = [];
    } catch (_) {
      console.error("Failed to parse Claude response:", clean.slice(0, 200));
      return res.status(422).json({ error: "Could not parse tournament data from image. Try a clearer photo." });
    }

    console.log(`Extracted ${tournaments.length} tournaments`);
    res.json({ tournaments });
  } catch (err) {
    console.error("scan-brochure error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Stakemate AI proxy running on port ${PORT}`);
  console.log(`API key set: ${!!ANTHROPIC_API_KEY}`);
});
