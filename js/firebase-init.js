// ════════════════════════════════════════════════════════
// INISIALISASI FIREBASE
// ════════════════════════════════════════════════════════
// Nilai di bawah memang boleh terlihat publik — pengamanan SIPUMA ada di
// Firestore Security Rules (ditegakkan server Google), bukan pada kunci ini.
// Tanpa token login yang sah, seluruh permintaan tetap ditolak.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBjfzjv6XgQwEsTi8UZcYvLM5f1e-NNvW8",
  authDomain: "sipuma-ppu.firebaseapp.com",
  projectId: "sipuma-ppu",
  storageBucket: "sipuma-ppu.firebasestorage.app",
  messagingSenderId: "557698763310",
  appId: "1:557698763310:web:530fd20a6be31c5dd9adbf"
};

let db = null;
let fbAuth = null;

/** Nyalakan Firebase. Dipanggil sekali saat aplikasi dimuat. */
function mulaiFirebase() {
  if (typeof firebase === 'undefined') {
    console.error('SIPUMA: Firebase SDK belum termuat.');
    return false;
  }
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  fbAuth = firebase.auth();

  // Simpan data yang sudah diambil di perangkat, supaya pindah halaman
  // terasa seketika dan aplikasi tetap bisa dibuka saat koneksi terputus.
  //
  // Memakai bentuk pengaturan baru (FirestoreSettings.cache). Bentuk lama
  // enablePersistence() masih jalan tetapi sudah ditandai akan dihentikan,
  // dan memunculkan peringatan di Console setiap kali aplikasi dibuka.
  try {
    db.settings({
      // merge:true WAJIB — tanpa ini settings() menimpa seluruh pengaturan
      // bawaan (termasuk alamat server), dan Firestore memperingatkan
      // "You are overriding the original host".
      merge: true,
      cache: {
        kind: 'persistent',
        tabManager: { kind: 'persistentMultipleTab' }
      }
    });
  } catch (e) {
    console.warn('SIPUMA: penyimpanan luring tidak aktif —', e.code || e.message);
  }
  return true;
}

/** Masuk ke Firestore memakai token yang diterbitkan GAS. */
async function masukFirebaseDenganToken(customToken) {
  const cred = await fbAuth.signInWithCustomToken(customToken);
  // Paksa muat ulang klaim agar peran & cabang langsung terbaca
  await cred.user.getIdToken(true);
  return cred.user;
}

async function keluarFirebase() {
  try { if (fbAuth) await fbAuth.signOut(); } catch (e) {}
}

/** Klaim peran & cabang dari token yang sedang aktif. */
async function klaimPengguna() {
  if (!fbAuth || !fbAuth.currentUser) return null;
  const hasil = await fbAuth.currentUser.getIdTokenResult();
  return {
    username: fbAuth.currentUser.uid,
    role: hasil.claims.role || '',
    cabang: hasil.claims.cabang || '',
    idUmkm: hasil.claims.idUmkm || ''
  };
}

// ── Pembantu cakupan cabang ──

/** Cabang yang sedang dilihat. Superadmin & stakeholder dapat berpindah. */
function cabangAktif() {
  const s = AppState.session || {};
  if (s.roleFS === 'superadmin' || s.roleFS === 'stakeholder') {
    return AppState.cabangDipilih || s.cabang || 'CAKUNG';
  }
  return s.cabang || 'CAKUNG';
}

/** Peran yang boleh melihat lintas cabang. */
function bolehLintasCabang() {
  const r = (AppState.session || {}).roleFS;
  return r === 'superadmin' || r === 'stakeholder';
}


// ════════════════════════════════════════════════════════
// ALAT DIAGNOSIS
// ════════════════════════════════════════════════════════
/**
 * Tampilkan isi token yang sedang berlaku.
 * Jalankan di Console bila muncul "Missing or insufficient permissions":
 *
 *     cekKlaimSaya()
 *
 * Yang harus terlihat: role, cabang, dan (untuk UMKM) idUmkm.
 * Bila ketiganya kosong, berarti token tidak membawa klaim — masalahnya
 * di penerbitan token (GAS), bukan di Security Rules.
 */
async function cekKlaimSaya() {
  if (!fbAuth || !fbAuth.currentUser) {
    console.log('❌ Belum login ke Firebase.');
    return null;
  }
  const hasil = await fbAuth.currentUser.getIdTokenResult(true);
  const ringkas = {
    uid: fbAuth.currentUser.uid,
    role: hasil.claims.role,
    cabang: hasil.claims.cabang,
    idUmkm: hasil.claims.idUmkm
  };
  console.log('🔑 Klaim token:', ringkas);
  console.log('   Cabang yang sedang dipakai aplikasi:', cabangAktif());
  if (!ringkas.role) {
    console.log('⚠️  role KOSONG — token tidak membawa klaim.');
    console.log('   Penyebabnya di penerbitan token (GAS), bukan Security Rules.');
  }
  return ringkas;
}


// ════════════════════════════════════════════════════════
// PEMILIH CABANG (Stakeholder & Superadmin)
// ════════════════════════════════════════════════════════

/** Ambil daftar cabang aktif, disimpan di AppState untuk pemilih. */
async function muatDaftarCabang() {
  try {
    const snap = await db.collection('cabang').get();
    AppState.daftarCabang = snap.docs
      .map(function (d) { const o = d.data() || {}; o.kode = o.kode || d.id; return o; })
      .filter(function (c) { return c.aktif !== false; })
      .sort(function (a, b) { return String(a.kode).localeCompare(String(b.kode)); });
  } catch (e) {
    console.warn('SIPUMA: daftar cabang tidak terbaca —', e.code || e.message);
    AppState.daftarCabang = [{ kode: 'CAKUNG', nama: 'PPU UT Cakung' }];
  }
  return AppState.daftarCabang;
}

/** Keterangan cabang yang sedang dilihat (dipakai ekspor & tampilan). */
function infoCabangAktif() {
  const kode = cabangAktif();
  const c = (AppState.daftarCabang || []).find(function (x) { return x.kode === kode; });
  return c || { kode: kode, nama: kode };
}

/** Nama organisasi untuk kepala berkas ekspor. */
function namaOrganisasi() {
  // Diutamakan dari pengaturan per cabang, lalu nama cabang, baru kodenya.
  // Sebelumnya tertulis tetap "PPU UT Cakung" di dalam kode — keliru
  // begitu ada cabang kedua, karena setiap cabang punya nama sendiri.
  const cfg = AppState.config || {};
  if (cfg.namaOrganisasi) return cfg.namaOrganisasi;
  const info = infoCabangAktif();
  return info.nama || info.kode;
}

/** Pemilih cabang di topbar — hanya untuk peran lintas cabang. */
function renderPemilihCabang() {
  const wadah = document.getElementById('pemilihCabang');
  if (!wadah) return;
  if (!bolehLintasCabang()) { wadah.innerHTML = ''; return; }

  const daftar = AppState.daftarCabang || [];
  const aktif = cabangAktif();
  wadah.innerHTML =
    '<i class="bi bi-diagram-3" style="color:var(--text-muted);"></i>' +
    '<select class="form-select" id="pilihCabangTopbar" style="width:auto;height:32px;font-size:12.5px;" ' +
    'onchange="gantiCabang(this.value)" title="Cabang yang sedang dilihat">' +
      daftar.map(function (c) {
        return '<option value="' + c.kode + '"' + (c.kode === aktif ? ' selected' : '') + '>' +
          (c.nama || c.kode) + '</option>';
      }).join('') +
    '</select>';
}

/** Berpindah cabang: bersihkan seluruh cache lalu muat ulang halaman aktif. */
async function gantiCabang(kode) {
  if (!kode || kode === AppState.cabangDipilih) return;
  AppState.cabangDipilih = kode;

  // Seluruh cache WAJIB dikosongkan — isinya milik cabang sebelumnya.
  // Tanpa ini, data cabang lama akan tetap tampil sampai cache kedaluwarsa.
  if (typeof hapusCacheFS === 'function') hapusCacheFS(null);
  resetCache();

  // Konfigurasi juga per cabang (periode aktif, target, nama organisasi,
  // dan izin akses Stakeholder). Harus dimuat SEBELUM halaman digambar,
  // karena izin itulah yang menentukan halaman apa yang boleh tampil.
  const cfg = await panggilAPI('getAllConfig', []);
  AppState.config = cfg.success ? (cfg.data || {}) : {};

  simpanSesiLokal(AppState.session);
  renderShellPeran();
  terapkanIdentitasAplikasi();
  navigateTo(AppState.currentSection || 'dashboard');

  const info = infoCabangAktif();
  showToast('Cabang Berpindah', 'Menampilkan data ' + (info.nama || kode) + '.', 'info');
}


// ════════════════════════════════════════════════════════
// JALUR CEPAT — LOGIN LANGSUNG KE FIREBASE
// ════════════════════════════════════════════════════════
// Firebase Auth mewajibkan email, sementara SIPUMA memakai nama UMKM.
// Karena itu tiap pengguna diberi email bayangan yang tidak pernah
// dikirimi apa pun — hanya sebagai penanda di Firebase.

const AUTH_DOMAIN_BAYANGAN = 'sipuma.local';

/** SHA-256 sebuah teks, dalam bentuk heksadesimal. */
async function sha256Hex(teks) {
  const data = new TextEncoder().encode(String(teks));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(function (b) { return b.toString(16).padStart(2, '0'); })
    .join('');
}

/**
 * Ubah username jadi email bayangan yang tetap dan unik.
 *
 * ⚠️ RUMUS INI HARUS SAMA PERSIS dengan authEmailDariUsername() di
 *    Auth.gs. Browser dan server menghitungnya masing-masing — bila
 *    keduanya berbeda satu huruf pun, tidak ada yang bisa masuk lewat
 *    jalur cepat.
 */
async function emailDariUsername(username) {
  const u = String(username || '').trim();
  let slug = u.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 32)
    .replace(/-+$/g, '');
  if (!slug) slug = 'pengguna';
  const sidik = (await sha256Hex(u)).substring(0, 12);
  return slug + '.' + sidik + '@' + AUTH_DOMAIN_BAYANGAN;
}

/**
 * Coba masuk langsung lewat Firebase Auth.
 *
 * Mengembalikan:
 *   { ok: true, profil }         → berhasil
 *   { ok: false, lanjutKeGAS }   → akun belum ada / password tidak cocok;
 *                                  pemanggil harus mencoba jalur lama
 *   { ok: false, pesan }         → gagal yang sudah pasti (peran salah,
 *                                  akses diblokir) — jangan coba jalur lama
 */
async function loginJalurCepat(roleDipilih, username, password) {
  let kredensial;
  try {
    const email = await emailDariUsername(username);
    kredensial = await fbAuth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    // Akun belum pernah dibuat, atau passwordnya tidak cocok. Firebase
    // sengaja tidak membedakan keduanya, jadi keduanya diteruskan ke jalur
    // lama — di sana password lamanya masih bisa diperiksa.
    return { ok: false, lanjutKeGAS: true, kode: e.code };
  }

  try {
    const hasil = await kredensial.user.getIdTokenResult(true);
    const klaim = hasil.claims || {};
    const roleAsli = String(klaim.role || '');

    // Peran yang dipilih di kartu login harus cocok dengan yang terdaftar
    const peta = { 'UMKM': 'umkm', 'Admin': 'admin', 'UT': 'stakeholder' };
    const diharapkan = peta[roleDipilih] || String(roleDipilih).toLowerCase();
    const cocok = (roleAsli === diharapkan) ||
                  (diharapkan === 'admin' && roleAsli === 'superadmin');
    if (!roleAsli) {
      // Klaim belum tertanam — akunnya belum lengkap. Serahkan ke jalur
      // lama, yang akan membentuk ulang akunnya dengan klaim yang benar.
      await keluarFirebase();
      return { ok: false, lanjutKeGAS: true, kode: 'klaim-kosong' };
    }
    if (!cocok) {
      await keluarFirebase();
      return { ok: false, pesan: 'Username atau password salah.' };
    }

    // Profil lengkap diambil dari Firestore — klaim hanya memuat peran.
    const dok = await db.collection('users').doc(username).get();
    const u = dok.exists ? dok.data() : {};

    if (u.statusAkses && String(u.statusAkses) !== 'Allowed') {
      await keluarFirebase();
      return { ok: false, pesan: 'Akses Anda sedang diblokir. Hubungi admin.' };
    }

    return {
      ok: true,
      profil: {
        username: u.username || username,
        role: roleAsli,
        cabang: String(klaim.cabang || u.cabang || ''),
        idUmkm: String(klaim.idUmkm || u.idUmkm || ''),
        fotoURL: u.fotoURL || '',
        alamat: u.alamat || '',
        passwordDiubah: u.passwordDiubah === true
      }
    };
  } catch (e) {
    console.error('SIPUMA: jalur cepat gagal di tengah jalan —', e);
    try { await keluarFirebase(); } catch (x) {}
    return { ok: false, lanjutKeGAS: true, kode: e.code || 'galat' };
  }
}

/**
 * Pastikan sesi GAS tersedia, untuk permintaan yang memang butuh GAS
 * (unggah berkas, reset password, kredensial).
 *
 * Pengguna yang masuk lewat jalur cepat tidak pernah menyentuh GAS, jadi
 * sesinya baru diterbitkan di sini — saat benar-benar dibutuhkan. Dengan
 * begitu login tetap tidak menyentuh GAS sama sekali.
 */
async function pastikanTokenGas() {
  const s = AppState.session || {};
  if (s.tokenGas) return s.tokenGas;
  if (!fbAuth || !fbAuth.currentUser) return '';

  try {
    const idToken = await fbAuth.currentUser.getIdToken();
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sesiDariToken', idToken: idToken }),
      redirect: 'follow'
    });
    const data = await res.json();
    if (data && data.success && data.data && data.data.tokenGas) {
      AppState.session.tokenGas = data.data.tokenGas;
      simpanSesiLokal(AppState.session);
      return AppState.session.tokenGas;
    }
  } catch (e) {
    console.error('SIPUMA: gagal menyiapkan sesi berkas —', e);
  }
  return '';
}
