---

# Poker Tracker App (MVP)

## 🎯 Goal
Build a simple, fast, mobile-first poker session tracker for live cash players.

Target users:
- $1/$1, $2/$3 live players
- Recreational to semi-serious grinders

Core value:
- Track sessions in under 10 seconds
- See profit/loss clearly
- Build awareness of hourly rate + bankroll

---

## 🧩 Core Features (MVP ONLY)

### 1. Add Session
Fields:
- Date (default: today)
- Location (optional)
- Game type (Cash only for MVP)
- Stakes (e.g. 1/1, 2/3)
- Buy-in ($)
- Cash-out ($)
- Duration (hours)

Auto-calculate:
- Profit/Loss = cash-out - buy-in
- Hourly rate

---

### 2. Dashboard
- Total profit/loss
- Total hours played
- Average hourly rate
- Number of sessions

---

### 3. Session List
- Chronological list
- Each item shows:
  - Date
  - Stakes
  - Profit/Loss (color coded)

---

### 4. Basic Graph
- Profit over time (line chart)

---

## ❌ NOT INCLUDED (for MVP)
- Tournaments
- Hand tracking
- HUD features
- Social features
- AI analysis
- Cloud sync (optional later)

---

## 💰 Monetisation
- Free: up to 20 sessions
- Premium:
  - Unlimited sessions
  - Graphs
  - Stats

Pricing:
- $4.99/month
- $29/year

---

## 🧱 Data Model

Session:
- id
- date
- location
- stakes
- buyIn
- cashOut
- duration
- profit (derived)

---

## 📱 UX Principles
- Add session in <10 seconds
- Minimal inputs
- Clean, dark-mode friendly
- One-thumb usability

---

## 🚀 Future Features (NOT NOW)
- Bankroll tracking
- Multi-currency
- Cloud sync
- Insights (“You play worse after 5 hours”)
- Staking integration (ties into StakeMate later)
