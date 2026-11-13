const LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;
const CLOCK_HHMM_REGEX = /^(\d{2}):(\d{2})$/;

function pad2(num: number): string {
  return String(num).padStart(2, "0");
}

export function normalizeDateTime(raw: string): string | null {
  const trimmed = raw.trim();
  const match = LOCAL_DATETIME_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  // Use Date.UTC so calendar rollover validation never shifts by the host laptop's timezone
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
}

export function addMinutesToLocal(localIsoHM: string, minutesToAdd: number): string {
  const normalized = normalizeDateTime(localIsoHM);
  if (!normalized) {
    throw new Error(`Invalid local datetime string: ${localIsoHM}`);
  }

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  const day = Number(normalized.slice(8, 10));
  const hour = Number(normalized.slice(11, 13));
  const minute = Number(normalized.slice(14, 16));

  const targetMs = Date.UTC(year, month - 1, day, hour, minute) + minutesToAdd * 60_000;
  const result = new Date(targetMs);

  const outYear = result.getUTCFullYear();
  const outMonth = pad2(result.getUTCMonth() + 1);
  const outDay = pad2(result.getUTCDate());
  const outHour = pad2(result.getUTCHours());
  const outMin = pad2(result.getUTCMinutes());

  return `${outYear}-${outMonth}-${outDay}T${outHour}:${outMin}`;
}

export function parseClockMinutes(hhmm: string): number {
  const match = CLOCK_HHMM_REGEX.exec(hhmm.trim());
  if (!match) {
    throw new Error(`Invalid HH:MM clock time: ${hhmm}`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function extractClockHHMM(localIsoHM: string): string {
  const normalized = normalizeDateTime(localIsoHM);
  if (!normalized) {
    throw new Error(`Invalid local datetime string: ${localIsoHM}`);
  }

  return normalized.slice(11, 16);
}

// Handles both standard windows (06:00–23:00) and overnight windows crossing midnight (05:00–01:00)
export function isWithinServiceHours(
  pickupLocalHM: string,
  serviceFrom: string,
  serviceUntil: string
): boolean {
  const pickupClock = parseClockMinutes(extractClockHHMM(pickupLocalHM));
  const fromMin = parseClockMinutes(serviceFrom);
  const untilMin = parseClockMinutes(serviceUntil);

  if (fromMin <= untilMin) {
    return pickupClock >= fromMin && pickupClock <= untilMin;
  }
  else {
    return pickupClock >= fromMin || pickupClock <= untilMin;
  }
}
