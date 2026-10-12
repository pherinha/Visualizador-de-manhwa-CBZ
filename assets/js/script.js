(() => {
  "use strict";

  const E = Object.fromEntries(
    "topbar open chapters chapter viewer notice welcome reader end endtitle dock cur tot bar dim live settings file"
      .split(" ").map((id) => [id, document.getElementById(id)])
  );
  const form = E.settings.querySelector("form").elements;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const IMG = /\.(jpe?g|png|gif|webp|avif)$/i;

  // ===== Ajustes (salvos no aparelho) =====
  const KEY = "cbz-reader:v1";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const S = { theme: "auto", width: "medium", dim: 0, autoHide: true, awake: true, eco: null, ...read() };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const lowEnd = () => navigator.connection?.saveData || navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2;
  const eco = () => S.eco ?? Boolean(lowEnd());

  function apply() {
    const r = document.documentElement;
    r.dataset.theme = S.theme;
    r.dataset.width = S.width;
    E.dim.style.opacity = S.dim / 100;
    E.dim.hidden = !S.dim;
    document.querySelector("meta[name=theme-color]").content = getComputedStyle(document.body).backgroundColor;
  }
  function syncForm() {
    form.theme.value = S.theme; form.width.value = S.width; form.dim.value = S.dim;
    form.autoHide.checked = S.autoHide; form.awake.checked = S.awake; form.eco.checked = eco();
  }
  E.settings.addEventListener("input", (e) => {
    Object.assign(S, { theme: form.theme.value, width: form.width.value, dim: +form.dim.value, autoHide: form.autoHide.checked, awake: form.awake.checked });
    if (e.target.name === "eco") { S.eco = form.eco.checked; observe(); }
    apply(); save(); awake();
  });
  E.settings.addEventListener("click", (e) => { if (e.target === E.settings) E.settings.close(); });

  // ===== Estado =====
  const st = { files: [], i: -1, s: 0, pages: [], want: new Set(), busy: 0, cur: 0, ar: 0 };
  const io = {};
  const say = (m) => { E.live.textContent = m; };
  const warn = (m) => { E.notice.textContent = m; E.notice.hidden = !m; };

  // ===== Abrir arquivos =====
  function setFiles(list) {
    const files = [...list].filter((f) => /\.(cbz|zip)$/i.test(f.name)).sort((a, b) => collator.compare(a.name, b.name));
    if (!files.length) return warn("Nenhum arquivo .cbz encontrado. Escolha arquivos com a extensão .cbz.");
    st.files = files;
    E.chapter.replaceChildren(...files.map((f, n) => new Option(f.name.replace(/\.(cbz|zip)$/i, ""), n)));
    E.chapters.hidden = E.dock.hidden = false;
    openChapter(0);
  }

  async function openChapter(i) {
    if (i < 0 || i >= st.files.length) return;
    const s = ++st.s;
    reset();
    st.i = i;
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
    E.cur.textContent = st.cur = 0;
    scrollTo(0, 0);
    observe();
    showUI(true);
    onScroll();
    awake();
    E.viewer.focus({ preventScroll: true });
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
      if (x.isIntersecting) { st.cur = x.target._p.n; E.cur.textContent = st.cur + 1; }
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
    if (d) { scrollBy(0, d); lastY = scrollY; }
  }

  function reset() {
    ["keep", "load", "line"].forEach((k) => io[k]?.disconnect());
    st.pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    Object.assign(st, { pages: [], busy: 0, ar: 0 });
    st.want.clear();
    E.reader.replaceChildren();
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
    });
  }
  function showUI(v) {
    const focused = E.topbar.contains(document.activeElement) || E.dock.contains(document.activeElement);
    if (!v && (!S.autoHide || focused)) return;
    document.body.classList.toggle("immersive", !v);
  }
  addEventListener("scroll", onScroll, { passive: true });
  let w = innerWidth;
  addEventListener("resize", () => { if (innerWidth !== w) { w = innerWidth; observe(); } });

  // ===== Interações =====
  const go = (d) => st.files.length && openChapter(st.i + d);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-open]")) return E.file.click();
    const n = t.closest("[data-nav]");
    if (n) return go(+n.dataset.nav);
    if (t.closest("#opensettings")) { syncForm(); return E.settings.showModal(); }
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
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
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
  document.addEventListener("visibilitychange", awake);

  apply();
  if (!window.JSZip) warn("A biblioteca JSZip não carregou. Recarregue a página.");
})();
