import { html, render, h } from "./lib.js";
import { useRoute, matchManual } from "./router.js";
import { ListView } from "./views/list.js";
import { ManualView } from "./views/manual.js";

// Простой ErrorBoundary, чтобы при ошибке в любой view "Loading…" в index.html
// перетёрся понятным сообщением, а не зависал.
class ErrorBoundary {
  constructor() {
    this.state = { err: null };
  }
  componentDidCatch(err) {
    this.setState({ err });
    console.error("ErrorBoundary caught", err);
  }
  render(props, state) {
    if (state.err) {
      return html`<div class="manual-error">
        <h2>Что-то пошло не так</h2>
        <pre>${String(state.err.stack || state.err.message || state.err)}</pre>
        <button onClick=${() => {
          this.setState({ err: null });
          window.location.hash = "#/";
        }}>← на главную</button>
      </div>`;
    }
    return props.children;
  }
}
// Без import { Component } у нас нет наследования; имитируем через простой класс.
// Preact допускает компонент-функцию с `componentDidCatch` через хук — но проще
// сделать минимальную обёртку: пробуем render и при ошибке внутри App возвращаем
// fallback.
function App() {
  const route = useRoute();
  const manual = matchManual(route.path);
  try {
    if (manual) return html`<${ManualView} scenarioId=${manual.scenarioId} />`;
    return html`<${ListView} />`;
  } catch (err) {
    console.error(err);
    return html`<div class="manual-error">
      <h2>Ошибка рендера</h2>
      <pre>${String(err && (err.stack || err.message) || err)}</pre>
      <a href="#/">← на главную</a>
    </div>`;
  }
}

window.addEventListener("error", (e) => {
  const root = document.getElementById("app");
  if (root && root.textContent === "Loading…") {
    root.innerHTML = `<div class="manual-error"><h2>Ошибка загрузки</h2><pre>${e.message}\n${e.filename}:${e.lineno}:${e.colno}</pre></div>`;
  }
});

render(html`<${App} />`, document.getElementById("app"));
