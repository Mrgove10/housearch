'use strict';
// Housearch shared client JS — vanilla, progressive enhancement.

// ---- Lightbox carousel for photo galleries ----
(function () {
  let box, imgEl, countEl, items = [], idx = 0;

  let delEl;
  function build() {
    box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML =
      '<button class="lb-btn lb-close" aria-label="Close">✕</button>' +
      '<button class="lb-btn lb-del" aria-label="Delete" title="Delete (D)">🗑</button>' +
      '<button class="lb-btn lb-prev" aria-label="Previous">‹</button>' +
      '<img alt="">' +
      '<button class="lb-btn lb-next" aria-label="Next">›</button>' +
      '<div class="lb-count"></div>';
    document.body.appendChild(box);
    imgEl = box.querySelector('img');
    countEl = box.querySelector('.lb-count');
    delEl = box.querySelector('.lb-del');
    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
    box.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
    delEl.addEventListener('click', (e) => { e.stopPropagation(); del(); });
    // Click image to zoom further; click again to reset.
    imgEl.addEventListener('click', (e) => { e.stopPropagation(); imgEl.classList.toggle('zoomed'); });
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    // swipe
    let sx = 0;
    box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    });
  }

  function show() {
    imgEl.classList.remove('zoomed');
    imgEl.src = items[idx].url;
    delEl.style.display = items[idx].id ? '' : 'none';
    countEl.textContent = (idx + 1) + ' / ' + items.length;
    countEl.style.display = items.length > 1 ? '' : 'none';
    box.querySelector('.lb-prev').style.display = items.length > 1 ? '' : 'none';
    box.querySelector('.lb-next').style.display = items.length > 1 ? '' : 'none';
  }
  function step(d) { idx = (idx + d + items.length) % items.length; show(); }
  function del() {
    const cur = items[idx];
    if (!cur.id || !confirm('Delete this photo?')) return;
    fetch('/api/photos/' + cur.id + '/delete', { method: 'POST', headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then(() => {
        // drop the matching thumbnail from the page, then advance the carousel
        document.querySelectorAll('a.ph[data-photo-id="' + cur.id + '"], a[href="' + cur.url + '"]').forEach((el) => el.remove());
        items.splice(idx, 1);
        if (!items.length) return close();
        if (idx >= items.length) idx = items.length - 1;
        show();
      })
      .catch(() => {});
  }
  function open(list, start) {
    if (!box) build();
    items = list; idx = start;
    show();
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    box.classList.remove('open');
    document.body.style.overflow = '';
    imgEl.src = '';
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('.photos a, a.ph');
    if (!a || !a.getAttribute('href')) return;
    const gallery = a.closest('.photos') || document;
    const links = [...gallery.querySelectorAll('a.ph, a[href^="/photos/"]')];
    const list = links.map((l) => ({ url: l.getAttribute('href'), id: l.dataset.photoId || null }));
    const start = Math.max(0, links.indexOf(a));
    if (!list.length) return;
    e.preventDefault();
    open(list, start);
  });

  document.addEventListener('keydown', (e) => {
    if (!box || !box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'd' || e.key === 'D') del();
  });
})();

// ---- Segmented yes/no/? controls (auto-POST) ----
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.segmented button');
  if (!btn) return;
  const seg = btn.closest('.segmented');
  seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const url = seg.dataset.url;
  if (url) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: btn.dataset.value }),
    }).catch(() => {});
  }
});

// ---- Free-text / number checklist responses (auto-save on change) ----
document.addEventListener('change', (e) => {
  const inp = e.target.closest('input[data-response-url]');
  if (!inp) return;
  fetch(inp.dataset.responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: inp.value }),
  }).catch(() => {});
});

// ---- Score criteria toggles (live recompute) ----
document.addEventListener('click', (e) => {
  const tg = e.target.closest('.toggle-btn[data-score-url]');
  if (!tg) return;
  const on = !tg.classList.contains('on');
  tg.classList.toggle('on', on);
  fetch(tg.dataset.scoreUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: on ? 1 : 0 }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (d && typeof d.total === 'number') {
        document.querySelectorAll('[data-score-total]').forEach((el) => {
          el.textContent = (d.total > 0 ? '+' : d.total < 0 ? '−' : '') + Math.abs(d.total);
          el.className = 'score ' + (d.total > 0 ? 'good' : d.total < 0 ? 'bad' : '');
        });
      }
    })
    .catch(() => {});
});

// ---- Paste-from-clipboard buttons ----
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-paste-into]');
  if (!b) return;
  e.preventDefault();
  try {
    const text = await navigator.clipboard.readText();
    const target = document.querySelector(b.dataset.pasteInto);
    if (target) target.value = text;
  } catch (err) {
    alert('Clipboard read blocked. Paste manually (Ctrl+V).');
  }
});

// ---- Geolocation button (settings) ----
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-geolocate]');
  if (!b) return;
  e.preventDefault();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = document.querySelector(b.dataset.lat);
      const lng = document.querySelector(b.dataset.lng);
      if (lat) lat.value = pos.coords.latitude.toFixed(6);
      if (lng) lng.value = pos.coords.longitude.toFixed(6);
    },
    () => alert('Could not get location.')
  );
});

// ---- Photo upload zones (drag-drop, browse, paste, progress) ----
function initUploadZone(zone) {
  const url = zone.dataset.uploadUrl;
  const input = zone.querySelector('input[type=file]');
  const list = document.querySelector(zone.dataset.previewList || '#upload-list') || createList(zone);

  function createList(z) {
    const d = document.createElement('div');
    d.className = 'upload-list';
    z.after(d);
    return d;
  }

  function uploadFiles(files) {
    [...files].forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const item = document.createElement('div');
      item.className = 'upload-item';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      const bar = document.createElement('div');
      bar.className = 'bar';
      item.append(img, bar);
      list.prepend(item);

      const fd = new FormData();
      fd.append('photos', file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) bar.style.width = (ev.loaded / ev.total) * 100 + '%';
      };
      xhr.onload = () => {
        bar.style.width = '100%';
        item.classList.add('done');
        if (xhr.status >= 200 && xhr.status < 300) {
          // reload to show server-rendered thumbnails after the batch settles
          clearTimeout(window.__reloadT);
          window.__reloadT = setTimeout(() => location.reload(), 600);
        }
      };
      xhr.onerror = () => { bar.style.background = 'var(--bad)'; };
      xhr.send(fd);
    });
  }

  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); })
  );
  zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });
  if (input) input.addEventListener('change', () => { if (input.files.length) uploadFiles(input.files); });

  // paste from clipboard while focused on the page
  document.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (files.length) uploadFiles(files);
  });
}
document.querySelectorAll('[data-upload-url]').forEach(initUploadZone);

// ---- Generic dropzone visual only (import file) ----
document.querySelectorAll('.dropzone[data-visual]').forEach((dz) => {
  ['dragenter', 'dragover'].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove('over'); }));
});

// ---- Copy-to-clipboard buttons ([data-copy=<element id>]) ----
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const src = document.getElementById(btn.getAttribute('data-copy'));
  if (!src) return;
  const text = src.innerText;
  const done = () => {
    const old = btn.textContent;
    btn.textContent = 'Copié ✓';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
});
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (_) {}
  document.body.removeChild(ta);
}

// ---- Message templates: toggle inline edit form ----
document.addEventListener('click', function (e) {
  const edit = e.target.closest('[data-edit]');
  const cancel = e.target.closest('[data-cancel]');
  const id = edit ? edit.getAttribute('data-edit') : cancel ? cancel.getAttribute('data-cancel') : null;
  if (!id) return;
  const card = document.querySelector('.msg-card[data-msg="' + id + '"]');
  if (!card) return;
  const showEdit = !!edit;
  card.querySelector('.msg-view').hidden = showEdit;
  card.querySelector('.msg-edit').hidden = !showEdit;
});
