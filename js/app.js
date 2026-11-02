/* Backstory: shared helpers, saved state, folders, and the page's views.
   Everything is kept in this browser's localStorage under "backstory.v1". Nothing is sent to a server of ours. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = "backstory.v1";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const snip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const pct = v => Math.round(v * 100) + "%";

  let toastT;
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 3200); }

  /* ---------- saved state ---------- */
  const blank = () => ({ folders: [{ id: "f-main", name: "My topics" }], searches: {}, library: [], current: null, folder: "f-main" });
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { st = blank(); }
  if (!st.folders || !st.folders.length) st = blank();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch {
      // storage full: drop the oldest searches' raw text first, then the oldest searches
      const old = Object.values(st.searches).sort((a, b) => a.created - b.created);
      old.forEach(s => { if (s.input) s.input.text = (s.input.text || "").slice(0, 600); });
      try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { toast("This browser's storage is full. Delete an old folder to make room."); }
    }
  }

  /* ---------- folders ---------- */
  const folderName = id => (st.folders.find(f => f.id === id) || st.folders[0]).name;
  function drawFolders() {
    const ul = $("#folders");
    ul.innerHTML = st.folders.map(f => {
      const items = Object.values(st.searches).filter(s => s.folderId === f.id).sort((a, b) => b.created - a.created);
      const saved = st.library.filter(l => l.folderId === f.id).length;
      return `<li class="folder ${f.id === st.folder ? "open" : ""}" data-fid="${f.id}">
        <div class="folder-row">
          <button class="folder-name" aria-expanded="${f.id === st.folder}" data-open="${f.id}">
            <svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h5l1.6 1.8h8.4v8.7h-15z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            <span>${esc(f.name)}</span></button>
          <span class="folder-meta">${items.length} topic${items.length === 1 ? "" : "s"}${saved ? ` · ${saved} saved` : ""}</span>
          <button class="kebab" data-fmenu="${f.id}" aria-label="Rename or delete ${esc(f.name)}">⋯</button>
        </div>
        <ul class="topics">${items.map(s => `<li><button class="topic ${s.id === st.current ? "on" : ""}" data-sid="${s.id}" ${s.id === st.current ? 'aria-current="true"' : ""}>${esc(snip(s.title, 60))}</button><button class="topic-x" data-del="${s.id}" aria-label="Delete topic ${esc(snip(s.title, 40))}">×</button></li>`).join("") || `<li class="empty">No topics yet.</li>`}</ul>
      </li>`;
    }).join("");
    const opts = st.folders.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("");
    $("#saveFolder").innerHTML = opts; $("#saveFolder").value = st.folder;
    const lf = $("#libFolder"), keep = lf.value;
    lf.innerHTML = `<option value="">All folders</option>` + opts; lf.value = st.folders.some(f => f.id === keep) ? keep : "";
    $("#libCount").textContent = st.library.length;
  }
  function addFolder(name) {
    name = name.trim(); if (!name) return null;
    const f = { id: "f-" + uid(), name: name.slice(0, 60) };
    st.folders.push(f); st.folder = f.id; save(); drawFolders(); return f;
  }
  $("#btnNewFolder").addEventListener("click", () => { const f = $("#newFolderForm"); f.hidden = !f.hidden; if (!f.hidden) $("#newFolderName").focus(); });
  $("#newFolderForm").addEventListener("submit", e => {
    e.preventDefault();
    if (addFolder($("#newFolderName").value)) { $("#newFolderName").value = ""; $("#newFolderForm").hidden = true; toast("Folder added."); }
  });
  $("#folders").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.open) { st.folder = st.folder === b.dataset.open ? "" : b.dataset.open; if (st.folder) $("#saveFolder").value = st.folder; save(); drawFolders(); }
    else if (b.dataset.sid) { App.showSearch(b.dataset.sid); closeDrawer(); }
    else if (b.dataset.del) {
      const s = st.searches[b.dataset.del];
      if (confirm(`Delete the topic "${snip(s.title, 60)}"? Readings you saved from it stay in your library.`)) {
        delete st.searches[b.dataset.del]; if (st.current === b.dataset.del) { st.current = null; $("#results").hidden = true; }
        save(); drawFolders();
      }
    } else if (b.dataset.fmenu) folderMenu(b.dataset.fmenu);
  });
  function folderMenu(id) {
    const f = st.folders.find(x => x.id === id);
    const name = prompt(`Rename "${f.name}" (or clear the name and press OK to delete the folder):`, f.name);
    if (name === null) return;
    if (name.trim()) { f.name = name.trim().slice(0, 60); save(); drawFolders(); return; }
    if (st.folders.length === 1) { toast("Keep at least one folder."); return; }
    if (!confirm(`Delete "${f.name}" and its topics? Saved readings move to "${st.folders.find(x => x.id !== id).name}".`)) return;
    const to = st.folders.find(x => x.id !== id).id;
    Object.values(st.searches).forEach(s => { if (s.folderId === id) delete st.searches[s.id]; });
    st.library.forEach(l => { if (l.folderId === id) l.folderId = to; });
    st.folders = st.folders.filter(x => x.id !== id); if (st.folder === id) st.folder = to;
    save(); drawFolders(); App.drawLibrary && App.drawLibrary();
  }

  /* ---------- views ---------- */
  function view(which) {
    $("#viewSearch").hidden = which !== "search"; $("#viewLibrary").hidden = which !== "library";
    $("#navSearch").toggleAttribute("aria-current", which === "search"); $("#navLibrary").toggleAttribute("aria-current", which === "library");
    if (which === "library") App.drawLibrary();
    $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0);
  }
  $("#navSearch").addEventListener("click", () => view("search"));
  $("#navLibrary").addEventListener("click", () => view("library"));
  $("#navCredits").addEventListener("click", () => $("#dlgCredits").showModal());

  /* ---------- the four ways in ---------- */
  let mode = "topic";
  $$(".modes [role=tab]").forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));
  $(".modes").addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tabs = $$(".modes [role=tab]"), i = tabs.findIndex(t => t.dataset.mode === mode);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; setMode(n.dataset.mode); n.focus();
  });
  function setMode(m) {
    mode = m;
    $$(".modes [role=tab]").forEach(t => { const on = t.dataset.mode === m; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    $$(".mode").forEach(p => p.hidden = p.id !== "mode" + m[0].toUpperCase() + m.slice(1));
  }

  /* ---------- drawer on phones ---------- */
  function closeDrawer() { document.body.classList.remove("drawer"); $("#btnDrawer").setAttribute("aria-expanded", "false"); }
  $("#btnDrawer").addEventListener("click", () => { const on = document.body.classList.toggle("drawer"); $("#btnDrawer").setAttribute("aria-expanded", on); if (on) $("#side button").focus(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("drawer")) { closeDrawer(); $("#btnDrawer").focus(); } });
  document.addEventListener("click", e => { if (document.body.classList.contains("drawer") && !e.target.closest("#side, #btnDrawer")) closeDrawer(); });

  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); toast(done); } catch { toast("Couldn't copy. Select the text and copy it yourself."); }
      t.remove();
    }
  }

  window.App = {
    $, $$, esc, snip, uid, pct, toast, copy, save, view, setMode, closeDrawer, drawFolders, addFolder, folderName,
    get st() { return st; }, get mode() { return mode; },
    cfg: window.BACKSTORY
  };
  drawFolders();
})();
