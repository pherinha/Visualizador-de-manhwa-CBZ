(() => {
  "use strict";

  const E = Object.fromEntries(
    "topbar open chapters chapter viewer notice toast welcome reader end endtitle dock count cur tot prog bar dim live settings file play fs reset"
      .split(" ").map((id) => [id, document.getElementById(id)])
  );
  const form = E.settings.querySelector("form").elements;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const IMG = /\.(jpe?g|png|gif|webp|avif)$/i;
  const root = document.documentElement;

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

    E.prog.hidden = !S.showBar;
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
  const st = { files: [], i: -1, s: 0, pages: [], want: new Set(), busy: 0, cur: 0, ar: 0, start: 0, done: false };
  const io = {};
  const say = (m) => { E.live.textContent = m; };
  const warn = (m) => { E.notice.textContent = m; E.notice.hidden = !m; };
  let tt;
  function toast(m) {
    E.toast.textContent = m;
    E.toast.hidden = false;
    clearTimeout(tt);
    tt = setTimeout(() => { E.toast.hidden = true; }, 2400);
    say(m);
  }

  // ===== Onde parei (por capítulo, salvo no aparelho) =====
  const pos = store(POS) || {};
  const fkey = (f) => f.name + "|" + f.size;
  let pt;
  function savePos(now) {
    if (!S.remember || !st.pages.length) return;
    clearTimeout(pt);
    const run = () => {
      if (!st.pages.length || !st.files[st.i]) return;
      pos[fkey(st.files[st.i])] = { p: st.cur, t: Date.now(), d: st.done };
      const keys = Object.keys(pos);
      if (keys.length > 300) keys.sort((a, b) => pos[a].t - pos[b].t).slice(0, keys.length - 300).forEach((k) => delete pos[k]);
      put(POS, pos);
    };
    now ? run() : (pt = setTimeout(run, 600));
  }
  function setCur(n) {
    st.cur = n;
    E.cur.textContent = n + 1;
    savePos();
  }

  // ===== Abrir arquivos =====
  function setFiles(list) {
    const files = [...list].filter((f) => /\.(cbz|zip)$/i.test(f.name)).sort((a, b) => collator.compare(a.name, b.name));
    if (!files.length) return warn("Nenhum arquivo .cbz encontrado. Escolha arquivos com a extensão .cbz.");
    savePos(true); // guarda o ponto do capítulo atual antes de trocar a lista
    reset();
    st.files = files;
    E.chapter.replaceChildren(...files.map((f, n) => new Option(f.name.replace(/\.(cbz|zip)$/i, ""), n)));
    E.chapters.hidden = E.dock.hidden = false;

    // Retoma o último capítulo lido (e a página), se já tiver aberto estes arquivos antes
    let start = { i: 0, p: 0 };
    if (S.remember) {
      let bt = 0;
      files.forEach((f, i) => {
        const r = pos[fkey(f)];
        if (r && r.t > bt) { bt = r.t; start = { i, p: r.p, d: r.d }; }
      });
      if (start.d && start.i < files.length - 1) start = { i: start.i + 1, p: 0 };
    }
    openChapter(start.i, start.p);
  }

  async function openChapter(i, p = 0) {
    if (i < 0 || i >= st.files.length) return;
    savePos(true);
    const s = ++st.s;
    reset();
    st.i = i;
    st.start = p;
    const name = E.chapter.options[i].text;
    E.chapter.value = i;
    document.title = `${name} · Visualizador de Manhwa`;
    E.welcome.hidden = E.reader.hidden = E.end.hidden = true;
    document.querySelectorAll("[data-nav]").forEach((b) => {
      const t = i + +b.dataset.nav;
      b.disabled = t < 0 || t >= st.files.length;
    });
    warn(`Abrindo ${name}…`);
    try {
      if (!window.JSZip) throw new Error("A biblioteca JSZip não carregou. Recarregue a página.");
      const zip = await JSZip.loadAsync(st.files[i]);
      if (s !== st.s) return;
      const ents = Object.values(zip.files)
        .filter((e) => !e.dir && IMG.test(e.name) && !e.name.split("/").some((p) => p[0] === "." || p === "__MACOSX"))
        .sort((a, b) => collator.compare(a.name, b.name));
      if (!ents.length) throw new Error("Este arquivo não tem imagens de página.");
      E.endtitle.textContent = `Fim de ${name}`;
      build(ents);
      warn("");
      say(`${name}: ${ents.length} páginas.`);
    } catch (err) {
      if (s !== st.s) return;
      E.welcome.hidden = false;
      warn(`Não foi possível abrir ${name}. ${err.message}`);
    }
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
    if (t.closest("[data-open]")) return E.file.click();
    const n = t.closest("[data-nav]");
    if (n) return go(+n.dataset.nav);
    if (t.closest("#opensettings")) { syncForm(); tab(0); return E.settings.showModal(); }
    if (t.closest("#play")) { if (e.detail) t.closest("#play").blur(); return toggleAuto(); }
    if (t.closest("#fs")) return toggleFs();
    const r = t.closest("[data-retry]");
    if (r) {
      const p = r.closest(".page")._p;
      p.status = "idle";
      p.el.replaceChildren(ph(p));
      return pump();
    }
    if (t.closest(".page") && !getSelection().toString()) document.body.classList.toggle("immersive");
  });
  E.file.addEventListener("change", () => { setFiles(E.file.files); E.file.value = ""; });
  E.chapter.addEventListener("change", () => openChapter(+E.chapter.value));
  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || E.settings.open || /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft") go(-1);
    else if (k === "arrowright") go(1);
    else if (k === "a") toggleAuto();
    else if (k === "f") toggleFs();
    else if (["arrowup", "arrowdown", "pageup", "pagedown", " ", "home", "end"].includes(k)) autoStop();
  });
  addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("drag"); });
  addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("drag"); });
  addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("drag"); setFiles(e.dataTransfer.files); });

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

  E.fs.hidden = !document.fullscreenEnabled;
  apply();
  if (!window.JSZip) warn("A biblioteca JSZip não carregou. Recarregue a página.");
})();
