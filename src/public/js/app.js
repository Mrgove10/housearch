'use strict';
// Housearch shared client JS — vanilla, progressive enhancement.

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
