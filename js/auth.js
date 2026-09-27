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
    labelUser: 'Username Tim CSR United Tractors',
    placeholderUser: 'Masukkan username tim CSR',
    hintUser: 'Akun pemantauan program CSR United Tractors.',
    labelPass: 'Password',
    formatHint: '',
    tombol: 'Masuk Sebagai CSR UT'
  }
};

function pilihRoleLogin(role) {
  roleLoginTerpilih = role;
  document.querySelectorAll('.role-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.role === role);
  });
  const t = TEKS_ROLE[role];
  document.getElementById('lblUsername').textContent = t.labelUser;
  document.getElementById('loginUsername').placeholder = t.placeholderUser;
  document.getElementById('hintUsername').textContent = t.hintUser;
  document.getElementById('lblPassword').textContent = t.labelPass;
  document.getElementById('formatHint').textContent = t.formatHint;
  document.getElementById('loginBtnText').textContent = t.tombol;
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
  const hasil = await kirimLogin(roleLoginTerpilih, username, password);

  resetBtn(btn);

  if (!hasil.success) {
    tampilkanGalatLogin(hasil.message || 'Login gagal.');
    return;
  }

  // Simpan sesi
  AppState.session = {
    token: hasil.data.token,
    berlakuSampai: hasil.data.berlakuSampai,
    username: hasil.data.profil.username,
    role: hasil.data.profil.role,
    idUmkm: hasil.data.profil.idUmkm,
    fotoURL: hasil.data.profil.fotoURL,
    alamat: hasil.data.profil.alamat
  };
  AppState.config = hasil.data.config || {};
  simpanSesiLokal(AppState.session);

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
      body: JSON.stringify({ action: 'login', role: role, username: username, password: password }),
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
    try { await panggilAPI('logout', [], { percobaan: 1 }); } catch (e) {}
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
