// ════════════════════════════════════════════════════════
// LAPISAN KOMUNIKASI KE SERVER (GAS REST API)
// ════════════════════════════════════════════════════════
// Semua permintaan ke server melewati satu pintu: panggilAPI().
// Token sesi otomatis disertakan, dan sesi kedaluwarsa otomatis ditangani.

/**
 * Kirim permintaan ke server GAS.
 *
 * @param {string} action  nama action (lihat IZIN_AKSI di Kode.gs)
 * @param {Array}  args    argumen untuk fungsi di server
 * @param {Object} opsi    { tanpaToken, percobaan }
 * @returns {Promise<{success:boolean, data:*, message:string}>}
 */
async function panggilAPI(action, args, opsi) {
  opsi = opsi || {};
  const maksPercobaan = opsi.percobaan || 3;

  if (!GAS_URL || GAS_URL === 'GANTI_DENGAN_URL_EXEC_ANDA') {
    const pesan = 'Alamat server belum dikonfigurasi. Isi GAS_URL di file js/config.js.';
    showToast('Belum Terkonfigurasi', pesan, 'danger');
    return { success: false, data: null, message: pesan };
  }

  const payload = { action: action, args: args || [] };
  if (!opsi.tanpaToken) {
    const sesi = AppState.session;
    if (!sesi || !sesi.token) {
      tanganiSesiHabis();
      return { success: false, data: null, message: 'Belum login.' };
    }
    payload.token = sesi.token;
  }

  let galatTerakhir = null;

  for (let percobaan = 1; percobaan <= maksPercobaan; percobaan++) {
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        // ⚠️ WAJIB text/plain — Content-Type JSON memicu preflight CORS
        // yang diblokir Google Apps Script.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      if (!res.ok) throw new Error('Server membalas status ' + res.status);

      const hasil = await res.json();

      // Sesi habis / token tidak sah → paksa login ulang
      if (hasil && hasil.sesiHabis) {
        tanganiSesiHabis();
        return hasil;
      }
      return hasil;

    } catch (err) {
      galatTerakhir = err;
      // Jeda bertingkat sebelum mencoba lagi (0.6s, 1.2s, ...)
      if (percobaan < maksPercobaan) {
        await new Promise(function (r) { setTimeout(r, 600 * percobaan); });
      }
    }
  }

  console.error('SIPUMA API gagal (' + action + '):', galatTerakhir);
  return {
    success: false,
    data: null,
    gagalKoneksi: true, // penanda: server tidak tercapai (bukan menolak)
    message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.'
  };
}

/** Sesi berakhir: bersihkan dan kembalikan pengguna ke halaman login. */
function tanganiSesiHabis() {
  hapusSesiLokal();
  resetCache();
  AppState.session = null;
  tampilkanHalamanLogin();
  showToast('Sesi Berakhir', 'Demi keamanan, sesi Anda telah berakhir. Silakan login kembali.', 'warning');
}

// ── Penyimpanan sesi di browser ──
function simpanSesiLokal(sesi) {
  try { localStorage.setItem(KUNCI_SESI, JSON.stringify(sesi)); } catch (e) {}
}
function ambilSesiLokal() {
  try {
    const s = localStorage.getItem(KUNCI_SESI);
    if (!s) return null;
    const sesi = JSON.parse(s);
    // Cek masa berlaku di sisi browser (server tetap memeriksa ulang)
    if (sesi.berlakuSampai && new Date(sesi.berlakuSampai) <= new Date()) return null;
    return sesi;
  } catch (e) { return null; }
}
function hapusSesiLokal() {
  try { localStorage.removeItem(KUNCI_SESI); } catch (e) {}
}

// ════════════════════════════════════════════════════════
// PEMBANTU PENGAMBILAN DATA BER-CACHE
// ════════════════════════════════════════════════════════
// Data yang sama tidak diminta berulang kali ke server dalam satu sesi.
// Cache dibersihkan otomatis setiap kali data terkait diubah.

/** Pastikan daftar UMKM tersedia di cache, lalu jalankan callback. */
async function pastikanCacheUmkm() {
  if (AppState.cache.umkm !== null) return AppState.cache.umkm;
  const res = await panggilAPI('getDaftarUMKM');
  AppState.cache.umkm = res.success ? (res.data || []) : [];
  return AppState.cache.umkm;
}

/** Ambil data ber-cache secara umum. */
async function ambilBerCache(kunciCache, action, args) {
  if (AppState.cache[kunciCache] !== null && AppState.cache[kunciCache] !== undefined) {
    return AppState.cache[kunciCache];
  }
  const res = await panggilAPI(action, args);
  AppState.cache[kunciCache] = res.success ? (res.data || []) : [];
  return AppState.cache[kunciCache];
}
