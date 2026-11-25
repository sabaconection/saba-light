/* Saba Light — Saba en el celular, sin depender de la PC.
   Habla directo con Google (Tasks y Calendar) desde el navegador: no hay servidor en el medio.
   Las listas son las mismas que sincroniza Saba en la PC: «Saba» (tareas) y «Compras». */

(function () {
  "use strict";

  const SCOPES = [
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].join(" ");
  const TASKS_LIST = "Saba";
  const SHOPPING_LIST = "Compras";
  const MENU_CALENDAR = "Menú · Saba";
  const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  const state = {
    clientId: "",
    token: "",
    tokenUntil: 0,
    tokenClient: null,
    kind: "auto",
    lists: {},
    tasks: [],
    shopping: [],
    listening: false,
  };

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ utilidades

  const store = {
    get(key) {
      try { return localStorage.getItem(key) || ""; } catch (error) { return ""; }
    },
    set(key, value) {
      try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch (error) { /* modo privado */ }
    },
  };

  function el(tag, props, children) {
    const node = document.createElement(tag);
    const p = props || {};
    if (p.className) node.className = p.className;
    if (p.text !== undefined) node.textContent = p.text;
    if (p.attrs) Object.entries(p.attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (p.on) Object.entries(p.on).forEach(([event, handler]) => node.addEventListener(event, handler));
    (children || []).forEach((child) => child && node.appendChild(child));
    return node;
  }

  let toastTimer = null;
  function toast(text) {
    const box = $("toast");
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 2600);
  }

  function setStatus(text) {
    $("status").textContent = text;
  }

  function todayIso() {
    return SabaParse.iso(new Date());
  }

  function dayLabel(iso) {
    if (!iso) return "";
    const today = new Date();
    const date = new Date(iso + "T12:00:00");
    const diff = Math.round((date - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Mañana";
    if (diff === -1) return "Ayer";
    return `${DAYS[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
  }

  function show(section) {
    ["setup", "signin", "main"].forEach((id) => { $(id).hidden = id !== section; });
    if (section === "signin") $("clientIdShown").textContent = state.clientId;
  }

  // ----------------------------------------------------------------- Google

  function tokenValid() {
    return state.token && Date.now() < state.tokenUntil - 60000;
  }

  function initGoogle() {
    if (!window.google || !google.accounts || !state.clientId) return;

    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          toast("Google no dio permiso: " + response.error + (response.error_description ? " — " + response.error_description : ""));
          show("signin");
          return;
        }
        state.token = response.access_token;
        state.tokenUntil = Date.now() + Number(response.expires_in || 3600) * 1000;
        store.set("saba_token", state.token);
        store.set("saba_token_until", String(state.tokenUntil));
        show("main");
        load();
      },
    });

    if (tokenValid()) {
      show("main");
      load();
    } else {
      show("signin");
      setStatus("Falta entrar con Google");
    }
  }

  window.sabaGoogleReady = initGoogle;

  function signIn() {
    if (!state.tokenClient) {
      toast("Todavía cargando Google… probá en un segundo.");
      initGoogle();
      return;
    }
    state.tokenClient.requestAccessToken({ prompt: store.get("saba_signed") ? "" : "consent" });
    store.set("saba_signed", "1");
  }

  async function api(url, options) {
    if (!tokenValid()) {
      show("signin");
      setStatus("La sesión venció: tocá «Entrar con Google»");
      throw new Error("sesión vencida");
    }

    const response = await fetch(url, {
      ...(options || {}),
      headers: {
        Authorization: "Bearer " + state.token,
        "Content-Type": "application/json",
        ...((options && options.headers) || {}),
      },
    });

    if (response.status === 401) {
      state.token = "";
      store.set("saba_token", "");
      show("signin");
      setStatus("La sesión venció: tocá «Entrar con Google»");
      throw new Error("sesión vencida");
    }

    if (response.status === 204) return null;

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = (data.error && data.error.message) || response.statusText;
      throw new Error(message);
    }

    return data;
  }

  const TASKS = "https://tasks.googleapis.com/tasks/v1";
  const CAL = "https://www.googleapis.com/calendar/v3";

  async function ensureLists() {
    if (state.lists.task && state.lists.shopping) return;

    const data = await api(`${TASKS}/users/@me/lists?maxResults=100`);
    const byTitle = {};
    (data.items || []).forEach((list) => { byTitle[list.title] = list.id; });

    for (const [key, title] of [["task", TASKS_LIST], ["shopping", SHOPPING_LIST]]) {
      if (!byTitle[title]) {
        const created = await api(`${TASKS}/users/@me/lists`, { method: "POST", body: JSON.stringify({ title }) });
        byTitle[title] = created.id;
      }
      state.lists[key] = byTitle[title];
    }
  }

  async function listTasks(listId) {
    const data = await api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks?showCompleted=true&showHidden=true&maxResults=100`);
    return data.items || [];
  }

  async function addTask(listId, title, due) {
    const body = { title };
    if (due) body.due = `${due}T00:00:00.000Z`;
    return api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks`, { method: "POST", body: JSON.stringify(body) });
  }

  async function setDone(listId, task, done) {
    const body = done ? { status: "completed" } : { status: "needsAction", completed: null };
    return api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH", body: JSON.stringify(body),
    });
  }

  async function removeTask(listId, task) {
    return api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
  }

  async function calendars() {
    const data = await api(`${CAL}/users/me/calendarList?maxResults=100`);
    return data.items || [];
  }

  async function events(calendarId, firstIso, days) {
    const start = new Date(firstIso + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const params = new URLSearchParams({
      timeMin: start.toISOString(), timeMax: end.toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "100",
    });
    const data = await api(`${CAL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    return (data.items || []).filter((item) => item.status !== "cancelled");
  }

  async function addEvent(title, date, time) {
    let body;

    if (time) {
      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + 60 * 60000);
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      body = { summary: title, start: { dateTime: start.toISOString(), timeZone: zone }, end: { dateTime: end.toISOString(), timeZone: zone } };
    } else {
      const next = new Date(date + "T12:00:00");
      next.setDate(next.getDate() + 1);
      body = { summary: title, start: { date }, end: { date: SabaParse.iso(next) } };
    }

    return api(`${CAL}/calendars/primary/events`, { method: "POST", body: JSON.stringify(body) });
  }

  // ------------------------------------------------------------- mostrar

  function eventWhen(item) {
    if (item.start && item.start.dateTime) {
      const start = new Date(item.start.dateTime);
      return { day: SabaParse.iso(start), time: start.toTimeString().slice(0, 5) };
    }
    return { day: item.start.date, time: "Día" };
  }

  function renderAgenda(items) {
    const list = $("agendaList");

    if (!items.length) {
      list.replaceChildren(el("p", { className: "empty", text: "Nada para hoy ni mañana." }));
      return;
    }

    list.replaceChildren(...items.map((item) => {
      const when = eventWhen(item);
      return el("div", { className: "row" }, [
        el("span", { className: "when" }, [el("b", { text: when.time }), document.createTextNode(dayLabel(when.day))]),
        el("span", { className: "text" }, [el("span", { className: "title", text: item.summary || "(sin título)" })]),
      ]);
    }));
  }

  function removeButton(onConfirm) {
    const button = el("button", { className: "remove", text: "✕", attrs: { type: "button", "aria-label": "Borrar" } });
    button.addEventListener("click", async () => {
      if (!button.classList.contains("confirm")) {
        button.classList.add("confirm");
        button.textContent = "¿Borrar?";
        setTimeout(() => { button.classList.remove("confirm"); button.textContent = "✕"; }, 3000);
        return;
      }
      await onConfirm();
    });
    return button;
  }

  function renderTasks() {
    const today = todayIso();
    const pending = state.tasks
      .filter((task) => task.status !== "completed" && task.title)
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    const doneToday = state.tasks.filter((task) => task.status === "completed" && (task.completed || "").slice(0, 10) === today);

    $("tasksMeta").textContent = pending.length + (pending.length === 1 ? " pendiente" : " pendientes");
    const list = $("tasksList");

    if (!pending.length && !doneToday.length) {
      list.replaceChildren(el("p", { className: "empty", text: "Sin tareas. Escribí arriba para sumar una." }));
      return;
    }

    list.replaceChildren(...[...pending, ...doneToday].map((task) => {
      const done = task.status === "completed";
      const due = (task.due || "").slice(0, 10);
      const box = el("input", { attrs: { type: "checkbox", "aria-label": "Hecha: " + task.title } });
      box.checked = done;
      box.addEventListener("change", async () => {
        try {
          await setDone(state.lists.task, task, box.checked);
          toast(box.checked ? "Hecha ✓" : "Vuelve a pendiente");
          load();
        } catch (error) { toast("No pude: " + error.message); }
      });

      return el("div", { className: "row" + (done ? " done" : "") }, [
        box,
        el("span", { className: "text" }, [
          el("span", { className: "title", text: task.title }),
          due ? el("span", { className: "sub" + (due < today && !done ? " late" : ""), text: dayLabel(due) }) : null,
        ]),
        removeButton(async () => {
          await removeTask(state.lists.task, task);
          toast("Borrada");
          load();
        }),
      ]);
    }));
  }

  function renderShopping() {
    const today = todayIso();
    const pending = state.shopping.filter((item) => item.status !== "completed" && item.title);
    const bought = state.shopping.filter((item) => item.status === "completed" && (item.completed || "").slice(0, 10) === today);

    $("shoppingMeta").textContent = pending.length + (pending.length === 1 ? " ítem" : " ítems");
    const list = $("shoppingList");

    if (!pending.length && !bought.length) {
      list.replaceChildren(el("p", { className: "empty", text: "La lista está vacía." }));
      return;
    }

    list.replaceChildren(...[...pending, ...bought].map((item) => {
      const isBought = item.status === "completed";
      return el("button", {
        className: "tag" + (isBought ? " bought" : ""),
        text: item.title,
        attrs: { type: "button", "aria-pressed": String(isBought) },
        on: {
          click: async () => {
            try {
              await setDone(state.lists.shopping, item, !isBought);
              load();
            } catch (error) { toast("No pude: " + error.message); }
          },
        },
      });
    }));
  }

  function renderMenu(items) {
    const list = $("menuList");

    if (!items.length) {
      list.replaceChildren(el("p", { className: "empty", text: "Sin menú publicado. Se arma en Saba (PC)." }));
      return;
    }

    list.replaceChildren(...items.slice(0, 4).map((item) => {
      const day = item.start.date || eventWhen(item).day;
      const text = (item.description || item.summary || "").replace(/\n\nArmado en Saba\.?/, "").replace(/^🍽\s*/, "");
      return el("div", { className: "row" }, [
        el("span", { className: "when" }, [el("b", { text: dayLabel(day) })]),
        el("span", { className: "text" }, text.split("\n").filter(Boolean).map((line) => el("span", { className: "title", text: line }))),
      ]);
    }));
  }

  let loading = false;

  async function load() {
    if (loading || !tokenValid()) return;
    loading = true;
    setStatus("Actualizando…");

    try {
      await ensureLists();
      const today = todayIso();
      const [tasks, shopping, cals] = await Promise.all([
        listTasks(state.lists.task), listTasks(state.lists.shopping), calendars(),
      ]);
      state.tasks = tasks;
      state.shopping = shopping;
      renderTasks();
      renderShopping();

      const menuCal = cals.find((cal) => cal.summary === MENU_CALENDAR);
      const agendaCals = cals.filter((cal) => (cal.selected || cal.primary) && cal.summary !== MENU_CALENDAR);
      const [agendaLists, menuItems] = await Promise.all([
        Promise.all(agendaCals.map((cal) => events(cal.id, today, 2).catch(() => []))),
        menuCal ? events(menuCal.id, today, 7) : Promise.resolve([]),
      ]);
      const agenda = agendaLists.flat().sort((a, b) => {
        const x = eventWhen(a), y = eventWhen(b);
        return (x.day + x.time).localeCompare(y.day + y.time);
      });
      renderAgenda(agenda);
      renderMenu(menuItems);
      setStatus("Al día · " + new Date().toTimeString().slice(0, 5));
    } catch (error) {
      if (error.message !== "sesión vencida") setStatus("Sin conexión con Google");
      if (error.message !== "sesión vencida") toast("No pude actualizar: " + error.message);
    } finally {
      loading = false;
    }
  }

  // -------------------------------------------------------------- cargar

  function describe(result) {
    if (!result) return "";
    if (result.type === "shopping") return "→ Compras: " + result.items.join(", ");
    if (result.type === "event") {
      return "→ Evento: " + result.title + " · " + dayLabel(result.date) + (result.time ? " " + result.time : " (todo el día)");
    }
    return "→ Tarea: " + result.title + (result.date ? " · " + dayLabel(result.date) : "");
  }

  function updatePreview() {
    $("preview").textContent = describe(SabaParse.parse($("askInput").value, state.kind));
  }

  async function submit(event) {
    event.preventDefault();
    const input = $("askInput");
    const result = SabaParse.parse(input.value, state.kind);

    if (!result) {
      toast("Escribí qué querés anotar.");
      return;
    }

    try {
      await ensureLists();

      if (result.type === "shopping") {
        const existing = new Set(state.shopping.filter((i) => i.status !== "completed").map((i) => i.title.toLowerCase()));
        const fresh = result.items.filter((item) => !existing.has(item.toLowerCase()));
        for (const item of fresh) await addTask(state.lists.shopping, item);
        toast(fresh.length ? "A compras: " + fresh.join(", ") : "Ya estaba en la lista");
      } else if (result.type === "event") {
        await addEvent(result.title, result.date, result.time);
        toast("Agendado: " + result.title);
      } else {
        await addTask(state.lists.task, result.title, result.date);
        toast("Anotado: " + result.title);
      }

      input.value = "";
      updatePreview();
      load();
    } catch (error) {
      toast("No pude guardar: " + error.message);
    }
  }

  // ---------------------------------------------------------------- voz

  function setupVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const button = $("micButton");

    if (!Recognition) {
      button.hidden = true; // queda el micrófono del teclado
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "es-AR";
    recognition.interimResults = true;
    recognition.continuous = true; // permite pausas: corta cuando tocás de nuevo
    let base = "";

    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript;
      $("askInput").value = (base + " " + text).trim();
      updatePreview();
    };

    recognition.onend = () => {
      state.listening = false;
      button.setAttribute("aria-pressed", "false");
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") toast("Dale permiso al micrófono en el navegador.");
    };

    button.addEventListener("click", () => {
      if (state.listening) {
        recognition.stop();
        return;
      }
      base = $("askInput").value;
      state.listening = true;
      button.setAttribute("aria-pressed", "true");
      try { recognition.start(); } catch (error) { state.listening = false; button.setAttribute("aria-pressed", "false"); }
      toast("Te escucho. Tocá el micrófono para terminar.");
    });
  }

  // ------------------------------------------------------------- arranque

  function start() {
    // El ID de config.js manda: así un ID mal tipeado y guardado en el celular no queda pegado.
    const configured = String(window.SABA_CLIENT_ID || "").replace(/[\s\u200B-\u200D\uFEFF]/g, "");
    state.clientId = configured || store.get("saba_client_id");
    if (configured) store.set("saba_client_id", "");
    state.token = store.get("saba_token");
    state.tokenUntil = Number(store.get("saba_token_until") || 0);

    $("setupForm").addEventListener("submit", (event) => {
      event.preventDefault();
      // Sin espacios ni caracteres invisibles que a veces se pegan desde otra app.
      const value = $("clientId").value.replace(/[\s\u200B-\u200D\uFEFF]/g, "");
      if (!value.endsWith(".apps.googleusercontent.com")) {
        toast("Ese no parece un ID de cliente de Google.");
        return;
      }
      state.clientId = value;
      store.set("saba_client_id", value);
      show("signin");
      initGoogle();
    });

    $("signinButton").addEventListener("click", signIn);
    $("changeClientButton").addEventListener("click", () => {
      store.set("saba_client_id", "");
      store.set("saba_signed", "");
      state.clientId = "";
      state.tokenClient = null;
      $("clientId").value = "";
      show("setup");
      setStatus("Falta configurar");
    });
    $("signoutButton").addEventListener("click", () => {
      if (state.token && window.google) google.accounts.oauth2.revoke(state.token, () => {});
      state.token = "";
      store.set("saba_token", "");
      store.set("saba_signed", "");
      show("signin");
    });
    $("refreshButton").addEventListener("click", () => (tokenValid() ? load() : signIn()));
    $("askForm").addEventListener("submit", submit);
    $("askInput").addEventListener("input", updatePreview);

    document.querySelectorAll(".kinds button").forEach((button) => {
      button.addEventListener("click", () => {
        state.kind = button.dataset.kind;
        document.querySelectorAll(".kinds button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        updatePreview();
        $("askInput").focus();
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && tokenValid()) load();
    });

    setupVoice();

    if (!state.clientId) {
      show("setup");
      setStatus("Falta configurar");
    } else if (window.google && google.accounts) {
      initGoogle();
    } else {
      show(tokenValid() ? "main" : "signin");
      if (tokenValid()) load();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  start();
})();
