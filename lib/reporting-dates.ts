/** Period boundaries and calendar labels for Europe/London, including BST changes. */
const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
});

export function londonDateKey(date: string | Date): string {
  const parts = londonDay.formatToParts(new Date(date));
  const get = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function londonMonthKey(date: string | Date): string {
  return londonDateKey(date).slice(0, 7);
}

/** Midnight on the first day of a London-calendar-day report window. */
export function londonWindowStart(days: number, now = new Date()): string {
  const today = londonDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  const local = `${target.toISOString().slice(0, 10)}T00:00`;
  const asUtc = new Date(local + "Z");
  const london = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (london.getTime() - utc.getTime())).toISOString();
}

/** Midnight tomorrow in London (exclusive upper boundary). */
export function londonWindowEnd(now = new Date()): string {
  return londonWindowStart(0, now);
}

export function londonWeekStart(date: string | Date): string {
  const [year, month, day] = londonDateKey(date).split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  asUtc.setUTCDate(asUtc.getUTCDate() - (asUtc.getUTCDay() + 6) % 7);
  return asUtc.toISOString().slice(0, 10);
}

export function londonDayKeys(days: number, now = new Date()): string[] {
  const [year, month, day] = londonDateKey(now).split("-").map(Number);
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(year, month - 1, day - (days - 1 - i))).toISOString().slice(0, 10),
  );
}
