require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY is not set in environment variables.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "PokerTracker AI Proxy" });
});

// Hand analysis endpoint
app.post("/api/analyze", async (req, res) => {
  const { userMessage } = req.body;

  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }

  const systemPrompt = `You are an expert No-Limit Hold'em poker coach. Analyze the hand provided and return ONLY a valid JSON object with no markdown, no explanation outside the JSON. Use this exact shape:
{"preflop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"A"},"flop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"B"},"turn":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"C"},"river":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"D"},"summary":"Overall hand summary in 2-3 sentences"}
Only include streets that were actually played. Grades: A = excellent, B = good, C = marginal, D = mistake.`;

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
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Anthropic error:", err);
      return res.status(response.status).json({
        error: err?.error?.message ?? `Anthropic API error ${response.status}`,
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    res.json({ text });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`PokerTracker AI proxy running on port ${PORT}`);
});
