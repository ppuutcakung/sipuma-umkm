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

  // Konfigurasi juga per cabang (periode aktif, target, nama organisasi)
  const cfg = await panggilAPI('getAllConfig', []);
  AppState.config = cfg.success ? (cfg.data || {}) : {};

  simpanSesiLokal(AppState.session);
  renderShellPeran();
  terapkanIdentitasAplikasi();
  navigateTo(AppState.currentSection || 'dashboard');

  const info = infoCabangAktif();
  showToast('Cabang Berpindah', 'Menampilkan data ' + (info.nama || kode) + '.', 'info');
}
