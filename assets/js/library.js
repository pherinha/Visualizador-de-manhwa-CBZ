/* Biblioteca local do Visualizador de Manhwa.
   - Os arquivos .cbz ficam no OPFS (armazenamento privado do site); se o navegador não puder gravar
     por lá, ficam no IndexedDB.
   - Os dados das obras e dos capítulos ficam no IndexedDB.
   - Nada sai do aparelho. */
(() => {
  "use strict";

  const DB = "cbz-library", VER = 1;
  const CBZ = /\.(cbz|zip)$/i;
  const POSTER = /^poster\.(jpe?g|png|gif|webp|avif)$/i; // imagem "poster" na pasta vira a capa da obra
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ===== IndexedDB =====
  let dbp;
  const open = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("works", { keyPath: "id" });
      const c = d.createObjectStore("chapters", { keyPath: "id" });
      c.createIndex("workId", "workId");
      c.createIndex("sig", "sig");
      d.createObjectStore("blobs", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("Banco de dados bloqueado por outra aba."));
  }));
  const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const os = async (n, m = "readonly") => (await open()).transaction(n, m).objectStore(n);
  const all = async (n, idx, key) => { const s = await os(n); return rq(idx ? s.index(idx).getAll(key) : s.getAll()); };
  const get = async (n, id) => rq((await os(n)).get(id));
  const put = async (n, v) => rq((await os(n, "readwrite")).put(v));
  const del = async (n, id) => rq((await os(n, "readwrite")).delete(id));

  // ===== OPFS =====
  const hasOPFS = () => Boolean(navigator.storage?.getDirectory && window.FileSystemFileHandle?.prototype?.createWritable);
  let dirp;
  const dir = () => (dirp ||= navigator.storage.getDirectory().then((r) => r.getDirectoryHandle("cbz", { create: true })));

  async function writeFile(id, file) {
    if (hasOPFS()) {
      const d = await dir();
      try {
        const fh = await d.getFileHandle(id + ".cbz", { create: true });
        await file.stream().pipeTo(await fh.createWritable()); // copia em fluxo, sem carregar o arquivo na memória
        return "opfs";
      } catch (e) {
        await d.removeEntry(id + ".cbz").catch(() => {});
        if (e?.name === "QuotaExceededError") throw e;
        // qualquer outro problema no OPFS: cai para o IndexedDB
      }
    }
    await put("blobs", { id, blob: file });
    return "idb";
  }
  async function removeFile(ch) {
    if (ch.store === "opfs") { try { await (await dir()).removeEntry(ch.id + ".cbz"); } catch {} }
    else await del("blobs", ch.id).catch(() => {});
  }
  async function getFile(ch) {
    if (ch.store === "opfs") return (await (await dir()).getFileHandle(ch.id + ".cbz")).getFile();
    const row = await get("blobs", ch.id);
    if (!row) throw new Error("O arquivo deste capítulo não está mais no aparelho.");
    return row.blob;
  }
  async function room() {
    try { const e = await navigator.storage.estimate(); return e.quota - e.usage; } catch { return Infinity; }
  }

  // ===== Obras e capítulos =====
  async function findWork(title) {
    const k = norm(title);
    return (await all("works")).find((w) => norm(w.title) === k) || null;
  }
  async function createWork(title) {
    const w = { id: uid(), title: title.trim() || "Sem título", cover: null, coverFrom: null, added: Date.now() };
    await put("works", w);
    return w;
  }
  const overview = async () => ({ works: await all("works"), chapters: await all("chapters") });
  const listChapters = async (workId) => (await all("chapters", "workId", workId)).sort((a, b) => collator.compare(a.name, b.name));

  async function setPages(id, n) {
    const c = await get("chapters", id);
    if (c && c.pages !== n) await put("chapters", { ...c, pages: n });
  }
  async function setCover(workId, blob, from) {
    const w = await get("works", workId);
    if (!w) return false;
    if (from === "auto" && w.cover) return false; // capa automática nunca substitui outra
    await put("works", { ...w, cover: blob, coverFrom: from });
    return true;
  }
  async function renameWork(id, title) {
    const t = title.trim();
    if (!t) return { id };
    const other = await findWork(t);
    if (other && other.id !== id) { // já existe uma obra com esse nome: junta as duas
      for (const c of await all("chapters", "workId", id)) await put("chapters", { ...c, workId: other.id });
      await del("works", id);
      return { id: other.id, merged: true };
    }
    const w = await get("works", id);
    if (w) await put("works", { ...w, title: t });
    return { id };
  }
  async function moveChapter(ch0, { workId, title }) {
    const ch = (await get("chapters", ch0.id)) || ch0; // sempre o registro atual (o da tela pode estar velho)
    const w = workId ? await get("works", workId) : (await findWork(title)) || (await createWork(title));
    if (!w || w.id === ch.workId) return w;
    const from = ch.workId;
    await put("chapters", { ...ch, workId: w.id });
    if (!(await all("chapters", "workId", from)).length) await del("works", from);
    return w;
  }
  async function removeChapter(ch0) {
    const ch = (await get("chapters", ch0.id)) || ch0;
    await removeFile(ch);
    await del("chapters", ch.id);
    if ((await all("chapters", "workId", ch.workId)).length) return { workGone: false };
    await del("works", ch.workId);
    return { workGone: true };
  }
  async function removeWork(id) {
    for (const c of await all("chapters", "workId", id)) { await removeFile(c); await del("chapters", c.id); }
    await del("works", id);
  }

  // ===== Miniaturas =====
  // top: recorta o topo da imagem em proporção 2:3 (capa automática de uma página longa de manhwa)
  async function thumb(blob, { w = 360, top = false } = {}) {
    const bmp = await createImageBitmap(blob);
    try {
      const sw = bmp.width, sh = top ? Math.min(bmp.height, Math.round(sw * 1.5)) : bmp.height;
      const k = Math.min(1, w / sw), cw = Math.max(1, Math.round(sw * k)), chh = Math.max(1, Math.round(sh * k));
      const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(cw, chh) : Object.assign(document.createElement("canvas"), { width: cw, height: chh });
      c.getContext("2d").drawImage(bmp, 0, 0, sw, sh, 0, 0, cw, chh);
      if (c.convertToBlob) return c.convertToBlob({ type: "image/webp", quality: 0.8 });
      return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/webp", 0.8));
    } finally { bmp.close?.(); }
  }

  // ===== Escolha de arquivos: o que foi selecionado e como agrupar =====
  // Tira "Cap 12", "Capítulo 12", "Ch.12", "Ep 3", "#12", "045", [Grupo] e (tags) do nome.
  function titleFromName(name) {
    let t = name.replace(CBZ, "");
    t = /\s/.test(t) ? t.replace(/_+/g, " ") : t.replace(/[._]+/g, " ");
    t = t.replace(/^\s*[\[(][^\])]*[\])]\s*/, "");
    let prev;
    do { prev = t; t = t.replace(/\s*[\[(][^\])]*[\])]\s*$/, ""); } while (t !== prev);
    t = t.replace(/[\s.\-–—]*(?:(?:cap(?:[ií]tulo)?|ch(?:apter)?|ep(?:is[oó]dio|isode)?|vol(?:ume)?|#)\.?\s*)?\d+(?:[.,]\d+)?\s*(?:v\d+|final|end)?\s*$/i, "");
    t = t.replace(/[\s.\-–—:]+$/, "").replace(/\s+/g, " ").trim();
    return t || "Sem título";
  }

  // Separa o que importa (CBZ e posters) do resto e descobre a pasta de cada arquivo.
  // hasPath = false quando o aparelho não informou as pastas (seleção solta de arquivos).
  function scan(fileList) {
    const cbz = [], posters = [];
    let ignored = 0, hasPath = false;
    for (const file of fileList) {
      const parts = file.webkitRelativePath ? file.webkitRelativePath.split("/") : [];
      const folder = parts.length > 1 ? parts[parts.length - 2] : "";
      if (parts.length > 1) hasPath = true;
      if (CBZ.test(file.name)) cbz.push({ file, folder });
      else if (POSTER.test(file.name)) posters.push({ file, folder });
      else ignored++;
    }
    return { cbz, posters, ignored, hasPath };
  }

  // mode: "folder" (cada pasta é uma obra) ou "name" (a obra vem do nome do arquivo)
  function group(sc, mode) {
    const useFolder = mode === "folder" && sc.hasPath;
    const map = new Map();
    for (const it of sc.cbz) {
      const title = useFolder && it.folder ? it.folder : titleFromName(it.file.name);
      const key = norm(title);
      let g = map.get(key);
      if (!g) map.set(key, (g = { title, items: [], folders: new Set(), poster: null }));
      g.items.push(it);
      g.folders.add(it.folder);
    }
    const groups = [...map.values()];
    groups.forEach((g) => g.items.sort((a, b) => collator.compare(a.file.name, b.file.name)));
    groups.sort((a, b) => collator.compare(a.title, b.title));

    // O poster de uma pasta vira a capa da obra que mora nela. Se a pasta tem mais de uma obra, é ambíguo.
    let ambiguous = 0;
    for (const p of sc.posters) {
      const owners = groups.filter((g) => g.folders.has(p.folder));
      if (owners.length === 1) { if (!owners[0].poster) owners[0].poster = p.file; }
      else if (owners.length > 1) ambiguous++;
    }
    return { groups, ambiguous, usedFolder: useFolder };
  }

  // ===== Importação =====
  async function importGroups(groups, { onProgress = () => {}, signal } = {}) {
    const out = { added: 0, dup: 0, failed: [], works: 0, stopped: null };
    const known = new Set((await all("chapters")).map((c) => c.sig));
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    let done = 0;
    for (const g of groups) {
      const title = g.title.trim() || "Sem título";
      let work = await findWork(title);
      for (const it of g.items) {
        if (signal?.aborted) { out.stopped = "cancelado"; return out; }
        const f = it.file, sig = f.name + "|" + f.size;
        onProgress({ done, total, name: f.name });
        if (known.has(sig)) { out.dup++; done++; continue; }
        let id = null, store = null;
        try {
          if ((await room()) < f.size * 1.1) throw Object.assign(new Error("sem espaço"), { name: "QuotaExceededError" });
          id = uid();
          store = await writeFile(id, f);
          work ||= await createWork(title);
          await put("chapters", { id, workId: work.id, name: f.name.replace(CBZ, ""), size: f.size, sig, store, pages: null, added: Date.now() });
          known.add(sig);
          out.added++;
        } catch (e) {
          if (id) await removeFile({ id, store }).catch(() => {});
          if (e?.name === "QuotaExceededError") { out.stopped = "espaço"; return out; }
          out.failed.push(f.name);
        }
        done++;
      }
      if (work) {
        out.works++;
        if (g.poster) { try { await setCover(work.id, await thumb(g.poster), "poster"); } catch {} }
      }
    }
    onProgress({ done, total, name: "" });
    return out;
  }

  // ===== Início e uso do espaço =====
  async function init() {
    await open();
    let persisted = false;
    try { persisted = (await navigator.storage.persisted?.()) || (await navigator.storage.persist?.()) || false; } catch {}
    return { opfs: hasOPFS(), persisted };
  }
  async function usage() {
    try {
      const e = await navigator.storage.estimate();
      return { used: e.usage, quota: e.quota, persisted: Boolean(await navigator.storage.persisted?.()) };
    } catch { return null; }
  }

  window.Library = {
    init, usage, hasOPFS, norm, titleFromName, scan, group, importGroups, thumb,
    overview, listChapters, getFile, setPages, setCover,
    renameWork, moveChapter, removeChapter, removeWork,
  };
})();
