// ════════════════════════════════════════════════════════
// LAPISAN PENYESUAI (COMPATIBILITY LAYER)
// ════════════════════════════════════════════════════════
// Seluruh logika halaman SIPUMA (Data Master, Omset, Kemandirian, dll)
// sudah teruji bertahun-tahun di versi iframe. Daripada menulis ulang dari
// nol — yang berisiko memunculkan bug baru — berkas ini menyediakan
// "jembatan": antarmuka lama (google.script.run & panggilServerAman)
// tetap tersedia, tetapi di baliknya kini memakai fetch ke REST API.
//
// ⚠️ Berkas ini WAJIB dimuat SETELAH api.js & ui.js, tetapi SEBELUM
//    berkas-berkas halaman (admin.js, csr.js, umkm.js).

// ── Pemetaan nama action lama → nama action di router API baru ──
const PETA_AKSI = {
  saveKelasKemandirian: 'saveKemandirian',
  updateUserCredential: 'updateUser',
  setStatusAksesLogin:  'setStatusAkses',
  uploadFotoProfil:     'uploadFoto'
};

/** Sesuaikan nama action dan susunan argumennya ke bentuk API baru. */
function sesuaikanPanggilan(nama, args) {
  args = args || [];

  // updateProfil: dulu terpisah per peran & membawa identitas pengguna.
  // Sekarang server menentukan sendiri dari token — jadi identitas dibuang.
  if (nama === 'updateProfilUMKM' || nama === 'updateProfilCSRorAdmin') {
    return { nama: 'updateProfil', args: [args[1], args[2]] };
  }
  return { nama: PETA_AKSI[nama] || nama, args: args };
}

// ════════════════════════════════════════════════════════
// TIRUAN google.script.run DI ATAS fetch
// ════════════════════════════════════════════════════════
// Bentuk pemakaian lama tetap berlaku:
//   google.script.run.withSuccessHandler(fn).withFailureHandler(fn).namaAksi(a, b)
if (typeof window.google === 'undefined') {
  window.google = { script: {} };
}
if (!window.google.script.run) {
  window.google.script.run = (function buatRunner(handler) {
    function buat(h) {
      const dasar = {
        withSuccessHandler: function (fn) { return buat(Object.assign({}, h, { sukses: fn })); },
        withFailureHandler: function (fn) { return buat(Object.assign({}, h, { gagal: fn })); }
      };
      // Nama action apa pun yang dipanggil akan diteruskan ke API.
      return new Proxy(dasar, {
        get: function (target, prop) {
          if (prop in target) return target[prop];
          if (typeof prop !== 'string') return undefined;
          return function () {
            const args = Array.prototype.slice.call(arguments);
            const p = sesuaikanPanggilan(prop, args);
            panggilAPI(p.nama, p.args)
              .then(function (res) {
                if (res && res.gagalKoneksi) {
                  if (h.gagal) h.gagal(new Error(res.message));
                  else if (h.sukses) h.sukses(null);
                  return;
                }
                if (h.sukses) h.sukses(res);
              })
              .catch(function (err) { if (h.gagal) h.gagal(err); });
          };
        }
      });
    }
    return buat(handler || {});
  })({});
}

// ════════════════════════════════════════════════════════
// TIRUAN panggilServerAman (gaya callback)
// ════════════════════════════════════════════════════════
// Versi lama memuat mekanisme percobaan-ulang dan timeout manual yang
// rumit — semua itu sudah ditangani di panggilAPI(), jadi di sini cukup
// jembatan tipis. Definisi ini SENGAJA menimpa versi lama bila ada.
function panggilServerAman(namaFungsi, args, onSukses, onGagalTotal, maksPercobaan) {
  const p = sesuaikanPanggilan(namaFungsi, args);
  panggilAPI(p.nama, p.args, { percobaan: maksPercobaan || 3 })
    .then(function (res) {
      if (!res || res.gagalKoneksi) {
        if (onGagalTotal) onGagalTotal(); else showToast('Gagal', 'Tidak dapat terhubung ke server.', 'danger');
        return;
      }
      if (onSukses) onSukses(res);
    })
    .catch(function () {
      if (onGagalTotal) onGagalTotal();
    });
}

// ════════════════════════════════════════════════════════
// PENGELOLAAN CACHE DAFTAR UMKM
// ════════════════════════════════════════════════════════
function ensureUmkmCacheThen(cb) {
  if (AppState.cache.umkm !== null && AppState.cache.umkm !== undefined) { cb(); return; }
  pastikanCacheUmkm().then(function () { cb(); });
}

function refreshUmkmCacheThen(cb) {
  AppState.cache.umkm = null;
  pastikanCacheUmkm().then(function () { if (cb) cb(); });
}

function umkmSelectOptions(terpilih) {
  return (AppState.cache.umkm || []).map(function (u) {
    return '<option value="' + esc(u.KodeUnik) + '"' + (u.KodeUnik === terpilih ? ' selected' : '') + '>' +
      esc(u.NamaUMKM) + ' (' + esc(u.KodeUnik) + ')</option>';
  }).join('');
}

// ════════════════════════════════════════════════════════
// PEMBANTU LAIN YANG DIPAKAI HALAMAN LAMA
// ════════════════════════════════════════════════════════

/**
 * Dulu sebagian fungsi server mengirim data sebagai teks JSON (siasat bug
 * serialisasi Date di google.script.run). Di REST API hal itu tidak lagi
 * diperlukan — data datang sebagai objek biasa. Fungsi ini dipertahankan
 * agar kode halaman lama tetap jalan: objek diteruskan apa adanya, teks
 * JSON tetap di-parse bila kebetulan masih ada.
 */
function parseJsonAman(str, fallback) {
  if (str === null || str === undefined) return fallback;
  if (typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

/** Ubah tautan Google Drive ke bentuk /thumbnail yang bisa ditampilkan. */
function normalizeFotoUrl(url) {
  if (!url) return '';
  const cocok = String(url).match(/[-\w]{25,}/);
  if (!cocok) return url;
  return 'https://drive.google.com/thumbnail?id=' + cocok[0] + '&sz=w400';
}

// ── Penyimpanan lokal yang aman (tidak menggagalkan aplikasi bila diblokir) ──
function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}
function safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

/** Nama lama untuk fungsi pembaca berkas (didefinisikan di app.js). */
function readFileAsBase64(file) { return bacaFileSebagaiBase64(file); }

/** Nama lama untuk perender kerangka peran (didefinisikan di app.js). */
function renderShellForRole() { return renderShellPeran(); }

/** Pratinjau dokumen PDF di dalam modal. */
function previewFile(fileUrl, judul) {
  const cocok = String(fileUrl).match(/[-\w]{25,}/);
  const urlSemat = cocok
    ? 'https://drive.google.com/file/d/' + cocok[0] + '/preview'
    : fileUrl;
  document.getElementById('modalPreviewTitle').textContent = judul || 'Pratinjau Dokumen';
  document.getElementById('modalPreviewContent').innerHTML =
    '<iframe src="' + esc(urlSemat) + '" style="width:100%;height:70vh;border:none;"></iframe>';
  document.getElementById('modalPreviewDownload').href = fileUrl;
  openModal('modalPreview');
}
