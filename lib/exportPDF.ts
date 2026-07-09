import { getSessions } from "@/db/database";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

async function getLogoDataUri(): Promise<string> {
  const asset = Asset.fromModule(require("@/assets/images/stakemate-logo_dark.png"));
  await asset.downloadAsync();
  const base64 = await new File(asset.localUri ?? asset.uri).base64();
  return `data:image/png;base64,${base64}`;
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-" : "+") + "$" + str;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDuration(h: number): string {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export async function exportSessionsPDF(): Promise<void> {
  const sessions = getSessions();

  const totalProfit   = sessions.reduce((s, x) => s + x.profit, 0);
  const totalHours    = sessions.reduce((s, x) => s + (x.duration ?? 0), 0);
  const winRate       = sessions.length > 0
    ? Math.round((sessions.filter((s) => s.profit >= 0).length / sessions.length) * 100)
    : 0;
  const hourlyRate    = totalHours > 0 ? totalProfit / totalHours : 0;
  const generated     = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const logoDataUri   = await getLogoDataUri();

  const rows = sessions.map((s) => {
    const name    = s.type === "tournament" ? (s.tournamentName ?? "Tournament") : s.stakes + " NLH";
    const profitColor = s.profit >= 0 ? "#16a34a" : "#dc2626";
    return `
      <tr>
        <td>${fmtDate(s.date)}</td>
        <td>${s.type === "tournament" ? "Tourney" : "Cash"}</td>
        <td>${name}</td>
        <td>${s.venue ?? "—"}</td>
        <td>$${s.buyIn.toLocaleString()}</td>
        <td style="color:${profitColor};font-weight:700">${fmtMoney(s.profit)}</td>
        <td>${s.duration ? fmtDuration(s.duration) : "—"}</td>
      </tr>`;
  }).join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172b; background: #fff; padding: 32px; }

    /* Header */
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #155DFC; }
    .brand-logo { height: 32px; width: auto; display: block; }
    .meta   { text-align: right; font-size: 11px; color: #64748b; line-height: 1.5; }

    /* Summary cards */
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .card    { background: #f8fafc; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0; }
    .card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin-bottom: 4px; }
    .card-value { font-size: 20px; font-weight: 800; }
    .positive { color: #16a34a; }
    .negative { color: #dc2626; }
    .neutral  { color: #155DFC; }

    /* Table */
    h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { background: #155DFC; color: #fff; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 11px; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:hover { background: #eff6ff; }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }

    /* Footer */
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>

  <div class="header">
    <img class="brand-logo" src="${logoDataUri}" />
    <div class="meta">
      Session Report<br/>
      Generated ${generated}<br/>
      ${sessions.length} sessions
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="card-label">Total P&amp;L</div>
      <div class="card-value ${totalProfit >= 0 ? "positive" : "negative"}">${fmtMoney(totalProfit)}</div>
    </div>
    <div class="card">
      <div class="card-label">Sessions</div>
      <div class="card-value neutral">${sessions.length}</div>
    </div>
    <div class="card">
      <div class="card-label">Win Rate</div>
      <div class="card-value neutral">${winRate}%</div>
    </div>
    <div class="card">
      <div class="card-label">Hourly Rate</div>
      <div class="card-value ${hourlyRate >= 0 ? "positive" : "negative"}">${fmtMoney(hourlyRate)}<span style="font-size:12px;font-weight:500">/hr</span></div>
    </div>
  </div>

  <h2>Session History</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Game</th>
        <th>Venue</th>
        <th>Buy-in</th>
        <th>Profit</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">Generated by Stakemate · stakemate.com.au</div>

</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device.");

  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Export Sessions PDF",
    UTI: "com.adobe.pdf",
  });
}
