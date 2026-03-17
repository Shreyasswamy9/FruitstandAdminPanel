export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "custom";

export interface AnalyticsDateRange {
  preset: DateRangePreset;
  start: Date;
  endExclusive: Date;
  startDateInput: string;
  endDateInput: string;
  label: string;
}

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function addDays(input: Date, days: number): Date {
  const result = new Date(input);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateInputValue(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function parseInputDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function resolveAnalyticsDateRange(query: Record<string, unknown> = {}): AnalyticsDateRange {
  const presetFromQuery = typeof query.preset === "string" ? query.preset : "last7";
  const today = startOfUtcDay(new Date());

  let preset: DateRangePreset = "last7";
  let start = addDays(today, -6);
  let endExclusive = addDays(today, 1);

  if (presetFromQuery === "today") {
    preset = "today";
    start = today;
    endExclusive = addDays(today, 1);
  } else if (presetFromQuery === "yesterday") {
    preset = "yesterday";
    start = addDays(today, -1);
    endExclusive = today;
  } else if (presetFromQuery === "last30") {
    preset = "last30";
    start = addDays(today, -29);
    endExclusive = addDays(today, 1);
  } else if (presetFromQuery === "thisMonth") {
    preset = "thisMonth";
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    endExclusive = addDays(today, 1);
  } else if (presetFromQuery === "custom") {
    const startCandidate = parseInputDate(query.startDate);
    const endCandidate = parseInputDate(query.endDate);

    if (startCandidate && endCandidate && startCandidate <= endCandidate) {
      preset = "custom";
      start = startCandidate;
      endExclusive = addDays(endCandidate, 1);
    }
  }

  if (start >= endExclusive) {
    start = addDays(today, -6);
    endExclusive = addDays(today, 1);
    preset = "last7";
  }

  const inclusiveEnd = addDays(endExclusive, -1);

  let label = "Last 7 Days";
  if (preset === "today") label = "Today";
  if (preset === "yesterday") label = "Yesterday";
  if (preset === "last30") label = "Last 30 Days";
  if (preset === "thisMonth") label = "This Month";
  if (preset === "custom") label = `${toDateInputValue(start)} to ${toDateInputValue(inclusiveEnd)}`;

  return {
    preset,
    start,
    endExclusive,
    startDateInput: toDateInputValue(start),
    endDateInput: toDateInputValue(inclusiveEnd),
    label
  };
}
