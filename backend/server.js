require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app  = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY is not set.");
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Stakemate AI Proxy", keySet: !!ANTHROPIC_API_KEY });
});

// ── Hand analysis ─────────────────────────────────────────────────────────────

app.post("/api/analyze", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }

  const { userMessage } = req.body;
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
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
    res.json({ text });
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
