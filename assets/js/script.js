(() => {
  "use strict";

  const E = Object.fromEntries(
    "topbar back ttl open more topsettings fs chapters chapter viewer notice toast update doupdate welcome library resume grid store work workresume chaps reader end endtitle dock count cur tot prog bar dim live settings file folder play reset installrow install addsheet imp impbody impgo impcancel impclose act acttitle actbody"
      .split(" ").map((id) => [id, document.getElementById(id)])
  );
  const form = E.settings.querySelector("form").elements;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const IMG = /\.(jpe?g|png|gif|webp|avif)$/i;
  const root = document.documentElement;
  const APP = "Visualizador de Manhwa";
  let view = "library"; // library | work | reader

  // ===== Ajustes (salvos no aparelho) =====
  const KEY = "cbz-reader:v2", OLD = "cbz-reader:v1", POS = "cbz-reader:pos";
  const DEF = {
    theme: "auto", bg: "#14161b", accent: "#8bd3a3", ui: "m",
    width: null, gap: 0, radius: 0, dim: 0, warm: 0, speed: 6,
    showBar: true, showCount: true, autoHide: true, remember: true, autoNext: false,
    awake: true, eco: null,
  };
  const store = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const saved = store(KEY) || store(OLD) || {};
  if (typeof saved.width !== "number") delete saved.width; // a v1 guardava texto ("narrow"...)
  const S = { ...DEF, ...saved };
  if (!/^#[0-9a-f]{6}$/i.test(S.bg)) S.bg = DEF.bg;
  if (!/^#[0-9a-f]{6}$/i.test(S.accent)) S.accent = DEF.accent;
  S.accent = S.accent.toLowerCase();
  const save = () => put(KEY, S);

  const lowEnd = () => navigator.connection?.saveData || navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2;
  const eco = () => S.eco ?? Boolean(lowEnd());
  const wid = () => S.width ?? (innerWidth >= 1100 ? 40 : innerWidth >= 700 ? 70 : 100);

  // Cores
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const VARS = ["bg", "sf", "sf2", "tx", "mu", "ln", "logo"];
  const OUT = {
    width: (v) => v + "%", gap: (v) => v + " px", radius: (v) => v + " px",
    dim: (v) => v + "%", warm: (v) => v + "%", speed: (v) => v,
  };

  function apply() {
    const rs = root.style;
    root.dataset.theme = S.theme;
    root.dataset.ui = S.ui;

    if (S.theme === "custom") {
      const light = lum(rgb(S.bg)) > 0.4, tx = light ? "#1b1e24" : "#ebe9e4";
      const v = {
        bg: S.bg, sf: mix(S.bg, tx, 0.06), sf2: mix(S.bg, tx, 0.12), tx,
        mu: mix(S.bg, tx, 0.62), ln: mix(S.bg, tx, 0.2), logo: light ? "none" : "invert(.88)",
      };
      for (const k in v) rs.setProperty("--" + k, v[k]);
      rs.colorScheme = light ? "light" : "dark";
    } else {
      VARS.forEach((k) => rs.removeProperty("--" + k));
      rs.removeProperty("color-scheme");
    }

    // Cor de destaque: escurecida automaticamente em fundos claros para manter o contraste
    const body = getComputedStyle(document.body).backgroundColor;
    const light = lum((body.match(/[\d.]+/g) || [18, 19, 22]).slice(0, 3).map(Number)) > 0.4;
    const ac = light ? mix(S.accent, "#000000", 0.42) : S.accent;
    rs.setProperty("--ac", ac);
    rs.setProperty("--onac", lum(rgb(ac)) > 0.4 ? "#101214" : "#ffffff");

    rs.setProperty("--col", wid() + "%");
    rs.setProperty("--gap", S.gap + "px");
    rs.setProperty("--rad", S.radius + "px");

    // Escurecer + luz quente numa única camada (mais leve para o aparelho)
    const ad = S.dim / 100, aw = (S.warm / 100) * 0.4, a = ad + aw * (1 - ad), k = a ? (aw * (1 - ad)) / a : 0;
    E.dim.style.background = `rgba(${Math.round(255 * k)},${Math.round(130 * k)},${Math.round(20 * k)},${a})`;
    E.dim.hidden = !a;

    syncBars();
    E.count.hidden = !S.showCount;
    document.querySelector("meta[name=theme-color]").content = getComputedStyle(document.body).backgroundColor;
  }

  function syncForm() {
    const f = form;
    f.theme.value = S.theme; f.ui.value = S.ui; f.bg.value = S.bg;
    f.width.value = wid(); f.gap.value = S.gap; f.radius.value = S.radius;
    f.dim.value = S.dim; f.warm.value = S.warm; f.speed.value = S.speed;
    ["showBar", "showCount", "autoHide", "remember", "autoNext", "awake"].forEach((k) => { f[k].checked = S[k]; });
    f.eco.checked = eco();
    marks();
  }
  function marks() {
    const radios = [...form.accent];
    radios.forEach((r) => { r.checked = r.value === S.accent; });
    form.accentc.value = S.accent;
    form.accentc.closest(".dot").classList.toggle("on", !radios.some((r) => r.checked));
    E.settings.style.setProperty("--cbg", S.bg);
    document.getElementById("bgrow").hidden = S.theme !== "custom";
    document.querySelectorAll("[data-out]").forEach((o) => {
      const k = o.dataset.out;
      o.textContent = OUT[k](k === "width" ? wid() : S[k]);
    });
  }

  E.settings.addEventListener("input", (e) => {
    const t = e.target, k = t.name === "accentc" ? "accent" : t.name;
    if (!(k in DEF)) return;
    S[k] = t.type === "checkbox" ? t.checked : t.type === "range" ? +t.value : t.value.toLowerCase();
    anchored(apply); save(); marks();
    if (k === "eco") observe();
    if (k === "awake") awake();
  });
  E.settings.addEventListener("click", (e) => { if (e.target === E.settings) E.settings.close(); });
  E.reset.addEventListener("click", () => {
    Object.assign(S, DEF);
    syncForm(); anchored(apply); save(); observe(); awake();
    toast("Ajustes restaurados");
  });

  // Abas dos ajustes
  const tabs = [...E.settings.querySelectorAll("[role=tab]")];
  function tab(i, focus) {
    tabs.forEach((b, n) => {
      b.setAttribute("aria-selected", n === i);
      b.tabIndex = n === i ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = n !== i;
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((b, n) => {
    b.addEventListener("click", () => tab(n));
    b.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); tab((n + d + tabs.length) % tabs.length, true); }
    });
  });

  // ===== Estado =====
  const st = { files: [], work: null, data: null, empty: true, i: -1, s: 0, pages: [], want: new Set(), busy: 0, cur: 0, ar: 0, start: 0, done: false };
  const io = {};
  const say = (m) => { E.live.textContent = m; };
  let wt;
  function warn(m, ms) {
    clearTimeout(wt);
    E.notice.textContent = m;
    E.notice.hidden = !m;
    if (m && ms) wt = setTimeout(() => warn(""), ms);
  }
  let tt;
  function toast(m) {
    E.toast.textContent = m;
    E.toast.hidden = false;
    clearTimeout(tt);
    tt = setTimeout(() => { E.toast.hidden = true; }, 2400);
    say(m);
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const fmt = (n) => (n >= 1e9
    ? (n / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " GB"
    : Math.max(1, Math.round(n / 1e6)).toLocaleString("pt-BR") + " MB");
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // ===== Onde parei (por capítulo, guardado no aparelho; a chave é a mesma "nome|tamanho" da biblioteca) =====
  const pos = store(POS) || {};
  let pt;
  function savePos(now) {
    if (!S.remember || !st.pages.length) return;
    clearTimeout(pt);
    const run = () => {
      const rec = st.files[st.i];
      if (!st.pages.length || !rec) return;
      pos[rec.sig] = { p: st.cur, t: Date.now(), d: st.done };
      const keys = Object.keys(pos);
      if (keys.length > 2000) keys.sort((a, b) => pos[a].t - pos[b].t).slice(0, keys.length - 2000).forEach((k) => delete pos[k]);
      put(POS, pos);
    };
    now ? run() : (pt = setTimeout(run, 600));
  }
  function setCur(n) {
    st.cur = n;
    E.cur.textContent = n + 1;
    savePos();
  }

  // ===== Telas: biblioteca → obra → leitor (o botão voltar do Android segue essa ordem) =====
  const ys = {}; // posição de rolagem de cada tela
  let covers = [];
  const freeCovers = () => { covers.forEach((u) => URL.revokeObjectURL(u)); covers = []; };
  function coverEl(w) {
    const d = mk("div", "cover");
    if (w.cover) {
      const u = URL.createObjectURL(w.cover);
      covers.push(u);
      const im = new Image();
      im.src = u; im.alt = ""; im.decoding = "async";
      d.append(im);
    } else d.textContent = (w.title.trim()[0] || "?").toUpperCase();
    return d;
  }
  function syncBars() { E.prog.hidden = !S.showBar || view !== "reader"; }

  function setView(v) {
    const prev = view;
    if (prev !== v) ys[prev] = scrollY;
    if (prev === "reader" && v !== "reader") leaveReader();
    view = v;
    document.body.dataset.view = v;
    const rd = v === "reader";
    E.welcome.hidden = !(v === "library" && st.empty);
    E.library.hidden = !(v === "library" && !st.empty);
    E.work.hidden = v !== "work";
    E.dock.hidden = E.chapters.hidden = !rd;
    if (!rd) E.reader.hidden = E.end.hidden = true;
    E.back.hidden = v === "library";
    E.open.hidden = E.topsettings.hidden = v !== "library";
    E.more.hidden = v !== "work";
    E.ttl.hidden = rd;
    E.fs.hidden = !rd || !document.fullscreenEnabled;
    E.ttl.textContent = v === "work" ? st.work?.title || "" : "Biblioteca";
    if (!rd) {
      document.body.classList.remove("immersive");
      if (prev !== v) scrollTo(0, ys[v] || 0);
    }
    syncBars();
  }
  function leaveReader() {
    st.s++; // cancela qualquer capítulo que ainda estivesse abrindo
    autoStop();
    savePos(true);
    reset();
    document.title = APP;
    warn("");
    awake();
  }

  // Une obras e capítulos e calcula o que já foi lido
  function index() {
    const { works, chapters } = st.data;
    const by = new Map(works.map((w) => [w.id, { w, chs: [] }]));
    chapters.forEach((c) => by.get(c.workId)?.chs.push(c));
    const out = [];
    by.forEach((x) => {
      if (!x.chs.length) return;
      x.chs.sort((a, b) => collator.compare(a.name, b.name));
      x.read = x.chs.filter((c) => pos[c.sig]?.d).length;
      x.last = Math.max(0, ...x.chs.map((c) => pos[c.sig]?.t || 0));
      out.push(x);
    });
    return out;
  }
  // Onde continuar numa obra: o último capítulo lido; se ele terminou, o próximo
  function target(x) {
    let best = null, bt = 0;
    x.chs.forEach((c, i) => {
      const r = pos[c.sig];
      if (r && r.t > bt) { bt = r.t; best = { i, r }; }
    });
    if (!best) return { i: 0, p: 0, fresh: true };
    const { i, r } = best;
    if (r.d && i < x.chs.length - 1) return { i: i + 1, p: 0 };
    return { i, p: r.p };
  }
  function fillResume(btn, x, tg, label) {
    const ch = x.chs[tg.i], ns = "http://www.w3.org/2000/svg";
    const txt = mk("div", "txt");
    txt.append(mk("span", "", label), mk("strong", "", x.w.title), mk("small", "", ch.name + (tg.p ? ` · página ${tg.p + 1}` : "")));
    const svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", "M7 4.5v15l12-7.5z");
    svg.append(path);
    btn.replaceChildren(coverEl(x.w), txt, svg);
    btn.dataset.work = x.w.id;
    btn.dataset.i = tg.i;
    btn.dataset.p = tg.p;
  }

  async function showStorage() {
    const u = await Library.usage();
    E.store.textContent = u
      ? `${fmt(u.used)} usados de ${fmt(u.quota)} neste aparelho. ` + (u.persisted ? "Seus capítulos estão protegidos contra limpeza automática." : "O navegador pode apagar estes dados se faltar espaço; instalar o app costuma ajudar.")
      : "";
  }

  async function renderLibrary() {
    st.data = await Library.overview();
    const items = index();
    st.empty = !items.length;
    freeCovers();
    items.sort((a, b) => b.last - a.last || b.w.added - a.w.added);
    E.grid.replaceChildren(...items.map((x) => {
      const b = mk("button", "card");
      b.type = "button";
      b.dataset.work = x.w.id;
      b.append(coverEl(x.w), mk("b", "", x.w.title),
        mk("small", "", plural(x.chs.length, "capítulo", "capítulos") + (x.read ? ` · ${x.read} lido${x.read > 1 ? "s" : ""}` : "")));
      return b;
    }));
    const best = items.find((x) => x.last);
    E.resume.hidden = !best;
    if (best) fillResume(E.resume, best, target(best), "Continuar lendo");
    showStorage();
  }
  async function showLibrary() {
    try { await renderLibrary(); }
    catch { st.empty = true; warn("Não foi possível abrir a biblioteca deste navegador.", 10000); }
    setView("library");
  }

  async function loadWork(id) {
    st.data = await Library.overview();
    const x = index().find((i) => i.w.id === id);
    if (!x) return null;
    st.work = x.w;
    st.files = x.chs;
    E.chapter.replaceChildren(...x.chs.map((c, n) => new Option(c.name, n)));
    return x;
  }
  function renderWork(x) {
    freeCovers();
    const tg = target(x);
    fillResume(E.workresume, x, tg, tg.fresh ? "Começar a ler" : "Continuar lendo");
    E.chaps.replaceChildren(...x.chs.map((c, n) => {
      const r = pos[c.sig];
      const li = mk("li", r?.d ? "read" : r ? "cur" : "");
      const b = mk("button", "chap");
      b.type = "button";
      b.dataset.i = n;
      b.append(mk("span", "nm", c.name),
        mk("span", "stt", r?.d ? "Lido" : r ? `Pág. ${r.p + 1}${c.pages ? " de " + c.pages : ""}` : c.pages ? `${c.pages} pág.` : ""));
      const m = mk("button", "icon");
      m.type = "button";
      m.dataset.chmenu = n;
      m.setAttribute("aria-label", `Opções de ${c.name}`);
      m.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" style="stroke-width:3.5"/></svg>';
      li.append(b, m);
      return li;
    }));
  }
  async function showWork(id, push) {
    let x = null;
    try { x = await loadWork(id); } catch {}
    if (!x) return showLibrary();
    if (push) { ys.work = 0; history.pushState({ v: "work", id }, ""); }
    renderWork(x);
    setView("work");
  }
  async function refreshWork() {
    const x = await loadWork(st.work.id).catch(() => null);
    if (!x) return history.back();
    renderWork(x);
    setView("work");
  }
  async function read(workId, i, p = 0) {
    if (view === "library" || st.work?.id !== workId) {
      let x = null;
      try { x = await loadWork(workId); } catch {}
      if (!x) return showLibrary();
    }
    if (view === "library") { ys.work = 0; history.pushState({ v: "work", id: workId }, ""); }
    history.pushState({ v: "reader" }, "");
    openChapter(i, p);
  }

  // ===== Adicionar capítulos: escolher, conferir o agrupamento e copiar para o aparelho =====
  const imp = { sc: null, mode: "name", groups: [], ambiguous: 0, usedFolder: false, run: false, ac: null, urls: [] };
  let existing = new Set();
  const showSheet = (d) => { if (!d.open) d.showModal(); };
  function pick(kind) {
    E.addsheet.close();
    (kind === "folder" ? E.folder : E.file).click();
  }
  const freeImpUrls = () => { imp.urls.forEach((u) => URL.revokeObjectURL(u)); imp.urls = []; };

  async function addFiles(list) {
    const sc = Library.scan(list);
    if (!sc.cbz.length) return warn("Nenhum arquivo .cbz encontrado. Escolha arquivos com a extensão .cbz.", 8000);
    warn("");
    let works = [];
    try { works = (await Library.overview()).works; } catch {}
    existing = new Set(works.map((w) => Library.norm(w.title)));
    Object.assign(imp, { sc, mode: sc.hasPath ? "folder" : "name", run: false });
    regroup();
    drawImport();
    showSheet(E.imp);
  }
  function regroup() {
    const r = Library.group(imp.sc, imp.mode);
    imp.groups = r.groups;
    imp.ambiguous = r.ambiguous;
    imp.usedFolder = r.usedFolder;
  }
  function drawImport() {
    freeImpUrls();
    const { sc, groups } = imp;
    const n = groups.reduce((t, g) => t + g.items.length, 0);
    const parts = [mk("p", "", `${plural(n, "capítulo encontrado", "capítulos encontrados")} em ${plural(groups.length, "obra", "obras")}.`)];

    const seg = mk("fieldset");
    seg.innerHTML = '<legend>Agrupar obras por</legend><div class="seg"><label><input type="radio" name="mode" value="folder"><span>Pasta</span></label><label><input type="radio" name="mode" value="name"><span>Nome do arquivo</span></label></div>';
    seg.querySelector("[value=folder]").disabled = !sc.hasPath;
    seg.querySelector(`[value=${imp.mode}]`).checked = true;
    parts.push(seg);
    if (!sc.hasPath) parts.push(mk("p", "hint", "Seu aparelho não informou as pastas. Para agrupar por pasta, use Escolher pasta."));

    groups.forEach((g, gi) => {
      const row = mk("div", "grp"), top = mk("div", "grp-top");
      if (g.poster) {
        const u = URL.createObjectURL(g.poster);
        imp.urls.push(u);
        const im = new Image();
        im.src = u; im.alt = "Poster";
        top.append(im);
      }
      const inp = mk("input", "txt-in");
      inp.type = "text"; inp.value = g.title; inp.dataset.g = gi; inp.autocomplete = "off";
      inp.setAttribute("aria-label", "Nome da obra");
      top.append(inp);
      const meta = mk("div", "grp-meta");
      meta.append(mk("span", "", plural(g.items.length, "capítulo", "capítulos")));
      if (g.poster) meta.append(mk("span", "tag ok", "Poster encontrado"));
      const ex = mk("span", "tag", "Já existe na biblioteca");
      ex.dataset.ex = "";
      ex.hidden = !existing.has(Library.norm(g.title));
      meta.append(ex);
      const det = mk("details"), ul = mk("ul");
      det.append(mk("summary", "", "Ver capítulos"));
      g.items.forEach((it) => ul.append(mk("li", "", it.file.name.replace(/\.(cbz|zip)$/i, ""))));
      det.append(ul);
      row.append(top, meta, det);
      parts.push(row);
    });

    if (imp.ambiguous) parts.push(mk("p", "hint", "O poster foi ignorado porque a seleção mistura várias obras. Escolha a pasta de cada obra para usar a capa."));
    if (sc.ignored) parts.push(mk("p", "hint", `${plural(sc.ignored, "arquivo ignorado", "arquivos ignorados")} (só .cbz, .zip e a imagem poster são usados).`));
    E.impbody.replaceChildren(...parts);
    E.impgo.hidden = false;
    E.impgo.disabled = !n;
    E.impcancel.textContent = "Cancelar";
  }
  E.impbody.addEventListener("change", (e) => {
    if (e.target.name !== "mode" || imp.run) return;
    imp.mode = e.target.value;
    regroup();
    drawImport();
    E.impbody.querySelector("input[name=mode]:checked")?.focus();
  });
  E.impbody.addEventListener("input", (e) => {
    const gi = e.target.dataset.g;
    if (gi == null) return;
    const g = imp.groups[+gi];
    g.title = e.target.value;
    e.target.closest(".grp").querySelector("[data-ex]").hidden = !existing.has(Library.norm(g.title));
  });
  const stopImport = () => { if (imp.run) imp.ac.abort(); else E.imp.close(); };
  E.impcancel.addEventListener("click", stopImport);
  E.impclose.addEventListener("click", stopImport);
  E.imp.addEventListener("cancel", (e) => { if (imp.run) { e.preventDefault(); imp.ac.abort(); } });
  E.imp.addEventListener("close", freeImpUrls);

  E.impgo.addEventListener("click", async () => {
    imp.run = true;
    imp.ac = new AbortController();
    freeImpUrls();
    E.impbody.replaceChildren(mk("p", "", "Preparando…"), Object.assign(mk("div", "meter"), { innerHTML: "<i></i>" }),
      mk("p", "hint", "Os arquivos são copiados para este aparelho e não saem dele. Pode levar um tempo."));
    E.impgo.hidden = true;
    E.impcancel.textContent = "Cancelar importação";
    const msg = E.impbody.firstChild, bar = E.impbody.querySelector(".meter i");
    let out;
    try {
      out = await Library.importGroups(imp.groups, {
        signal: imp.ac.signal,
        onProgress: ({ done, total, name }) => {
          bar.style.transform = `scaleX(${total ? done / total : 0})`;
          msg.textContent = name ? `Copiando ${done + 1} de ${total}: ${name}` : "Finalizando…";
        },
      });
    } catch {
      out = { added: 0, dup: 0, failed: ["erro"], stopped: null };
    }
    imp.run = false;
    E.imp.close();
    const parts = [];
    if (out.added) parts.push(plural(out.added, "capítulo adicionado", "capítulos adicionados"));
    if (out.dup) parts.push(plural(out.dup, "já estava na biblioteca", "já estavam na biblioteca"));
    if (out.failed.length) parts.push(plural(out.failed.length, "falhou", "falharam"));
    let text = !out.added && (out.stopped === "espaço" || out.failed.length)
      ? "Não foi possível adicionar os capítulos."
      : parts.join(", ") || "Nada novo para adicionar";
    if (out.stopped === "espaço") {
      const sp = out.space;
      text += ` O navegador recusou gravar ${fmt(out.size)}`
        + (sp ? ` (livre segundo ele: ${fmt(Math.max(0, sp.quota - sp.usage))}; limite do site: ${fmt(sp.quota)})` : "") + ".";
      if (sp && sp.quota < 2e9) text += " Esse limite é pequeno: costuma acontecer em aba anônima ou com o aparelho quase cheio.";
      text += ` [${out.detail}]`;
    } else if (out.stopped === "cancelado") text += ". Importação cancelada.";
    if (out.errors.length) text += ` [${out.errors[0]}]`;
    if (out.stopped || out.failed.length) warn(text, 30000); else toast(text);
    if (view === "library") await showLibrary();
  });

  // ===== Menus da obra e dos capítulos =====
  function openAct(title, fill) {
    E.acttitle.textContent = title;
    E.actbody.replaceChildren();
    fill(E.actbody);
    showSheet(E.act);
  }
  const field = (label, el) => { const l = mk("label", "fld", label); l.append(el); return l; };
  // Remover pede um segundo toque para confirmar
  function confirmBtn(text, fn) {
    const b = mk("button", "btn danger", text);
    b.type = "button";
    let armed = false, t;
    b.onclick = () => {
      if (armed) return fn();
      armed = true;
      b.textContent = "Toque de novo para confirmar";
      t = setTimeout(() => { armed = false; b.textContent = text; }, 4000);
    };
    return b;
  }
  const forget = (list) => { list.forEach((c) => delete pos[c.sig]); put(POS, pos); };

  function workMenu() {
    const w = st.work, chs = st.files;
    openAct("Opções da obra", (b) => {
      const inp = mk("input", "txt-in");
      inp.type = "text"; inp.value = w.title; inp.autocomplete = "off";
      const save = mk("button", "btn", "Salvar nome");
      save.type = "button";
      save.onclick = async () => {
        const r = await Library.renameWork(w.id, inp.value);
        E.act.close();
        const x = await loadWork(r.id).catch(() => null);
        if (!x) return history.back();
        renderWork(x);
        setView("work");
        toast(r.merged ? "Obras unidas" : "Nome salvo");
      };
      const rm = confirmBtn("Remover obra e capítulos", async () => {
        await Library.removeWork(w.id);
        forget(chs);
        E.act.close();
        toast("Obra removida");
        history.back();
      });
      b.append(field("Nome da obra", inp), save, rm);
    });
  }
  function chapterMenu(n) {
    const ch = st.files[n], others = st.data.works.filter((w) => w.id !== st.work.id);
    openAct(ch.name, (b) => {
      const sel = mk("select");
      others.forEach((w) => sel.append(new Option(w.title, w.id)));
      sel.append(new Option("Nova obra…", "__new"));
      const nm = mk("input", "txt-in");
      nm.type = "text"; nm.placeholder = "Nome da nova obra"; nm.autocomplete = "off";
      const sync = () => { nm.hidden = sel.value !== "__new"; };
      sel.onchange = sync;
      sync();
      const mv = mk("button", "btn alt", "Mover capítulo");
      mv.type = "button";
      mv.onclick = async () => {
        const target = sel.value === "__new" ? { title: nm.value.trim() } : { workId: sel.value };
        if (target.title === "") return nm.focus();
        await Library.moveChapter(ch, target);
        E.act.close();
        toast("Capítulo movido");
        await refreshWork();
      };
      const rm = confirmBtn("Remover capítulo", async () => {
        const r = await Library.removeChapter(ch);
        forget([ch]);
        E.act.close();
        toast("Capítulo removido");
        if (r.workGone) history.back(); else await refreshWork();
      });
      b.append(field("Mover para", sel), nm, mv, rm);
    });
  }

  // ===== Abrir um capítulo da biblioteca =====
  async function openChapter(i, p = 0) {
    if (i < 0 || i >= st.files.length) return;
    savePos(true);
    const s = ++st.s;
    reset();
    setView("reader");
    const rec = st.files[i], name = rec.name;
    st.i = i;
    st.start = p;
    st.done = Boolean(pos[rec.sig]?.d);
    E.chapter.value = i;
    document.title = `${name} · ${APP}`;
    E.reader.hidden = E.end.hidden = true;
    document.querySelectorAll("[data-nav]").forEach((b) => {
      const t = i + +b.dataset.nav;
      b.disabled = t < 0 || t >= st.files.length;
    });
    warn(`Abrindo ${name}…`);
    try {
      if (!window.JSZip) throw new Error("A biblioteca JSZip não carregou. Recarregue a página.");
      const zip = await JSZip.loadAsync(await Library.getFile(rec));
      if (s !== st.s) return;
      const ents = Object.values(zip.files)
        .filter((e) => !e.dir && IMG.test(e.name) && !e.name.split("/").some((p) => p[0] === "." || p === "__MACOSX"))
        .sort((a, b) => collator.compare(a.name, b.name));
      if (!ents.length) throw new Error("Este arquivo não tem imagens de página.");
      E.endtitle.textContent = `Fim de ${name}`;
      build(ents);
      warn("");
      say(`${name}: ${ents.length} páginas.`);
      rec.pages = ents.length;
      Library.setPages(rec.id, ents.length).catch(() => {});
      autoCover(ents[0]);
    } catch (err) {
      if (s !== st.s) return;
      warn(`Não foi possível abrir ${name}. ${err.message}`, 8000);
      history.back(); // volta para a obra
    }
  }

  // Obra sem poster ganha capa do topo da primeira página aberta (feito depois, sem atrapalhar a leitura)
  const coverTried = new Set();
  function autoCover(entry) {
    const w = st.work;
    if (!w || w.cover || coverTried.has(w.id)) return;
    coverTried.add(w.id);
    setTimeout(async () => {
      try {
        const b = await Library.thumb(await entry.async("blob"), { top: true });
        if (await Library.setCover(w.id, b, "auto")) w.cover = b;
      } catch {}
    }, 2500);
  }

  // ===== Páginas: só as próximas da tela ficam extraídas e decodificadas =====
  const ph = (p) => {
    const s = document.createElement("span");
    s.textContent = `Página ${p.n + 1}`;
    return s;
  };

  function build(ents) {
    const total = ents.length;
    st.pages = ents.map((entry, n) => {
      const el = document.createElement("div");
      el.className = "page";
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", `Página ${n + 1} de ${total}`);
      const p = { n, entry, el, status: "idle", keep: false, url: null, img: null };
      el._p = p;
      el.append(ph(p));
      return p;
    });
    E.reader.style.removeProperty("--ar");
    E.reader.replaceChildren(...st.pages.map((p) => p.el));
    E.reader.hidden = E.end.hidden = false;
    E.tot.textContent = total;

    const at = Math.min(st.start, total - 1);
    st.cur = at;
    E.cur.textContent = at + 1;
    if (at > 0) {
      scrollTo(0, scrollY + st.pages[at].el.getBoundingClientRect().top - E.topbar.offsetHeight);
      toast(`Retomando da página ${at + 1}`);
    } else scrollTo(0, 0);
    lastY = scrollY;

    observe();
    showUI(true);
    onScroll();
    awake();
    E.viewer.focus({ preventScroll: true });
    if (auto.next) { auto.next = false; setTimeout(autoStart, 1200); }
  }

  function observe() {
    ["keep", "load", "line"].forEach((k) => io[k]?.disconnect());
    st.want.clear();
    if (!st.pages.length) return;
    const h = innerHeight, low = eco(), px = (k) => Math.round(h * k);
    io.keep = new IntersectionObserver((es) => es.forEach((x) => {
      const p = x.target._p;
      p.keep = x.isIntersecting;
      if (!p.keep) unload(p);
    }), { rootMargin: `${px(low ? 1.5 : 3.5)}px 0px` });
    io.load = new IntersectionObserver((es) => {
      es.forEach((x) => (x.isIntersecting ? st.want.add(x.target._p) : st.want.delete(x.target._p)));
      pump();
    }, { rootMargin: `${px(low ? .25 : .75)}px 0px ${px(low ? .75 : 1.75)}px` });
    io.line = new IntersectionObserver((es) => es.forEach((x) => {
      if (x.isIntersecting) setCur(x.target._p.n);
    }), { rootMargin: "-45% 0px -54% 0px" });
    st.pages.forEach((p) => { io.keep.observe(p.el); io.load.observe(p.el); io.line.observe(p.el); });
  }

  // Fila com limite de concorrência: sempre a página mais perto do centro da tela primeiro
  function pump() {
    const max = eco() ? 1 : 2;
    while (st.busy < max) {
      const mid = innerHeight / 2;
      let best = null, bd = Infinity;
      for (const p of st.want) {
        if (p.status !== "idle") continue;
        const r = p.el.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) return;
      load(best);
    }
  }

  async function load(p) {
    const s = st.s;
    p.status = "loading";
    st.busy++;
    let url;
    try {
      url = URL.createObjectURL(await p.entry.async("blob"));
      const img = new Image();
      img.className = "img";
      img.alt = `Página ${p.n + 1} de ${st.pages.length}`;
      img.decoding = "async";
      img.src = url;
      await img.decode(); // decodifica fora da thread principal antes de mostrar
      if (s !== st.s || (!p.keep && !st.want.has(p))) {
        URL.revokeObjectURL(url);
        if (s === st.s) p.status = "idle";
        return;
      }
      const ratio = `${img.naturalWidth} / ${img.naturalHeight}`;
      anchored(() => {
        p.el.style.aspectRatio = ratio;
        if (!st.ar) { st.ar = 1; E.reader.style.setProperty("--ar", ratio); } // estimativa para páginas ainda não medidas
        p.el.replaceChildren(img);
      });
      p.url = url; p.img = img; p.status = "ready";
    } catch {
      if (url) URL.revokeObjectURL(url);
      if (s === st.s) {
        p.status = "error";
        const d = document.createElement("div");
        d.className = "err";
        d.innerHTML = `<p>Não foi possível abrir a página ${p.n + 1}.</p><button type="button" class="btn" data-retry>Tentar de novo</button>`;
        p.el.replaceChildren(d);
      }
    } finally {
      if (s === st.s) { st.busy--; pump(); }
    }
  }

  function unload(p) {
    if (p.status !== "ready") return;
    p.img.removeAttribute("src");
    URL.revokeObjectURL(p.url);
    p.img = p.url = null;
    p.status = "idle";
    p.el.replaceChildren(ph(p)); // a proporção medida fica no elemento, então a rolagem não pula
  }

  // Mantém a página atual parada quando algo acima dela muda de altura
  function anchored(fn) {
    const a = st.pages[st.cur]?.el, t = a?.getBoundingClientRect().top;
    fn();
    if (!a) return;
    const d = a.getBoundingClientRect().top - t;
    if (d) { scrollBy(0, d); lastY = scrollY; if (auto.on) auto.y += d; }
  }

  function reset() {
    ["keep", "load", "line"].forEach((k) => io[k]?.disconnect());
    st.pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    Object.assign(st, { pages: [], busy: 0, ar: 0, done: false });
    st.want.clear();
    E.reader.replaceChildren();
    autoStop();
  }

  // ===== Rolagem, progresso e barras =====
  let lastY = 0, tick = false;
  function onScroll() {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => {
      tick = false;
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight, dy = y - lastY;
      E.bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      if (y < 80 || y >= max - 8) showUI(true);
      else if (Math.abs(dy) > 14) showUI(dy < 0);
      if (Math.abs(dy) > 14) lastY = y;
      if (max > 0 && y >= max - 8 && !st.done && st.pages.length) { st.done = true; savePos(); }
    });
  }
  function showUI(v) {
    if (view !== "reader") return;
    const focused = E.topbar.contains(document.activeElement) || E.dock.contains(document.activeElement);
    if (!v && (!S.autoHide || focused)) return;
    document.body.classList.toggle("immersive", !v);
  }
  addEventListener("scroll", onScroll, { passive: true });
  let w = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth !== w) { w = innerWidth; if (S.width == null) anchored(apply); observe(); }
  });

  // ===== Rolagem automática =====
  const auto = { on: false, raf: 0, t: 0, y: 0, next: false };
  function autoStep(t) {
    if (!auto.on) return;
    const dt = Math.min(64, t - auto.t);
    auto.t = t;
    if (Math.abs(scrollY - auto.y) > 3) auto.y = scrollY; // o leitor mexeu na tela
    auto.y += (S.speed * 20 * dt) / 1000;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (auto.y >= max) {
      scrollTo(0, max);
      autoStop();
      if (S.autoNext && st.i < st.files.length - 1) { auto.next = true; go(1); }
      else toast("Fim do capítulo");
      return;
    }
    scrollTo(0, auto.y);
    auto.raf = requestAnimationFrame(autoStep);
  }
  function autoStart() {
    if (!st.pages.length || auto.on) return;
    auto.on = true;
    auto.y = scrollY;
    auto.t = performance.now();
    E.play.setAttribute("aria-pressed", "true");
    E.play.setAttribute("aria-label", "Pausar rolagem automática");
    showUI(false);
    say("Rolagem automática ligada.");
    auto.raf = requestAnimationFrame(autoStep);
  }
  function autoStop() {
    if (!auto.on) return;
    auto.on = false;
    cancelAnimationFrame(auto.raf);
    E.play.setAttribute("aria-pressed", "false");
    E.play.setAttribute("aria-label", "Iniciar rolagem automática");
    say("Rolagem automática pausada.");
  }
  const toggleAuto = () => (auto.on ? autoStop() : autoStart());
  // Tocar na tela, girar a roda do mouse ou usar o teclado pausa a rolagem
  addEventListener("pointerdown", (e) => { if (!e.target.closest(".dock, .topbar, dialog")) autoStop(); });
  addEventListener("wheel", autoStop, { passive: true });

  // ===== Tela cheia =====
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener("fullscreenchange", () => {
    E.fs.setAttribute("aria-pressed", Boolean(document.fullscreenElement));
    E.fs.setAttribute("aria-label", document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia");
  });

  // ===== Interações =====
  const go = (d) => st.files.length && openChapter(st.i + d);
  document.addEventListener("click", (e) => {
    const t = e.target;
    const pk = t.closest("[data-pick]");
    if (pk) return pick(pk.dataset.pick);
    if (t.closest("[data-open]")) return showSheet(E.addsheet);
    if (t.closest("[data-back]") || t.closest("#back")) return history.back();
    const n = t.closest("[data-nav]");
    if (n) return go(+n.dataset.nav);
    if (t.closest("[data-settings]")) { syncForm(); syncInstall(); tab(0); return showSheet(E.settings); }
    if (t.closest("#play")) { if (e.detail) t.closest("#play").blur(); return toggleAuto(); }
    if (t.closest("#fs")) return toggleFs();
    const rs = t.closest("#resume, #workresume");
    if (rs) return read(rs.dataset.work, +rs.dataset.i, +rs.dataset.p);
    const card = t.closest(".card");
    if (card) return showWork(card.dataset.work, true);
    const ch = t.closest(".chap");
    if (ch) {
      const r = pos[st.files[+ch.dataset.i].sig];
      return read(st.work.id, +ch.dataset.i, r && !r.d ? r.p : 0);
    }
    const cm = t.closest("[data-chmenu]");
    if (cm) return chapterMenu(+cm.dataset.chmenu);
    if (t.closest("#more")) return workMenu();
    const r = t.closest("[data-retry]");
    if (r) {
      const p = r.closest(".page")._p;
      p.status = "idle";
      p.el.replaceChildren(ph(p));
      return pump();
    }
    if (t.closest(".page") && !getSelection().toString()) document.body.classList.toggle("immersive");
  });
  E.file.addEventListener("change", () => { const l = [...E.file.files]; E.file.value = ""; addFiles(l); });
  E.folder.addEventListener("change", () => { const l = [...E.folder.files]; E.folder.value = ""; addFiles(l); });
  E.chapter.addEventListener("change", () => openChapter(+E.chapter.value));
  addEventListener("keydown", (e) => {
    if (view !== "reader" || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || document.querySelector("dialog[open]") || /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft") go(-1);
    else if (k === "arrowright") go(1);
    else if (k === "a") toggleAuto();
    else if (k === "f") toggleFs();
    else if (["arrowup", "arrowdown", "pageup", "pagedown", " ", "home", "end"].includes(k)) autoStop();
  });
  addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("drag"); });
  addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("drag"); });
  addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("drag"); addFiles([...e.dataTransfer.files]); });

  // Botão voltar do Android: leitor → obra → biblioteca
  addEventListener("popstate", (e) => {
    const s = e.state || { v: "library" };
    if (s.v === "work" && s.id) showWork(s.id, false);
    else if (s.v === "reader" && st.pages.length) setView("reader");
    else showLibrary();
  });

  // ===== Tela acesa durante a leitura =====
  let wl;
  async function awake() {
    try {
      if (S.awake && st.pages.length && document.visibilityState === "visible") {
        if (!wl) { wl = await navigator.wakeLock.request("screen"); wl.onrelease = () => { wl = null; }; }
      } else if (wl) await wl.release();
    } catch {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { autoStop(); savePos(true); }
    awake();
  });
  addEventListener("pagehide", () => savePos(true));

  // Tema "Automático" acompanha o sistema
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (S.theme === "auto") apply(); });

  // ===== App instalável (PWA) =====
  // Instalar: o Chrome do Android avisa quando dá para instalar; o botão fica nos ajustes.
  let installEvt = null, updating = false;
  const standalone = () => matchMedia("(display-mode: standalone)").matches;
  function syncInstall() { E.installrow.hidden = !installEvt || standalone(); }
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; syncInstall(); });
  addEventListener("appinstalled", () => { installEvt = null; syncInstall(); toast("App instalado"); });
  E.install.addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice.catch(() => {});
    installEvt = null;
    syncInstall();
  });

  // Atualizar: a versão nova espera o leitor tocar em "Atualizar" (nunca recarrega no meio da leitura).
  function offerUpdate(worker) {
    E.update.hidden = false;
    E.doupdate.onclick = () => { updating = true; worker.postMessage("atualizar"); };
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (updating) location.reload(); });
    addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) offerUpdate(nw);
          });
        });
        // App aberto por muito tempo: confere se há versão nova ao voltar para ele
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      }).catch(() => {});
    });
  }

  // Escolher pasta só aparece onde o navegador sabe fazer isso
  const canFolder = "webkitdirectory" in E.folder;
  document.querySelectorAll("[data-folder]").forEach((b) => { b.hidden = !canFolder; });
  document.getElementById("folderhint").hidden = !canFolder;

  async function boot() {
    history.replaceState({ v: "library" }, "");
    if (!window.Library) { st.empty = true; setView("library"); return warn("A biblioteca não carregou. Recarregue a página.", 0); }
    try { await Library.init(); }
    catch { st.empty = true; setView("library"); return warn("Não foi possível abrir o armazenamento deste navegador. A biblioteca não vai funcionar.", 0); }
    await showLibrary();
  }

  apply();
  if (!window.JSZip) warn("A biblioteca JSZip não carregou. Recarregue a página.");
  boot();
})();
