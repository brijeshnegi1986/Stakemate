import { getSetting, setSetting } from "@/db/database";

const RATES_KEY      = "currency_rates";
const RATES_DATE_KEY = "currency_rates_date";
const BASE           = "AUD";

const SUPPORTED = ["AUD", "USD", "GBP", "NZD", "ZAR", "EUR", "SGD", "HKD"];

export type Rates = Record<string, number>; // e.g. { USD: 0.64, GBP: 0.50, ... }

export async function fetchRates(): Promise<Rates> {
  const today     = new Date().toISOString().split("T")[0];
  const cachedDate = getSetting(RATES_DATE_KEY);

  // Return cached rates if already fetched today
  if (cachedDate === today) {
    const cached = getSetting(RATES_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
  }

  const symbols = SUPPORTED.filter((c) => c !== BASE).join(",");
  const res = await fetch(
    `https://api.frankfurter.app/latest?from=${BASE}&to=${symbols}`,
    { headers: { Accept: "application/json" } }
  );

  if (!res.ok) throw new Error("Could not fetch exchange rates.");

  const json = await res.json();
  const rates: Rates = { [BASE]: 1, ...json.rates };

  setSetting(RATES_KEY,      JSON.stringify(rates));
  setSetting(RATES_DATE_KEY, today);

  return rates;
}

export function convert(amount: number, from: string, to: string, rates: Rates): number {
  const inBase = from === BASE ? amount : amount / (rates[from] ?? 1);
  return inBase * (rates[to] ?? 1);
}
