// ════════════════════════════════════════════════════════
// PEMBANTU TAMPILAN (UI HELPERS)
// ════════════════════════════════════════════════════════

// ── Notifikasi melayang (toast) ──
function showToast(judul, pesan, tipe) {
  tipe = tipe || 'success';
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const ikon = { success: 'check-circle-fill', danger: 'x-circle-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[tipe] || 'info-circle-fill';
  const el = document.createElement('div');
  el.className = 'toast-item toast-' + tipe;
  el.innerHTML = '<i class="bi bi-' + ikon + '"></i><div><div class="t-title">' + esc(judul) + '</div><div class="t-msg">' + esc(pesan) + '</div></div>';
  stack.appendChild(el);
  setTimeout(function () { el.classList.add('show'); }, 10);
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 300);
  }, 5000);
}

// ── Modal ──
function openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('show'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('show'); }

function openFormModal(judul, isiHtml, footerHtml) {
  document.getElementById('modalGenericTitle').innerHTML = judul;
  document.getElementById('modalGenericBody').innerHTML = isiHtml;
  document.getElementById('modalGenericFooter').innerHTML = footerHtml;
  openModal('modalGeneric');
}

function showConfirm(pesan, onYa, labelTombol) {
  document.getElementById('modalConfirmText').innerHTML = pesan;
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = labelTombol || 'Ya, Lanjutkan';
  const baru = btn.cloneNode(true);       // buang listener lama
  btn.parentNode.replaceChild(baru, btn);
  baru.addEventListener('click', onYa);
  openModal('modalConfirm');
}

// ── Tombol dengan status memuat ──
function setBtnLoading(btn, teks) {
  if (!btn) return;
  btn.dataset.htmlAsli = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span> ' + (teks || 'Menyimpan...');
}
function resetBtn(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn.dataset.htmlAsli) btn.innerHTML = btn.dataset.htmlAsli;
}

// ── Pengaman teks & format ──
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formatRupiah(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1).replace('.', ',') + ' jt';
  if (n >= 1e3) return 'Rp ' + (n / 1e3).toFixed(0) + ' rb';
  return 'Rp ' + n;
}

function formatRupiahFull(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function formatTgl(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatBulanTahun(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

function formatTglUntukInput(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function formatBulanTahunUntukInput(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}

function optionsHtml(list, terpilih) {
  return list.map(function (x) {
    return '<option value="' + esc(x) + '"' + (String(x) === String(terpilih) ? ' selected' : '') + '>' + esc(x) + '</option>';
  }).join('');
}

function tierClass(nama) {
  return { 'Pemula': 'pemula', 'Madya': 'madya', 'Pra Mandiri': 'pramandiri', 'Pramandiri': 'pramandiri', 'Mandiri': 'mandiri' }[nama] || 'madya';
}

// ── Kepala halaman ──
function pageHeader(kicker, judul1, judul2, deskripsi, aksiHtml) {
  return '<div class="page-header">' +
    '<div class="page-header-row">' +
      '<div>' +
        '<div class="page-kicker">' + esc(kicker) + '</div>' +
        '<h1 class="page-title">' + esc(judul1) + ' <span class="accent">' + esc(judul2) + '</span></h1>' +
        '<p class="page-desc">' + esc(deskripsi) + '</p>' +
      '</div>' +
      (aksiHtml ? '<div class="page-header-actions">' + aksiHtml + '</div>' : '') +
    '</div></div>';
}

function areaMemuat() {
  return '<div class="loading-inline"><div class="spinner"></div></div>';
}

function areaGagal(pesan, fungsiCobaLagi) {
  return '<div class="panel text-center" style="padding:60px 20px;">' +
    '<i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i>' +
    '<p class="mt-3 text-muted">' + esc(pesan) + '</p>' +
    '<button class="btn btn-primary mt-2" onclick="' + fungsiCobaLagi + '">Coba Lagi</button></div>';
}

// ════════════════════════════════════════════════════════
// DROPDOWN UMKM BISA DICARI
// ════════════════════════════════════════════════════════
// Pengganti <select> biasa. Elemen dengan id={id} adalah <input hidden>
// yang tetap punya properti .value — jadi dibaca persis seperti <select>.
function dropdownUmkmCari(id, selectedKode, onSelectJsExpr, disabled) {
  const list = AppState.cache.umkm || [];
  const obj = list.find(function (u) { return u.KodeUnik === selectedKode; });
  const namaTampil = obj ? (obj.NamaUMKM + ' (' + obj.KodeUnik + ')') : '';
  return '<div class="umkm-search-select" style="position:relative;">' +
    '<input type="hidden" id="' + id + '" value="' + (selectedKode ? esc(selectedKode) : '') + '" data-onselect="' + esc(onSelectJsExpr || '') + '">' +
    '<div class="input-group-icon"><i class="bi bi-search"></i>' +
    '<input type="text" class="form-control" id="' + id + '_cari" value="' + esc(namaTampil) + '" placeholder="Ketik nama UMKM untuk mencari..." autocomplete="off"' + (disabled ? ' disabled' : '') +
    ' oninput="renderDropdownUmkmList(\'' + id + '\', this.value)" onfocus="renderDropdownUmkmList(\'' + id + '\', this.value)"></div>' +
    '<div class="umkm-search-list" id="' + id + '_list"></div></div>';
}

function renderDropdownUmkmList(id, kataKunci) {
  const listEl = document.getElementById(id + '_list');
  if (!listEl) return;
  const k = (kataKunci || '').trim().toLowerCase();
  const semua = AppState.cache.umkm || [];
  const hasil = k
    ? semua.filter(function (u) {
        return String(u.NamaUMKM).toLowerCase().includes(k) || String(u.KodeUnik).toLowerCase().includes(k);
      })
    : semua;
  listEl.innerHTML = hasil.length
    ? hasil.slice(0, 50).map(function (u) {
        return '<div class="umkm-search-item" onmousedown="pilihDropdownUmkm(\'' + id + '\',\'' + esc(u.KodeUnik) + '\')">' +
          esc(u.NamaUMKM) + ' <span class="text-muted" style="font-size:11px;">(' + esc(u.KodeUnik) + ')</span></div>';
      }).join('')
    : '<div class="umkm-search-empty">Tidak ada UMKM yang cocok.</div>';
  listEl.classList.add('show');
}

function pilihDropdownUmkm(id, kode) {
  const obj = (AppState.cache.umkm || []).find(function (u) { return u.KodeUnik === kode; });
  const hidden = document.getElementById(id);
  const cari = document.getElementById(id + '_cari');
  const listEl = document.getElementById(id + '_list');
  if (!hidden) return;
  hidden.value = kode;
  if (cari) cari.value = obj ? (obj.NamaUMKM + ' (' + obj.KodeUnik + ')') : '';
  if (listEl) listEl.classList.remove('show');
  const aksi = hidden.getAttribute('data-onselect');
  if (aksi) { try { (new Function(aksi))(); } catch (e) { console.error('Dropdown UMKM:', e); } }
}

document.addEventListener('click', function (e) {
  document.querySelectorAll('.umkm-search-list.show').forEach(function (el) {
    if (!el.parentElement.contains(e.target)) el.classList.remove('show');
  });
});

// ── Sidebar (mobile) ──
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('show');
  document.getElementById('sidebarScrim').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('show');
  document.getElementById('sidebarScrim').classList.remove('show');
}

// ── Status aktif UMKM ──
/** UMKM dianggap AKTIF kecuali ditandai tidak aktif secara eksplisit.
 *  Baris lama (sebelum kolom StatusAktif ada) bernilai kosong → tetap aktif. */
function umkmAktif(u) {
  const v = u && u.StatusAktif;
  if (v === '' || v === null || v === undefined) return true;
  if (v === false) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === 'tidak aktif' || s === 'nonaktif' || s === 'no' || s === '0');
}

// ════════════════════════════════════════════════════════
// INDIKATOR SAMBUNGAN SERVER
// ════════════════════════════════════════════════════════
let _statusServer = 'memeriksa';

function setIndikatorServer(status, keterangan) {
  _statusServer = status;
  const el = document.getElementById('indikatorServer');
  if (!el) return;
  const peta = {
    terhubung:  { warna: '#059669', ikon: 'wifi',     teks: 'Server Terhubung' },
    lambat:     { warna: '#D97706', ikon: 'wifi-1',   teks: 'Sambungan Lambat' },
    terputus:   { warna: '#DC2626', ikon: 'wifi-off', teks: 'Server Terputus' },
    memeriksa:  { warna: '#94A3B8', ikon: 'arrow-repeat', teks: 'Memeriksa...' }
  };
  const p = peta[status] || peta.memeriksa;
  el.innerHTML = '<span class="dot" style="background:' + p.warna + ';"></span>' +
    '<i class="bi bi-' + p.ikon + '" style="color:' + p.warna + ';"></i> ' +
    '<span style="color:' + p.warna + ';font-weight:600;">' + p.teks + '</span>' +
    (keterangan ? '<span class="text-muted" style="font-size:10.5px;margin-left:4px;">' + esc(keterangan) + '</span>' : '');
  el.title = 'Status sambungan ke server SIPUMA';
}

/** Periksa sambungan ke server dan perbarui indikatornya. */
async function periksaSambunganServer() {
  if (!AppState.session) return;
  setIndikatorServer('memeriksa');
  const mulai = Date.now();
  const res = await panggilAPI('ping', [], { percobaan: 1 });
  const lama = Date.now() - mulai;
  if (res && res.success) {
    setIndikatorServer(lama > 3000 ? 'lambat' : 'terhubung', lama + ' ms');
  } else {
    setIndikatorServer('terputus');
  }
}

/** Periksa berkala setiap 60 detik selama pengguna masih login. */
function mulaiPantauServer() {
  periksaSambunganServer();
  setInterval(function () {
    if (AppState.session) periksaSambunganServer();
  }, 60000);
}
