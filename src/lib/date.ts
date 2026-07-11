const INDIA_OFFSET_MINUTES = 330;
const INDIA_OFFSET_MS = INDIA_OFFSET_MINUTES * 60 * 1000;

function indiaParts(date: Date) {
  const shifted = new Date(date.getTime() + INDIA_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function indiaDateKey(date = new Date()) {
  const { day, month, year } = indiaParts(date);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function indiaStartOfDayIso(date = new Date()) {
  const { day, month, year } = indiaParts(date);
  return new Date(Date.UTC(year, month, day) - INDIA_OFFSET_MS).toISOString();
}

export function indiaStartOfMonthIso(date = new Date()) {
  const { month, year } = indiaParts(date);
  return new Date(Date.UTC(year, month, 1) - INDIA_OFFSET_MS).toISOString();
}

export function indiaDaysAgoStartIso(daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return indiaStartOfDayIso(date);
}

