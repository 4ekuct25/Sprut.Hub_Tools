import { ManualSession, type ManualOptions } from "./ManualSession.js";

/**
 * Реестр live-сессий ручной проверки. Сессии живут в памяти и удерживают
 * vm-контекст scenario. TTL — простой idle-timeout: если на сессию никто не
 * подписан и она не трогалась N минут, она удаляется.
 */
export class ManualSessionRegistry {
  private readonly sessions = new Map<string, ManualSession>();

  start(opts: ManualOptions): ManualSession {
    const s = new ManualSession(opts);
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string): ManualSession | null {
    return this.sessions.get(id) ?? null;
  }

  close(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.close();
    this.sessions.delete(id);
    return true;
  }

  list(): { id: string; scenarioName: string; createdAt: number }[] {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      scenarioName: s.scenarioName,
      createdAt: s.createdAt,
    }));
  }
}
