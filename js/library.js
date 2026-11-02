/* Backstory: My library. Caitlin asked for "a way to specifically save readings, like a little library."
   Each saved reading keeps its folder, the topic it came from, where you are with it, and your note. All in this browser. */
(function () {
  const { $, esc, snip, toast, save } = App;
  const STATUS = [["to-read", "To read"], ["reading", "Reading"], ["done", "Finished"]];
  const lib = () => App.st.library;

  function has(key) { return lib().some(l => l.key === key); }
  function toggle(it, s) {
    const i = lib().findIndex(l => l.key === it.key);
    if (i >= 0) { lib().splice(i, 1); save(); App.drawFolders(); toast("Removed from your library."); return false; }
    const keep = ({ key, kind, src, title, authors, year, venue, pages, access, links }) => ({ key, kind, src, title, authors, year, venue, pages, access, links });
    lib().unshift({ key: it.key, item: keep(it), folderId: s.folderId, topic: s.title, searchId: s.id, status: "to-read", note: "", added: Date.now() });
    save(); App.drawFolders(); toast(`Saved to your library, in "${App.folderName(s.folderId)}".`); return true;
  }

  function cite(l) {
    const it = l.item, a = it.authors?.length ? it.authors.join(", ") + ". " : "";
    return `${a}${it.title}.${it.venue ? " " + it.venue + "." : ""}${it.year ? " " + it.year + "." : ""} ${it.access?.url || it.links?.[0]?.url || ""}`.trim();
  }

  function draw() {
    const f = $("#libFolder").value, list = lib().filter(l => !f || l.folderId === f);
    if (!list.length) {
      $("#libBody").innerHTML = `<p class="empty-lib">${lib().length ? "Nothing saved in this folder yet." : "Nothing saved yet. On a reading list, press <b>Save to library</b> on anything you want to keep."}</p>`;
      return;
    }
    $("#libBody").innerHTML = STATUS.map(([k, label]) => {
      const rows = list.filter(l => l.status === k);
      return `<section class="shelf" aria-labelledby="shelf-${k}"><h2 id="shelf-${k}">${label} <span class="count">${rows.length}</span></h2>
        ${rows.length ? `<ul class="lib-list">${rows.map(l => `<li class="lib-item" data-key="${esc(l.key)}">
          <div class="lib-main">
            <h3><a href="${esc(l.item.access?.url)}" target="_blank" rel="noopener">${esc(l.item.title)}</a></h3>
            <p class="meta">${[l.item.authors?.join(", "), l.item.year, App.rank.KIND_LABEL[l.item.kind]].filter(Boolean).map(esc).join(" · ")}</p>
            <p class="meta">From the topic “${esc(snip(l.topic, 70))}” · ${esc(App.folderName(l.folderId))} · <a href="${esc(l.item.access?.url)}" target="_blank" rel="noopener">${esc(l.item.access?.label || "Open")}</a></p>
            <label class="field" for="note-${esc(l.key)}">My note</label>
            <textarea id="note-${esc(l.key)}" rows="2" data-note="${esc(l.key)}" placeholder="What did this teach you? What do you still want to know?">${esc(l.note)}</textarea>
          </div>
          <div class="lib-side">
            <label class="field" for="st-${esc(l.key)}">Status</label>
            <select id="st-${esc(l.key)}" data-status="${esc(l.key)}">${STATUS.map(([v, t]) => `<option value="${v}" ${v === l.status ? "selected" : ""}>${t}</option>`).join("")}</select>
            <label class="field" for="fo-${esc(l.key)}">Folder</label>
            <select id="fo-${esc(l.key)}" data-folder="${esc(l.key)}">${App.st.folders.map(fo => `<option value="${fo.id}" ${fo.id === l.folderId ? "selected" : ""}>${esc(fo.name)}</option>`).join("")}</select>
            <button class="btn small ghost" data-remove="${esc(l.key)}">Remove</button>
          </div></li>`).join("")}</ul>` : `<p class="hint">None.</p>`}</section>`;
    }).join("");
  }

  const find = k => lib().find(l => l.key === k);
  $("#libBody").addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.status) { find(t.dataset.status).status = t.value; save(); draw(); $(`#st-${CSS.escape(t.dataset.status)}`)?.focus(); }
    if (t.dataset.folder) { find(t.dataset.folder).folderId = t.value; save(); App.drawFolders(); draw(); }
  });
  let noteT;
  $("#libBody").addEventListener("input", e => { const t = e.target; if (!t.dataset.note) return; find(t.dataset.note).note = t.value; clearTimeout(noteT); noteT = setTimeout(save, 400); });
  $("#libBody").addEventListener("click", e => {
    const b = e.target.closest("[data-remove]"); if (!b) return;
    const i = lib().findIndex(l => l.key === b.dataset.remove);
    if (lib()[i].note && !confirm("Remove this reading and your note on it?")) return;
    lib().splice(i, 1); save(); App.drawFolders(); draw();
  });
  $("#libFolder").addEventListener("change", draw);
  $("#btnCopyList").addEventListener("click", () => {
    const f = $("#libFolder").value, list = lib().filter(l => !f || l.folderId === f);
    if (!list.length) { toast("Nothing to copy yet."); return; }
    const txt = `Reading list${f ? ": " + App.folderName(f) : ""} (from Backstory)\n\n` + STATUS.map(([k, label]) => {
      const rows = list.filter(l => l.status === k); if (!rows.length) return "";
      return `${label.toUpperCase()}\n` + rows.map(l => "- " + cite(l) + (l.note ? `\n  Note: ${l.note}` : "")).join("\n");
    }).filter(Boolean).join("\n\n");
    App.copy(txt, "Reading list copied.");
  });

  App.lib = { has, toggle, cite };
  App.drawLibrary = draw;
})();
