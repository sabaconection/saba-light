/* Saba Light — entiende frases simples (sin cerebro: reglas).
   "comprar pilas y café" → compras · "pagar ABL el jueves" → tarea con fecha
   "dentista mañana a las 10" → evento. El selector de arriba puede forzar el tipo. */

(function (root) {
  "use strict";

  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DAY_ALIASES = { miercoles: 3, sabado: 6 };

  function strip(text) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function iso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date, days) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  // Devuelve { date: "AAAA-MM-DD" | null, rest: texto sin las palabras de fecha }.
  function extractDate(text, today) {
    let rest = text;
    let date = null;
    const lower = () => strip(rest.toLowerCase());

    const rules = [
      [/\bpasado\s+manana\b/, () => addDays(today, 2)],
      [/(?<!de\s+la\s+)\bmanana\b/, () => addDays(today, 1)],  // «de la mañana» es una hora, no mañana
      [/\bhoy\b/, () => today],
    ];

    for (const [pattern, make] of rules) {
      const match = lower().match(pattern);
      if (match) {
        date = make();
        rest = rest.slice(0, match.index) + rest.slice(match.index + match[0].length);
        break;
      }
    }

    if (!date) {
      const match = lower().match(/\b(?:el\s+|este\s+|para\s+el\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
      if (match) {
        const name = match[1];
        const target = DAY_ALIASES[name] !== undefined ? DAY_ALIASES[name] : DAYS.indexOf(name);
        let delta = (target - today.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // "el lunes" dicho un lunes = el que viene
        date = addDays(today, delta);
        rest = rest.slice(0, match.index) + rest.slice(match.index + match[0].length);
      }
    }

    if (!date) {
      const match = lower().match(/\b(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]) - 1;
        let year = match[3] ? Number(match[3]) : today.getFullYear();
        if (year < 100) year += 2000;
        let candidate = new Date(year, month, day);
        if (!match[3] && candidate < addDays(today, 0)) candidate = new Date(year + 1, month, day);
        if (candidate.getMonth() === month) {
          date = candidate;
          rest = rest.slice(0, match.index) + rest.slice(match.index + match[0].length);
        }
      }
    }

    return { date: date ? iso(date) : null, rest };
  }

  // Devuelve { time: "HH:MM" | null, rest }.
  function extractTime(text) {
    const lower = strip(text.toLowerCase());
    const match = lower.match(
      /\b(?:a\s+las?\s+|tipo\s+|a\s+eso\s+de\s+las\s+)?(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:hs|h|horas)\b)?(?:\s+(?:de\s+la\s+|del\s+)?(manana|tarde|noche|mediodia))?\b/
    );

    if (!match) return { time: null, rest: text };

    const hasMarker = /a\s+las?|tipo|a\s+eso|:|\.|hs|\bh\b|horas|manana|tarde|noche|mediodia/.test(match[0]);
    if (!hasMarker) return { time: null, rest: text }; // un número suelto no es una hora

    let hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const part = match[3];

    if (hour > 23 || minutes > 59) return { time: null, rest: text };
    if ((part === "tarde" || part === "noche") && hour < 12) hour += 12;
    if (!part && hour >= 1 && hour <= 7) hour += 12; // "a las 4" casi siempre es de la tarde

    const time = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const rest = text.slice(0, match.index) + text.slice(match.index + match[0].length);
    return { time, rest };
  }

  function clean(text) {
    return text
      .replace(/\s+/g, " ")
      .replace(/^[\s,:;.-]+|[\s,:;.-]+$/g, "")
      .replace(/^(?:para|el|la)\s+$/i, "")
      .trim();
  }

  function capitalize(text) {
    return text ? text[0].toUpperCase() + text.slice(1) : text;
  }

  function splitItems(text) {
    return text
      .split(/\s*,\s*|\s+y\s+|\s*;\s*|\n/)
      .map((item) => clean(item.replace(/^(?:un|una|unos|unas|el|la|los|las)\s+/i, "")))
      .filter(Boolean)
      .map(capitalize);
  }

  const SHOPPING = /^(?:compr(?:ar|a)\s+|compras?\s*:\s*|super\s*:\s*|(?:agreg|anot|sum)(?:ar|a)\s+(.+?)\s+(?:a|en)\s+(?:la\s+lista\s+de\s+|las\s+)?compras$)/di;
  const TASK_PREFIX = /^(?:record(?:ame|á|a)\s+(?:que\s+)?|acordate\s+(?:de\s+)?(?:que\s+)?|tarea\s*:\s*|to\s*-?\s*do\s*:\s*|anot(?:á|a)\s+(?:que\s+)?|tengo\s+que\s+|hay\s+que\s+)/i;
  const EVENT_PREFIX = /^(?:agend(?:ame|á|a)\s+|evento\s*:\s*)/i;
  const EVENT_WORDS = /^(?:turno|reunion|cita|cumple|cena|almuerzo|partido)\b/i;

  // kind: "auto" | "task" | "shopping" | "event"
  function parse(input, kind, today) {
    today = today || new Date();
    const text = (input || "").trim();

    if (!text) return null;

    const shopping = strip(text).match(SHOPPING);
    if (kind === "shopping" || (kind === "auto" && shopping)) {
      let body = text;
      // Las posiciones salen del texto sin tildes, que mide lo mismo: se recorta el original.
      if (shopping) {
        body = shopping[1] ? text.slice(shopping.indices[1][0], shopping.indices[1][1]) : text.slice(shopping[0].length);
      }
      const items = splitItems(body);
      return items.length ? { type: "shopping", items } : null;
    }

    let body = text;
    const isEventPhrase = EVENT_PREFIX.test(strip(body)) || EVENT_WORDS.test(strip(body.toLowerCase()));
    body = body.replace(EVENT_PREFIX, "").replace(TASK_PREFIX, "");

    const dated = extractDate(body, today);
    const timed = extractTime(dated.rest);
    const title = capitalize(clean(timed.rest.replace(/\b(?:para|el|a las?)\s*$/i, "")));

    if (!title) return null;

    const type = kind === "event" || (kind === "auto" && (timed.time || isEventPhrase)) ? "event" : "task";

    if (type === "event") {
      return { type, title, date: dated.date || iso(today), time: timed.time };
    }

    return { type, title, date: dated.date };
  }

  const api = { parse, extractDate, extractTime, splitItems, iso };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SabaParse = api;
})(typeof window !== "undefined" ? window : globalThis);
