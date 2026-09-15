/**
 * 한국 시간(KST) 단일 지점.
 *
 * 서버(Vercel, UTC)와 브라우저의 시간대가 달라도 같은 시각이 찍혀야 한다.
 * Date#getHours() 같은 로컬 시간대 API 를 쓰지 않고 항상 Asia/Seoul 로 계산한다.
 * 한국은 서머타임이 없으므로 +09:00 고정 오프셋을 써도 안전하다.
 */

export const KST_TIME_ZONE = "Asia/Seoul";

/**
 * 진료일이 바뀌는 시각. 야간 진료가 자정을 넘기므로 00시가 아니라 05시에 바꾼다.
 * DB 의 public.kst_service_date() 와 같은 값이어야 한다.
 */
export const SERVICE_DAY_START_HOUR = 5;

const HOUR = 3_600_000;

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface KstParts {
  /** YYYY-MM-DD */
  date: string;
  hour: number;
  minute: number;
}

export function kstParts(d: Date): KstParts {
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** "HH:MM" (KST) */
export function formatKstClock(value: string | Date): string {
  const { hour, minute } = kstParts(typeof value === "string" ? new Date(value) : value);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 진료일 YYYY-MM-DD (KST 05:00 기준) */
export function kstServiceDate(now: Date): string {
  return kstParts(new Date(now.getTime() - SERVICE_DAY_START_HOUR * HOUR)).date;
}

/** YYYY-MM-DD + "HH:MM"(또는 "HH:MM:SS") KST → Date */
export function kstDateTime(date: string, clock: string): Date {
  return new Date(`${date}T${clock.slice(0, 5)}:00+09:00`);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
