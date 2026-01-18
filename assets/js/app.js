const STORAGE_KEY = "labelcalc-state";

const state = {
  currentInput: "",
  lines: [],
  settings: {
    decimals: 2,
    theme: "dark",
  },
  total: 0,
  modal: {
    lineId: null,
    mode: "add",
  },
};

const calc = {
  normalizeInput(value) {
    return String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  },
  isValidInput(value) {
    if (!value) {
      return false;
    }
    const normalized = String(value).replace(/\s+/g, "");
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount > 1) {
      return false;
    }
    return /\d/.test(normalized);
  },
  parseInputToNumber(value) {
    const normalized = this.normalizeInput(value);
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  },
  formatNumber(number) {
    const decimals = state.settings.decimals;
    const fixed = number.toFixed(decimals);
    const [whole, fraction] = fixed.split(".");
    const withSpaces = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    if (decimals === 0) {
      return withSpaces;
    }
    return `${withSpaces},${fraction}`;
  },
  recalcTotal() {
    state.total = state.lines.reduce((sum, line) => sum + line.value, 0);
  },
};

const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const storage = {
  saveState() {
    const payload = {
      currentInput: state.currentInput,
      lines: state.lines,
      settings: state.settings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  },
  loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      state.currentInput = parsed.currentInput ?? "";
      state.lines = Array.isArray(parsed.lines) ? parsed.lines : [];
      state.settings = {
        decimals: parsed.settings?.decimals ?? 2,
        theme: parsed.settings?.theme ?? "dark",
      };
      calc.recalcTotal();
    } catch (error) {
      console.warn("Failed to load state", error);
    }
  },
};

const ui = {
  cache: {},
  init() {
    this.cache.totalValue = document.getElementById("totalValue");
    this.cache.tapeList = document.getElementById("tapeList");
    this.cache.tapeEmpty = document.querySelector(".tape__empty");
    this.cache.currentInput = document.getElementById("currentInput");
    this.cache.keyboard = document.querySelector(".keyboard__grid");
    this.cache.modal = document.getElementById("lineModal");
    this.cache.modalValue = document.getElementById("modalValue");
    this.cache.modalLabel = document.getElementById("modalLabel");
    this.cache.modalSave = document.getElementById("modalSave");
    this.cache.modalSkip = document.getElementById("modalSkip");

    document.documentElement.dataset.theme = state.settings.theme;

    this.cache.keyboard.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }
      const key = button.dataset.key;
      const action = button.dataset.action;
      if (key) {
        ui.onKeyTap(key);
      }
      if (action === "backspace") {
        ui.onBackspace();
      }
      if (action === "clear") {
        ui.onClear();
      }
      if (action === "add") {
        ui.onAddLine(1);
      }
      if (action === "subtract") {
        ui.onAddLine(-1);
      }
      if (action === "equals") {
        ui.onAddLine(1);
      }
    });

    this.cache.modalSave.addEventListener("click", () => {
      ui.onModalSave();
    });
    this.cache.modalSkip.addEventListener("click", () => {
      ui.closeModal();
    });
    this.cache.modal.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.close === "modal") {
        ui.closeModal();
      }
    });

    this.render();
  },
  render() {
    calc.recalcTotal();
    this.cache.totalValue.textContent = calc.formatNumber(state.total);
    this.cache.currentInput.textContent = state.currentInput || "0";

    this.cache.tapeList.innerHTML = "";
    if (state.lines.length === 0) {
      this.cache.tapeEmpty.style.display = "block";
      return;
    }
    this.cache.tapeEmpty.style.display = "none";

    state.lines.forEach((line) => {
      const li = document.createElement("li");
      li.className = "tape__item";
      li.dataset.id = line.id;

      const content = document.createElement("div");
      content.className = "tape__content";

      const value = document.createElement("span");
      value.className = "tape__value";
      value.textContent = calc.formatNumber(line.value);

      const label = document.createElement("span");
      label.className = "tape__label";
      label.textContent = line.label || "Без подписи";

      content.append(value, label);

      const deleteButton = document.createElement("button");
      deleteButton.className = "tape__delete";
      deleteButton.type = "button";
      deleteButton.textContent = "🗑";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        ui.onDeleteLine(line.id);
      });

      li.append(content, deleteButton);
      li.addEventListener("click", () => {
        ui.openModal(line.id, "edit");
      });

      this.cache.tapeList.appendChild(li);
    });
  },
  onKeyTap(digit) {
    if (digit === "," && state.currentInput.includes(",")) {
      return;
    }
    state.currentInput = `${state.currentInput}${digit}`;
    storage.saveState();
    this.render();
  },
  onBackspace() {
    state.currentInput = state.currentInput.slice(0, -1);
    storage.saveState();
    this.render();
  },
  onClear() {
    state.currentInput = "";
    storage.saveState();
    this.render();
  },
  onAddLine(sign) {
    if (!calc.isValidInput(state.currentInput)) {
      return;
    }
    const parsed = calc.parseInputToNumber(state.currentInput);
    if (parsed === null) {
      return;
    }
    const value = parsed * sign;
    const line = {
      id: createId(),
      value,
      label: "",
    };
    state.lines.unshift(line);
    state.currentInput = "";
    storage.saveState();
    this.openModal(line.id, "add");
  },
  onDeleteLine(id) {
    state.lines = state.lines.filter((line) => line.id !== id);
    storage.saveState();
    this.render();
  },
  openModal(lineId, mode) {
    const line = state.lines.find((item) => item.id === lineId);
    if (!line) {
      return;
    }
    state.modal = { lineId, mode };
    this.cache.modalValue.value = calc.formatNumber(line.value);
    this.cache.modalLabel.value = line.label || "";
    this.cache.modal.setAttribute("aria-hidden", "false");
  },
  closeModal() {
    this.cache.modal.setAttribute("aria-hidden", "true");
    state.modal = { lineId: null, mode: "add" };
    this.render();
  },
  onModalSave() {
    const line = state.lines.find((item) => item.id === state.modal.lineId);
    if (!line) {
      this.closeModal();
      return;
    }
    const valueInput = this.cache.modalValue.value.trim();
    const labelInput = this.cache.modalLabel.value.trim();
    if (calc.isValidInput(valueInput)) {
      const parsed = calc.parseInputToNumber(valueInput);
      if (parsed !== null) {
        line.value = parsed;
      }
    }
    line.label = labelInput;
    storage.saveState();
    this.closeModal();
  },
};

const app = {
  init() {
    storage.loadState();
    ui.init();
  },
};

document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
