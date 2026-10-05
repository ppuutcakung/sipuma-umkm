// ════════════════════════════════════════════════════════
// AUTENTIKASI — Login, Logout, Pemulihan Sesi
// ════════════════════════════════════════════════════════

let roleLoginTerpilih = 'UMKM';

const TEKS_ROLE = {
  UMKM: {
    labelUser: 'Nama Lengkap UMKM Binaan',
    placeholderUser: 'Masukkan nama UMKM',
    hintUser: 'Sesuai dengan nama usaha yang terdaftar di Data Master SIPUMA.',
    labelPass: 'Kode Unik Sektor (Password)',
    formatHint: 'Format: KUL/KRJ/PTN/MFG + 4 Angka',
    tombol: 'Masuk Sebagai UMKM'
  },
  Admin: {
    labelUser: 'Username Admin / PIC',
    placeholderUser: 'Masukkan username admin',
    hintUser: 'Akun pengelola data SIPUMA (PPU UT Cakung).',
    labelPass: 'Password',
    formatHint: '',
    tombol: 'Masuk Sebagai Admin'
  },
  UT: {
    labelUser: 'Username Stakeholder',
    placeholderUser: 'Masukkan username stakeholder',
    hintUser: 'Akun pemantauan program (hanya dapat melihat data).',
    labelPass: 'Password',
    formatHint: '',
    tombol: 'Masuk Sebagai Stakeholder'
  }
};

function pilihRoleLogin(role) {
  roleLoginTerpilih = role;
  document.querySelectorAll('.role-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.role === role);
  });
  const t = TEKS_ROLE[role];
  // Setiap elemen dicek dulu. Sebelumnya, satu elemen yang tidak ditemukan
  // membuat seluruh fungsi berhenti di tengah jalan — akibatnya tab peran
  // tampak tidak berfungsi sama sekali, padahal masalahnya hanya satu baris.
  function isi(id, sifat, nilai) {
    const el = document.getElementById(id);
    if (!el) { console.warn('SIPUMA: elemen "' + id + '" tidak ditemukan di halaman.'); return; }
    el[sifat] = nilai;
  }
  isi('lblUsername', 'textContent', t.labelUser);
  isi('loginUsername', 'placeholder', t.placeholderUser);
  isi('hintUsername', 'textContent', t.hintUser);
  isi('lblPassword', 'textContent', t.labelPass);
  isi('formatHint', 'textContent', t.formatHint);
  isi('loginBtnText', 'textContent', t.tombol);
  sembunyikanGalatLogin();
}

function toggleLihatPassword() {
  const inp = document.getElementById('loginPassword');
  const ikon = document.getElementById('iconToggleLihatPassword');
  const lihat = inp.type === 'password';
  inp.type = lihat ? 'text' : 'password';
  ikon.className = lihat ? 'bi bi-eye-slash' : 'bi bi-eye';
  ikon.style.cssText = 'position:static;left:auto;top:auto;transform:none;';
}

function tampilkanGalatLogin(pesan) {
  const el = document.getElementById('loginError');
  el.textContent = pesan;
  el.style.display = 'block';
}
function sembunyikanGalatLogin() {
  const el = document.getElementById('loginError');
  if (el) el.style.display = 'none';
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('loginSubmitBtn');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    tampilkanGalatLogin('Username dan password wajib diisi.');
    return;
  }

  sembunyikanGalatLogin();
  setBtnLoading(btn, 'Memverifikasi...');

  // Login memakai bentuk payload khusus (role/username/password di tingkat
  // atas, bukan di dalam args) — karena itu tidak lewat panggilAPI biasa.
  //
  // Alurnya: GAS memverifikasi password, lalu menerbitkan Custom Token.
  // Token itu dipakai masuk ke Firebase — sejak saat itu seluruh operasi
  // data ditegakkan Firestore Security Rules, bukan lagi kode kita.
  const hasil = await kirimLogin(roleLoginTerpilih, username, password);

  if (!hasil.success) {
    resetBtn(btn);
    tampilkanGalatLogin(hasil.message || 'Login gagal.');
    return;
  }

  try {
    setBtnLoading(btn, 'Menghubungkan...');
    await masukFirebaseDenganToken(hasil.data.customToken);
  } catch (e) {
    resetBtn(btn);
    console.error('Gagal masuk Firebase:', e);
    tampilkanGalatLogin('Verifikasi berhasil, tetapi gagal menghubungkan ke basis data. Coba lagi.');
    return;
  }
  resetBtn(btn);

  const p = hasil.data.profil;
  AppState.session = {
    username: p.username,
    // Firestore memakai penamaan baru (admin/stakeholder/umkm), sedangkan
    // seluruh kode halaman sudah memakai Admin/UT/UMKM sejak awal.
    // Disimpan KEDUANYA: `role` untuk tampilan, `roleFS` untuk Firestore.
    role: roleKeLama(p.role),
    roleFS: p.role,
    cabang: p.cabang, idUmkm: p.idUmkm, fotoURL: p.fotoURL, alamat: p.alamat,
    passwordDiubah: p.passwordDiubah === true,
    // Dipakai untuk permintaan yang tetap harus lewat GAS: unggah berkas
    // ke Drive dan penulisan koleksi `kredensial` yang tertutup bagi browser.
    tokenGas: hasil.data.tokenGas || ''
  };
  // Stakeholder & superadmin melihat lintas cabang. Tetapi menampilkan
  // data GABUNGAN justru membingungkan — angka dashboard jadi campuran
  // dua cabang tanpa penjelasan. Karena itu selalu dimulai dari SATU
  // cabang, lalu pengguna berpindah lewat pemilih di kanan atas.
  if (p.role === 'stakeholder' || p.role === 'superadmin') {
    await muatDaftarCabang();
    AppState.cabangDipilih = (AppState.daftarCabang[0] || {}).kode || 'CAKUNG';
  } else {
    AppState.cabangDipilih = null;
  }
  simpanSesiLokal(AppState.session);

  // Konfigurasi diambil dari Firestore sesuai cabang
  const cfg = await panggilAPI('getAllConfig', []);
  AppState.config = cfg.success ? (cfg.data || {}) : {};

  document.getElementById('loginPassword').value = '';
  masukKeAplikasi();
  showToast('Berhasil', hasil.message, 'success');
}

/** Permintaan login memakai bentuk payload khusus (bukan args biasa). */
async function kirimLogin(role, username, password) {
  if (!GAS_URL || GAS_URL === 'GANTI_DENGAN_URL_EXEC_ANDA') {
    return { success: false, message: 'Alamat server belum dikonfigurasi. Isi GAS_URL di file js/config.js.' };
  }
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'loginFirebase', role: role, username: username, password: password }),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Server membalas status ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('Login gagal:', err);
    return { success: false, message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.' };
  }
}

function handleLogout() {
  showConfirm('Anda yakin ingin keluar dari SIPUMA?', async function () {
    closeModal('modalConfirm');
    // Beri tahu server agar token benar-benar dimatikan (bukan cuma dihapus
    // dari browser) — inilah bedanya dengan logout versi lama.
    try { await keluarFirebase(); } catch (e) {}
    hapusSesiLokal();
    resetCache();
    AppState.session = null;
    tampilkanHalamanLogin();
    showToast('Keluar', 'Anda telah keluar dari SIPUMA.', 'info');
  }, 'Ya, Keluar');
}

// ── Perpindahan tampilan ──
function tampilkanHalamanLogin() {
  const lo = document.getElementById('loadingOverlay'); if (lo) lo.style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appBody').classList.remove('ready');
  panaskanServer();
}

/**
 * Panaskan server GAS begitu kartu login tampil.
 *
 * Bagian paling lambat saat login adalah "cold start" Apps Script: bila
 * lama tidak dipakai, permintaan pertama harus menunggu server disiapkan
 * dulu — 1 sampai 3 detik sendiri. Dengan mengirim satu permintaan ringan
 * saat kartu login muncul, server sudah siap pada saat pengguna selesai
 * mengetik username dan password.
 *
 * Sengaja tidak ditunggu dan kegagalannya diabaikan: ini hanya pemanasan,
 * tidak boleh menghambat atau menggagalkan apa pun.
 */
let _sudahPanaskan = false;
function panaskanServer() {
  if (_sudahPanaskan) return;
  if (!GAS_URL || GAS_URL === 'GANTI_DENGAN_URL_EXEC_ANDA') return;
  _sudahPanaskan = true;
  try {
    // doGet hanya mengembalikan status layanan — ringan dan tanpa token.
    fetch(GAS_URL, { method: 'GET', redirect: 'follow' }).catch(function () {});
  } catch (e) { /* diabaikan dengan sengaja */ }
}

function masukKeAplikasi() {
  const lo = document.getElementById('loadingOverlay'); if (lo) lo.style.display = 'none';
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appBody').classList.add('ready');
  renderShellPeran();
  terapkanIdentitasAplikasi();   // judul, tagline, logo, footer, warna
  mulaiPantauServer();           // indikator sambungan server
  navigateTo('dashboard');
}


/** Peran Firestore → penamaan lama yang dipakai menu & halaman. */
function roleKeLama(r) {
  return { admin: 'Admin', superadmin: 'Admin', stakeholder: 'UT', umkm: 'UMKM' }[r] || r;
}
