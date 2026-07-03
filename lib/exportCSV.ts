import { getSessions } from "@/db/database";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCell).join(",");
}

export async function exportSessionsCSV(): Promise<void> {
  const sessions = getSessions();

  const headers = [
    "Date", "Type", "Stakes / Tournament", "Venue", "State",
    "Buy-in", "Cash-out", "Profit", "Duration (hrs)",
    "Entries", "Position", "Payout", "Notes",
  ];

  const lines: string[] = [headers.join(",")];

  for (const s of sessions) {
    lines.push(row([
      s.date,
      s.type,
      s.type === "tournament" ? (s.tournamentName ?? "") : s.stakes,
      s.venue,
      s.state,
      s.buyIn,
      s.cashOut,
      s.profit,
      s.duration ? Number(s.duration).toFixed(2) : "",
      s.type === "tournament" ? (s.entries ?? "") : "",
      s.type === "tournament" ? (s.position ?? "") : "",
      s.type === "tournament" ? (s.payout ?? "") : "",
      s.notes ?? "",
    ]));
  }

  const csv = lines.join("\n");
  const fileName = `stakemate-sessions-${new Date().toISOString().split("T")[0]}.csv`;

  const file = new File(Paths.cache, fileName);
  file.write(csv);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device.");

  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    dialogTitle: "Export Sessions",
    UTI: "public.comma-separated-values-text",
  });
}
