// LabelCalc — оффлайн калькулятор-лента.
// Ввод выражения ТОЛЬКО через экранную клавиатуру.
// Поддержка: +, -, *, /, ( ), десятичная запятая.

const STORAGE_KEY = "labelcalc_state_v1";

/** @typedef {{id:string, expr:string, value:number, label:string}} Entry */

const state = {
  theme: "dark",
  expr: "", // текущее выражение (с запятой как десятичным разделителем)
  entries: /** @type {Entry[]} */ ([]),
  total: 0,
  pendingLabelForExpr: null, // {expr,value} когда открыта модалка
};

// ---------------------------
// Utils
// ---------------------------

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clampText(s, max = 120) {
  if (!s) return "";
  const t = String(s).trim();
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeExpr(expr) {
  // запятая -> точка, умножение/деление символы -> операторы
  return String(expr)
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return "Ошибка";
  // без фанатизма: до 10 знаков после запятой, убираем хвостовые нули
  const fixed = n.toFixed(10).replace(/0+$/g, "").replace(/\.$/g, "");
  // тысячные пробелами
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return parts.join(",");
}

function isOperator(ch) {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/";
}

// ---------------------------
// Expression parser (Shunting-yard)
// ---------------------------

function tokenize(expr) {
  const s = normalizeExpr(expr);
  /** @type {Array<{t:'num'|'op'|'lp'|'rp', v:string}>} */
  const tokens = [];

  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (c === "(") {
      tokens.push({ t: "lp", v: c });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rp", v: c });
      i++;
      continue;
    }
    if (isOperator(c)) {
      // унарный минус: если '-' и (в начале или после '(' или после оператора)
      if (
        c === "-" &&
        (tokens.length === 0 ||
          tokens[tokens.length - 1].t === "lp" ||
          tokens[tokens.length - 1].t === "op")
      ) {
        // превратим в "0 - ..." (проще и надёжнее)
        tokens.push({ t: "num", v: "0" });
        tokens.push({ t: "op", v: "-" });
        i++;
        continue;
      }
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }

    // число
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      let dotCount = 0;
      while (j < s.length) {
        const cc = s[j];
        if (cc === ".") {
          dotCount++;
          if (dotCount > 1) break;
          j++;
          continue;
        }
        if (cc >= "0" && cc <= "9") {
          j++;
          continue;
        }
        break;
      }
      const numStr = s.slice(i, j);
      if (numStr === ".") throw new Error("Некорректное число");
      tokens.push({ t: "num", v: numStr });
      i = j;
      continue;
    }

    throw new Error(`Недопустимый символ: ${c}`);
  }

  return tokens;
}

function toRpn(tokens) {
  const out = [];
  const stack = [];
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const assocLeft = { "+": true, "-": true, "*": true, "/": true };

  for (const tok of tokens) {
    if (tok.t === "num") {
      out.push(tok);
      continue;
    }
    if (tok.t === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t !== "op") break;
        const pTop = prec[top.v];
        const pTok = prec[tok.v];
        if (pTop > pTok || (pTop === pTok && assocLeft[tok.v])) {
          out.push(stack.pop());
        } else {
          break;
        }
      }
      stack.push(tok);
      continue;
    }
    if (tok.t === "lp") {
      stack.push(tok);
      continue;
    }
    if (tok.t === "rp") {
      let found = false;
      while (stack.length) {
        const top = stack.pop();
        if (top.t === "lp") {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) throw new Error("Скобки не сбалансированы");
      continue;
    }
  }

  while (stack.length) {
    const top = stack.pop();
    if (top.t === "lp" || top.t === "rp") throw new Error("Скобки не сбалансированы");
    out.push(top);
  }
  return out;
}

function evalRpn(rpn) {
  const st = [];
  for (const tok of rpn) {
    if (tok.t === "num") {
      const n = Number(tok.v);
      if (!Number.isFinite(n)) throw new Error("Некорректное число");
      st.push(n);
      continue;
    }
    if (tok.t === "op") {
      if (st.length < 2) throw new Error("Ошибка выражения");
      const b = st.pop();
      const a = st.pop();
      let r;
      switch (tok.v) {
        case "+":
          r = a + b;
          break;
        case "-":
          r = a - b;
          break;
        case "*":
          r = a * b;
          break;
        case "/":
          if (b === 0) throw new Error("Деление на ноль");
          r = a / b;
          break;
        default:
          throw new Error("Неизвестный оператор");
      }
      st.push(r);
      continue;
    }
    throw new Error("Ошибка выражения");
  }
  if (st.length !== 1) throw new Error("Ошибка выражения");
  return st[0];
}

function evaluate(expr) {
  const trimmed = String(expr ?? "").trim();
  if (!trimmed) throw new Error("Пусто");
  const tokens = tokenize(trimmed);
  const rpn = toRpn(tokens);
  return evalRpn(rpn);
}

// ---------------------------
// Storage
// ---------------------------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.theme = parsed.theme === "light" ? "light" : "dark";
      state.expr = typeof parsed.expr === "string" ? parsed.expr : "";
      state.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      recomputeTotal();
    }
  } catch {
    // ignore
  }
}

function saveState() {
  const payload = {
    theme: state.theme,
    expr: state.expr,
    entries: state.entries,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------
// UI
// ---------------------------

const ui = {
  totalValue: null,
  tapeList: null,
  tapeEmpty: null,
  exprDisplay: null,
  exprHint: null,
  labelInput: null,
  keypad: null,
  addBtn: null,
  clearBtn: null,
  historyBtn: null,
  saveBtn: null,
  copyBtn: null,

  calcPanel: null,
  calcToggle: null,
  viewToggle: null,

  modal: null,
  modalLabelInput: null,
  modalSaveBtn: null,
  modalSkipBtn: null,

  init() {
    this.totalValue = document.getElementById("totalValue");
    this.tapeList = document.getElementById("tapeList");
    this.tapeEmpty = document.querySelector(".tape__empty");
    this.exprDisplay = document.getElementById("exprDisplay");
    this.exprHint = document.getElementById("exprHint");
    this.labelInput = document.getElementById("labelInput");
    this.keypad = document.querySelector(".keypad");
    this.addBtn = document.getElementById("addBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.historyBtn = document.getElementById("historyBtn");
    this.saveBtn = document.getElementById("saveBtn");
    this.copyBtn = document.getElementById("copyBtn");

    this.calcPanel = document.getElementById("calcPanel");
    this.calcToggle = document.getElementById("calcToggle");
    this.viewToggle = document.getElementById("viewToggle");

    this.modal = document.getElementById("labelModal");
    this.modalLabelInput = document.getElementById("modalLabelInput");
    this.modalSaveBtn = document.getElementById("modalSaveBtn");
    this.modalSkipBtn = document.getElementById("modalSkipBtn");

    // режимы экрана + панель калькулятора
    this.initViewMode();
    this.initCollapse();
    this.initAutoCollapse();

    // keypad
    this.keypad.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-key]");
      if (!btn) return;
      const key = btn.getAttribute("data-key");
      onKey(key);
    });

    // buttons
    this.addBtn.addEventListener("click", () => onAddToTape());
    this.clearBtn.addEventListener("click", () => onReset());

    // modal
    this.modal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "modal") {
        closeModal(false);
      }
    });
    this.modalSaveBtn.addEventListener("click", () => closeModal(true));
    this.modalSkipBtn.addEventListener("click", () => closeModal(false));

    // header actions (минимально)
    this.copyBtn.addEventListener("click", () => copyAsText());
    this.saveBtn.addEventListener("click", () => saveState());
    this.historyBtn.addEventListener("click", () => {
      // пока просто подсказка
      alert("История сессий добавим следующим шагом. Сейчас есть лента текущей сессии.");
    });

    this.render();
  },

  initViewMode() {
    // Два режима:
    // - view-calc: клавиатура на первом месте (лента скрыта, шапка компактная)
    // - view-tape: лента на весь экран, калькулятор свёрнут полоской
    const btn = this.viewToggle;
    const key = "labelcalc_view";

    const preferCalcByDefault = window.matchMedia && window.matchMedia("(max-width: 480px)").matches;
    const saved = (() => {
      try { return localStorage.getItem(key); } catch { return null; }
    })();
    const start = saved || (preferCalcByDefault ? "calc" : "tape");

    const apply = (mode) => {
      const isCalc = mode === "calc";
      document.body.classList.toggle("view-calc", isCalc);
      document.body.classList.toggle("view-tape", !isCalc);

      // В режиме ленты автоматически сворачиваем калькулятор
      if (this.calcPanel) {
        this.calcPanel.classList.toggle("is-collapsed", !isCalc);
      }
      document.body.classList.toggle("calc-collapsed", !isCalc);

      if (this.calcToggle) {
        this.calcToggle.textContent = !isCalc ? "Развернуть" : "Свернуть";
        this.calcToggle.setAttribute("aria-expanded", String(isCalc));
      }

      if (btn) {
        btn.textContent = isCalc ? "Лента" : "Калькулятор";
        btn.setAttribute("aria-pressed", String(!isCalc));
      }

      try { localStorage.setItem(key, isCalc ? "calc" : "tape"); } catch {}
      // синхронизируем и ключ сворачивания для совместимости со старым состоянием
      try { localStorage.setItem("labelcalc_calc_collapsed", isCalc ? "0" : "1"); } catch {}

      // Если пользователь переключился в режим ленты — включаем автосворачивание.
      // (В режиме калькулятора оно не нужно.)
      this.initAutoCollapse();
    };

    apply(start);

    if (btn) {
      btn.addEventListener("click", () => {
        const isCalcNow = document.body.classList.contains("view-calc");
        apply(isCalcNow ? "tape" : "calc");
      });
    }
  },

  initCollapse() {
    const panel = this.calcPanel;
    const btn = this.calcToggle;
    if (!panel || !btn) return;

    const key = "labelcalc_calc_collapsed";
    const startCollapsed = localStorage.getItem(key) === "1";

    const apply = (collapsed) => {
      panel.classList.toggle("is-collapsed", collapsed);
      document.body.classList.toggle("calc-collapsed", collapsed);
      btn.textContent = collapsed ? "Развернуть" : "Свернуть";
      btn.setAttribute("aria-expanded", String(!collapsed));
      localStorage.setItem(key, collapsed ? "1" : "0");
    };

    apply(startCollapsed);

    btn.addEventListener("click", () => {
      const collapsed = panel.classList.contains("is-collapsed");
      apply(!collapsed);
    });
  },

  initAutoCollapse() {
    const panel = this.calcPanel;
    if (!panel) return;

    if (this._autoCollapseBound) return;

    // Автосворачивание нужно только в режиме ленты.
    if (document.body.classList.contains("view-calc")) return;

    // Автосворачивание нужно только в режиме ленты.
    if (!document.body.classList.contains("view-tape")) return;

    // Автосворачивание: когда пользователь скроллит ленту вниз.
    // Авторазворачивание: любой тап по панели/клавиатуре/дисплею.
    const main = document.querySelector(".app__main");
    if (!main) return;

    let lastY = main.scrollTop;
    let lastT = 0;

    const collapse = () => {
      if (!panel.classList.contains("is-collapsed")) {
        panel.classList.add("is-collapsed");
        document.body.classList.add("calc-collapsed");
        if (this.calcToggle) {
          this.calcToggle.textContent = "Развернуть";
          this.calcToggle.setAttribute("aria-expanded", "false");
        }
        try { localStorage.setItem("labelcalc_calc_collapsed", "1"); } catch {}
      }
    };

    const expand = () => {
      if (panel.classList.contains("is-collapsed")) {
        panel.classList.remove("is-collapsed");
        document.body.classList.remove("calc-collapsed");
        if (this.calcToggle) {
          this.calcToggle.textContent = "Свернуть";
          this.calcToggle.setAttribute("aria-expanded", "true");
        }
        try { localStorage.setItem("labelcalc_calc_collapsed", "0"); } catch {}
      }
    };

    // expand on any interaction with the panel
    panel.addEventListener("pointerdown", () => expand(), { passive: true });

    // collapse on scroll down (throttled)
    main.addEventListener(
      "scroll",
      () => {
        const now = Date.now();
        if (now - lastT < 120) return;
        lastT = now;
        const y = main.scrollTop;
        const dy = y - lastY;
        lastY = y;
        if (dy > 18) collapse();
      },
      { passive: true }
    );

    this._autoCollapseBound = true;
  },

  render() {
    document.documentElement.setAttribute("data-theme", state.theme);
    this.totalValue.textContent = formatNumber(state.total);

    const exprText = state.expr ? state.expr : "0";
    this.exprDisplay.textContent = exprText;

    // hint: попробуем посчитать на лету
    if (!state.expr) {
      this.exprHint.textContent = "";
    } else {
      try {
        const v = evaluate(state.expr);
        this.exprHint.textContent = `= ${formatNumber(v)}`;
      } catch (err) {
        this.exprHint.textContent = "";
      }
    }

    // tape
    this.tapeList.innerHTML = "";
    if (state.entries.length === 0) {
      this.tapeEmpty.style.display = "block";
    } else {
      this.tapeEmpty.style.display = "none";
      for (const entry of state.entries) {
        this.tapeList.appendChild(renderEntry(entry));
      }
    }
  },
};

function renderEntry(entry) {
  const li = document.createElement("li");
  li.className = "tape-item";
  li.dataset.id = entry.id;

  const main = document.createElement("div");
  main.className = "tape-item__main";

  const v = document.createElement("div");
  v.className = "tape-item__value";
  v.textContent = formatNumber(entry.value);

  const expr = document.createElement("div");
  expr.className = "tape-item__expr";
  expr.textContent = entry.expr;

  const label = document.createElement("div");
  label.className = "tape-item__label";
  label.textContent = entry.label || "";
  if (!entry.label) label.style.display = "none";

  main.appendChild(v);
  main.appendChild(expr);
  main.appendChild(label);

  const actions = document.createElement("div");
  actions.className = "tape-item__actions";

  const editBtn = document.createElement("button");
  editBtn.className = "icon-btn";
  editBtn.type = "button";
  editBtn.title = "Редактировать";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", () => editEntry(entry.id));

  const delBtn = document.createElement("button");
  delBtn.className = "icon-btn icon-btn--danger";
  delBtn.type = "button";
  delBtn.title = "Удалить";
  delBtn.textContent = "🗑";
  delBtn.addEventListener("click", () => deleteEntry(entry.id));

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

// ---------------------------
// Actions
// ---------------------------

function recomputeTotal() {
  state.total = state.entries.reduce((acc, e) => acc + (Number.isFinite(e.value) ? e.value : 0), 0);
}

function setExpr(next) {
  state.expr = next;
  saveState();
  ui.render();
}

function onKey(key) {
  // ограничим максимальную длину, чтобы не убивать UI
  const MAX_LEN = 80;
  const expr = state.expr;

  if (key === "C") {
    setExpr("");
    return;
  }
  if (key === "BK") {
    setExpr(expr.slice(0, -1));
    return;
  }
  if (key === "=") {
    try {
      const value = evaluate(expr);
      // как обычный калькулятор: результат становится текущим выражением
      setExpr(formatNumber(value));
    } catch {
      flashHint("Ошибка выражения");
    }
    return;
  }

  // нормализуем ввод символов
  let add = key;
  if (key === ",") add = ",";

  // запрет двойной запятой в одном числе: грубо, но работает
  if (add === ",") {
    // ищем последнее "число" после последнего оператора/скобки
    const tail = expr.split(/[+\-*/()]/).pop() || "";
    if (tail.includes(",")) {
      return;
    }
    if (tail === "") {
      // начинаем число как 0,
      add = "0,";
    }
  }

  // операторы: не даём два подряд (кроме '-' как унарного — но это обработает парсер)
  if (isOperator(add)) {
    if (!expr) {
      // начинать можно только с '-' (унарный минус)
      if (add !== "-") return;
    } else {
      const last = expr.slice(-1);
      if (isOperator(last) && add !== "-") {
        // заменить оператор
        setExpr(expr.slice(0, -1) + add);
        return;
      }
    }
  }

  // длина
  if ((expr + add).length > MAX_LEN) return;

  setExpr(expr + add);
}

function onReset() {
  state.expr = "";
  state.entries = [];
  recomputeTotal();
  clearSaved();
  saveState();
  ui.render();
}

function onAddToTape() {
  const expr = state.expr.trim();
  if (!expr) {
    flashHint("Введите выражение");
    return;
  }
  let value;
  try {
    value = evaluate(expr);
  } catch (err) {
    flashHint(err?.message || "Ошибка выражения");
    return;
  }

  // если подпись уже введена — добавляем сразу; если пусто — спросим модалкой
  const labelText = clampText(ui.labelInput.value, 140);
  if (labelText) {
    addEntry(expr, value, labelText);
    ui.labelInput.value = "";
    setExpr("");
    return;
  }

  openModal(expr, value);
}

function addEntry(expr, value, label) {
  const entry = {
    id: uid(),
    expr: String(expr),
    value: Number(value),
    label: clampText(label, 140),
  };
  state.entries.unshift(entry);
  recomputeTotal();
  saveState();
  ui.render();
}

function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  recomputeTotal();
  saveState();
  ui.render();
}

function editEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  // простой редактор через prompt (быстро и надёжно). Модальные окна добавим позже.
  const newExpr = prompt("Выражение для строки:", e.expr);
  if (newExpr === null) return;
  let value;
  try {
    value = evaluate(newExpr);
  } catch (err) {
    alert(err?.message || "Ошибка выражения");
    return;
  }
  const newLabel = prompt("Подпись (можно пусто):", e.label || "");
  if (newLabel === null) return;
  e.expr = String(newExpr).trim();
  e.value = Number(value);
  e.label = clampText(newLabel, 140);
  recomputeTotal();
  saveState();
  ui.render();
}

// ---------------------------
// Modal label
// ---------------------------

function openModal(expr, value) {
  state.pendingLabelForExpr = { expr, value };
  ui.modalLabelInput.value = "";
  ui.modal.setAttribute("aria-hidden", "false");
  // фокус лучше давать чуть позже
  setTimeout(() => ui.modalLabelInput.focus(), 0);
}

function closeModal(saveLabel) {
  ui.modal.setAttribute("aria-hidden", "true");
  const pending = state.pendingLabelForExpr;
  state.pendingLabelForExpr = null;
  if (!pending) return;

  const label = saveLabel ? clampText(ui.modalLabelInput.value, 140) : "";
  addEntry(pending.expr, pending.value, label);
  setExpr("");
}

// ---------------------------
// Copy
// ---------------------------

function copyAsText() {
  const lines = [];
  for (const e of state.entries.slice().reverse()) {
    const label = e.label ? ` — ${e.label}` : "";
    lines.push(`${formatNumber(e.value)} | ${e.expr}${label}`);
  }
  lines.push(`= ${formatNumber(state.total)}`);
  const text = lines.join("\n");

  navigator.clipboard
    ?.writeText(text)
    .then(() => flashHint("Скопировано"))
    .catch(() => {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flashHint("Скопировано");
    });
}

// ---------------------------
// Hint
// ---------------------------

let hintTimer = null;
function flashHint(msg) {
  ui.exprHint.textContent = msg;
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    ui.render();
  }, 1200);
}

// ---------------------------
// PWA
// ---------------------------

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // ignore
    });
  }
}

// ---------------------------
// Init
// ---------------------------

function init() {
  loadState();
  ui.init();
  registerServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
