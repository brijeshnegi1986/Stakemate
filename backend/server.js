require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY is not set. /api/analyze will return 500.");
}

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "PokerTracker AI Proxy", keySet: !!ANTHROPIC_API_KEY });
});

app.post("/api/analyze", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }

  const { userMessage } = req.body;
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }

  const systemPrompt = `You are an expert No-Limit Hold'em poker coach. Analyze the hand provided and return ONLY a valid JSON object with no markdown, no explanation outside the JSON. Use this exact shape:
{"preflop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"A"},"flop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"B"},"turn":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"C"},"river":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"D"},"summary":"Overall hand summary in 2-3 sentences"}
Only include streets that were actually played. Grades: A = excellent, B = good, C = marginal, D = mistake.`;

  try {
    console.log("Calling Anthropic API...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const responseText = await response.text();
    console.log("Anthropic status:", response.status);

    if (!response.ok) {
      console.error("Anthropic error body:", responseText);
      let errMsg = `Anthropic API error ${response.status}`;
      try { errMsg = JSON.parse(responseText)?.error?.message ?? errMsg; } catch (_) {}
      return res.status(response.status).json({ error: errMsg });
    }

    const data = JSON.parse(responseText);
    const text = data.content?.[0]?.text ?? "";
    console.log("Anthropic response received, length:", text.length);
    res.json({ text });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

app.post("/api/enhance-notes", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }
  const { notes, sessionContext } = req.body;
  if (!notes || typeof notes !== "string") {
    return res.status(400).json({ error: "notes is required" });
  }
  const systemPrompt = `You are an expert No-Limit Hold'em poker coach helping a player maintain a professional session journal.

Your job is to rewrite raw session notes using precise poker language and clear structure, exactly as a seasoned coach would write them. If the notes describe a specific hand, also include a brief hand analysis section.

TERMINOLOGY to apply wherever relevant:
- Actions: open-raise, iso-raise, 3-bet, 4-bet, cold-call, overcall, squeeze, limp, complete, check-raise, donk-bet, probe-bet, x/r (check-raise), x/c (check-call), x/f (check-fold)
- Bets: c-bet (continuation bet), double barrel, triple barrel, delayed c-bet, overbet, pot-sized bet, half-pot, blocker bet, value bet, thin value, bluff, semi-bluff, air, merge bet
- Positions: UTG, UTG+1, MP, HJ (hijack), CO (cutoff), BTN (button), SB, BB
- Stack/pot: effective stack, SPR (stack-to-pot ratio), pot odds, implied odds, reverse implied odds, BB (big blind)
- Concepts: range advantage, nut advantage, equity, EV (expected value), +EV, -EV, fold equity, polarised range, merged range, capped range, protection bet, tilt, going on tilt, cooler, bad beat, set-mining, flopped the nuts, combo draw, OESD (open-ended straight draw), gutshot, backdoor, blockers, ICM, chip EV
- Board textures: dry, wet, coordinated, rainbow, monotone, paired board, broadway cards, low connected
- Cards: use shorthand notation (Ah=Ace of hearts, Kd=King of diamonds, Ts=Ten of spades, 2c=Two of clubs)

RULES:
- Rewrite in professional poker coaching language — do not use casual or vague phrasing
- Convert informal descriptions into correct poker terms (e.g. "bet big" → "pot-sized overbet", "had good cards" → "held top pair top kicker", "he kept betting" → "fired triple barrel")
- Always use card shorthand notation: Ah Kd Qs Jc Tc 9h etc.
- Preserve every fact from the original — hand values, amounts, positions, outcomes
- Amounts: keep dollar amounts as-is but add BB equivalent in brackets where helpful, e.g. "$20 (10BB)"
- Use bullet points for multiple hands or observations; use section headers (Key Hands:, Leaks:, Adjustments:, Mental Game:) only when content clearly falls into distinct topics
- If the notes describe a specific hand, add a "Hand Analysis:" section at the end with:
  • Result: [Won/Lost] — the outcome
  • Decision Quality: [Excellent/Good/Marginal/Mistake] — overall assessment
  • Key Decision: the most important decision point in the hand
  • Reasoning: why that decision was correct or incorrect based on poker theory
  • Improvement: one specific thing to do differently next time (if applicable)
- Do NOT invent content, add opinions not implied, or pad the length
- Return ONLY the rewritten notes — no preamble, no explanation, no markdown code fences`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: `Session: ${sessionContext || "N/A"}\n\nNotes to improve:\n${notes}` }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `Anthropic API error ${response.status}`;
      try { errMsg = JSON.parse(errText)?.error?.message ?? errMsg; } catch (_) {}
      return res.status(response.status).json({ error: errMsg });
    }
    const data = await response.json();
    const enhanced = data.content?.[0]?.text ?? notes;
    res.json({ enhanced });
  } catch (err) {
    console.error("enhance-notes error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`PokerTracker AI proxy running on port ${PORT}`);
  console.log(`API key set: ${!!ANTHROPIC_API_KEY}`);
});
