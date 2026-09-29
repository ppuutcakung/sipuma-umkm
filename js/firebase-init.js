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
