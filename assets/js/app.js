const state = {
  entries: [],
  total: 0,
  theme: "dark",
};

const calc = {
  recalcTotal() {
    // TODO: пересчитать сумму по entries
  },
  formatValue(value) {
    // TODO: форматировать число для вывода
    return String(value ?? 0);
  },
};

const storage = {
  load() {
    // TODO: загрузить состояние из localStorage
  },
  save() {
    // TODO: сохранить состояние в localStorage
  },
  clear() {
    // TODO: очистить сохранённые данные
  },
};

const ui = {
  cache: {},
  init() {
    // TODO: закешировать DOM-элементы
    // TODO: навесить обработчики событий
    // TODO: отрисовать начальный интерфейс
  },
  render() {
    // TODO: отрисовать ленту и итог
  },
  toggleModal(isOpen) {
    // TODO: открыть/закрыть модалку подписи
  },
  setTheme(theme) {
    // TODO: переключить data-theme на html
  },
};

const pwa = {
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js");
    }
  },
};

const app = {
  init() {
    storage.load();
    ui.init();
    pwa.registerServiceWorker();
  },
};

document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
