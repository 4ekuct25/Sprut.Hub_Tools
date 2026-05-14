// Простой хэш-роутинг без зависимостей.
// Поддерживаемые маршруты:
//   #/                — главный экран со списком сценариев и тестов
//   #/manual/<id>     — страница ручной проверки сценария
//
// При смене hash вызывается subscriber. Параметры извлекаются из match-функций.
import { useEffect, useState } from "./lib.js";

function parseHash() {
  const raw = (window.location.hash || "#/").slice(1);
  const [path, query] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(query || "") };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return route;
}

export function navigate(path) {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

export function matchManual(path) {
  const m = /^\/manual\/(.+)$/.exec(path);
  if (!m) return null;
  return { scenarioId: decodeURIComponent(m[1]) };
}
