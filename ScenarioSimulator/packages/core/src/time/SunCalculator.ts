/**
 * Простой стаб расчёта восхода/заката для эмулятора.
 *
 * По умолчанию: sunrise 06:00, sunset 18:00 (локальное время сценария).
 * Тесты могут переопределять через `setSunrise('05:30')` / `setSunset('21:00')`.
 */
export class SunCalculator {
  private sunriseHour = 6;
  private sunriseMin = 0;
  private sunsetHour = 18;
  private sunsetMin = 0;

  setSunrise(time: string): void {
    const { h, m } = SunCalculator.parseHHmm(time);
    this.sunriseHour = h;
    this.sunriseMin = m;
  }

  setSunset(time: string): void {
    const { h, m } = SunCalculator.parseHHmm(time);
    this.sunsetHour = h;
    this.sunsetMin = m;
  }

  /** Возвращает абсолютную timestamp следующего sunrise после `afterMs`. */
  nextSunrise(afterMs: number, offsetMinutes = 0): number {
    return this.nextOccurrence(afterMs, this.sunriseHour, this.sunriseMin) + offsetMinutes * 60_000;
  }

  /** Возвращает абсолютную timestamp следующего sunset после `afterMs`. */
  nextSunset(afterMs: number, offsetMinutes = 0): number {
    return this.nextOccurrence(afterMs, this.sunsetHour, this.sunsetMin) + offsetMinutes * 60_000;
  }

  private nextOccurrence(afterMs: number, hour: number, minute: number): number {
    const d = new Date(afterMs);
    const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
    if (candidate.getTime() <= afterMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  static parseHHmm(s: string): { h: number; m: number } {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) throw new Error(`Invalid HH:mm format: ${s}`);
    return { h: Math.min(23, Math.max(0, Number(m[1]))), m: Math.min(59, Math.max(0, Number(m[2]))) };
  }
}
