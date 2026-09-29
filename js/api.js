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
// CATATAN: panggilAPI() versi GAS sudah DIHAPUS dari berkas ini.
// Sejak pindah ke Firebase, fungsi itu didefinisikan di firestore-api.js
// (berbicara langsung ke Firestore), dan permintaan yang memang masih
// perlu GAS — unggah berkas & kredensial — dilayani panggilGAS() di sana.
//
// Dulu keduanya sempat ada bersamaan dan yang berlaku ditentukan urutan
// pemuatan skrip. Cara itu rapuh: menggeser satu baris di index.html bisa
// diam-diam mengembalikan jalur lama. Karena itu definisi lamanya dibuang.

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
