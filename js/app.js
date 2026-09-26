// ════════════════════════════════════════════════════════
// ROUTER & INISIALISASI APLIKASI
// ════════════════════════════════════════════════════════

/** Bangun sidebar & identitas sesuai peran pengguna yang login. */
function renderShellPeran() {
  const s = AppState.session;
  const menu = MENU_PER_ROLE[s.role] || [];

  document.getElementById('sidebarNav').innerHTML = menu.map(function (m) {
    return '<li><a class="nav-link" data-section="' + m.id + '" onclick="navigateTo(\'' + m.id + '\')">' +
      '<i class="bi ' + m.icon + '"></i> <span>' + esc(m.label) + '</span>' +
      (m.badge ? '<span class="nav-badge">' + esc(m.badge) + '</span>' : '') + '</a></li>';
  }).join('');

  const labelRole = { Admin: 'Admin / PIC', UT: 'CSR United Tractors', UMKM: 'Pelaku UMKM (Binaan)' }[s.role] || s.role;
  document.getElementById('roleBadge').textContent = labelRole;
  document.getElementById('userChipName').textContent = s.username;
  document.getElementById('userChipRole').textContent = labelRole;

  const inisial = String(s.username || '?').trim().substring(0, 2).toUpperCase();
  const avatar = document.getElementById('avatarCircle');
  if (s.fotoURL) {
    avatar.innerHTML = '<img src="' + esc(s.fotoURL) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  } else {
    avatar.textContent = inisial;
  }

  document.getElementById('ctxChip').innerHTML = '<i class="bi bi-building"></i> ' +
    (s.role === 'UMKM' ? esc(s.username) : 'UMKM Binaan CSR United Tractors');
  document.getElementById('ctxSub').textContent = {
    Admin: 'Panel Administrasi & Pengelolaan Data',
    UT: 'Panel Pemantauan Program CSR',
    UMKM: 'Panel Pelaporan Usaha'
  }[s.role] || '';

  document.getElementById('sidebarStatus').innerHTML =
    '<span><span class="dot dot-pramandiri"></span> Sesi Aktif</span>' +
    '<span class="text-muted" style="font-size:11px;">' + labelRole + '</span>';
}

/** Pindah halaman. Seluruh perpindahan terjadi di browser — tanpa memuat
 *  ulang halaman, sehingga terasa seketika. */
function navigateTo(sectionId) {
  AppState.currentSection = sectionId;
  closeSidebar();

  document.querySelectorAll('.sidebar-nav .nav-link').forEach(function (a) {
    a.classList.toggle('active', a.dataset.section === sectionId);
  });

  const wadah = document.getElementById('app-container');
  wadah.scrollTop = 0;

  try {
    switch (sectionId) {
      // ── Umum ──
      case 'dashboard':          loadDashboard(); break;
      case 'pengaturan':         loadPengaturan(); break;

      // ── Admin ──
      case 'masterUmkm':         cekTersedia(window.loadMasterUmkm, 'Data Master UMKM'); break;
      case 'omset':              cekTersedia(window.loadOmsetAdmin, 'Input & Monitoring Omset'); break;
      case 'tenagaKerja':        cekTersedia(window.loadTenagaKerjaAdmin, 'Input Tenaga Kerja'); break;
      case 'kemandirian':        cekTersedia(window.loadKemandirian, 'Asesmen Kemandirian'); break;
      case 'fasilitasi':         cekTersedia(window.loadFasilitasi, 'Fasilitasi Pemasaran'); break;
      case 'prestasi':           cekTersedia(window.loadPrestasiAdmin, 'Catatan Prestasi UMKM'); break;
      // Laporan CSR: Admin bisa unggah/hapus, CSR UT hanya melihat
      case 'fileLaporan':
        cekTersedia(
          AppState.session.role === 'Admin' ? window.loadLaporanCsrAdmin : window.loadLaporanCsrUT,
          'Laporan CSR'
        );
        break;
      case 'userAkses':          cekTersedia(window.loadUserAkses, 'Manajemen User & Akses'); break;

      // ── CSR UT ──
      case 'omsetUT':            cekTersedia(window.loadOmsetUT, 'Omset UMKM'); break;
      case 'tenagaKerjaUT':      cekTersedia(window.loadTenagaKerjaUT, 'Tenaga Kerja UMKM'); break;
      case 'fasilitasiUT':       cekTersedia(window.loadFasilitasiUT, 'Fasilitasi Pemasaran UMKM'); break;
      case 'performaTerbaik':    cekTersedia(window.loadPerformaTerbaik, 'Performa UMKM Terbaik'); break;

      // ── UMKM ──
      case 'updateOmset':        cekTersedia(window.loadOmsetUmkm, 'Update Omset'); break;
      case 'updateTenagaKerja':  cekTersedia(window.loadTenagaKerjaUmkm, 'Update Tenaga Kerja'); break;
      case 'fasilitasiSaya':     cekTersedia(window.loadFasilitasiSaya, 'Fasilitasi Pemasaran'); break;
      case 'profilSaya':         cekTersedia(window.loadProfilSaya, 'Profil Usaha Saya'); break;
      case 'bantuan':            cekTersedia(window.loadBantuan, 'Bantuan & Support'); break;

      default:
        wadah.innerHTML = '<div class="panel text-center" style="padding:60px 20px;">' +
          '<i class="bi bi-question-circle" style="font-size:36px;color:var(--border-strong);"></i>' +
          '<p class="mt-3 text-muted">Halaman tidak ditemukan.</p></div>';
    }
  } catch (e) {
    console.error('Navigasi gagal:', e);
    wadah.innerHTML = areaGagal('Terjadi kesalahan saat membuka halaman ini.', 'navigateTo(\'' + sectionId + '\')');
  }
}

/** Halaman yang belum dipasang (tahap berikutnya) ditampilkan dengan
 *  keterangan jelas, bukan layar kosong yang membingungkan. */
function cekTersedia(fn, namaHalaman) {
  if (typeof fn === 'function') { fn(); return; }
  document.getElementById('app-container').innerHTML =
    '<div class="panel text-center" style="padding:60px 20px;">' +
    '<i class="bi bi-hourglass-split" style="font-size:36px;color:var(--border-strong);"></i>' +
    '<h5 class="mt-3">Halaman "' + esc(namaHalaman) + '" belum terpasang</h5>' +
    '<p class="text-muted" style="font-size:13px;">Halaman ini akan aktif setelah berkas tahap berikutnya dipasang.</p></div>';
}

// ── Pengaturan Akun (tersedia untuk semua peran) ──
async function loadPengaturan() {
  const s = AppState.session;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML =
    pageHeader('Preferensi Pengguna', 'Pengaturan', 'Akun',
      'Perbarui foto profil dan alamat akun Anda.', '') +
    '<div class="grid grid-1-2">' +
      '<div class="panel text-center">' +
        '<div id="previewFotoWrap" style="width:110px;height:110px;margin:0 auto 14px;border-radius:50%;overflow:hidden;background:var(--canvas);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:var(--primary);">' +
          (s.fotoURL ? '<img src="' + esc(s.fotoURL) + '" style="width:100%;height:100%;object-fit:cover;">' : esc(String(s.username || '?').substring(0, 2).toUpperCase())) +
        '</div>' +
        '<div style="font-weight:700;">' + esc(s.username) + '</div>' +
        '<div class="text-muted" style="font-size:12px;">' + esc(s.role) + '</div>' +
        '<div class="form-group mt-3" style="text-align:left;">' +
          '<label class="form-label">Ganti Foto Profil</label>' +
          '<input type="file" class="form-control" id="inputFotoProfil" accept="image/*">' +
          '<div class="login-hint">Format JPG/PNG, ukuran maksimal 2 MB.</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-block" id="btnUploadFoto" onclick="simpanFotoProfil()"><i class="bi bi-upload"></i> Unggah Foto</button>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title mb-3">Informasi Akun</div>' +
        '<div class="form-group"><label class="form-label">Username</label><input class="form-control" value="' + esc(s.username) + '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Peran</label><input class="form-control" value="' + esc(s.role) + '" disabled></div>' +
        (s.idUmkm ? '<div class="form-group"><label class="form-label">Kode UMKM</label><input class="form-control" value="' + esc(s.idUmkm) + '" disabled></div>' : '') +
        '<div class="form-group"><label class="form-label">Alamat</label><textarea class="form-control" id="inputAlamatAkun" placeholder="Alamat lengkap">' + esc(s.alamat || '') + '</textarea></div>' +
        '<button class="btn btn-primary btn-block" id="btnSimpanAkun" onclick="simpanPengaturanAkun()"><i class="bi bi-save"></i> Simpan Perubahan</button>' +
      '</div>' +
    '</div>';
}

async function simpanPengaturanAkun() {
  const btn = document.getElementById('btnSimpanAkun');
  const alamat = document.getElementById('inputAlamatAkun').value.trim();
  setBtnLoading(btn);
  const res = await panggilAPI('updateProfil', [alamat, '']);
  resetBtn(btn);
  if (res.success) {
    AppState.session.alamat = alamat;
    simpanSesiLokal(AppState.session);
    AppState.cache.users = null;
    showToast('Berhasil', 'Perubahan akun berhasil disimpan.', 'success');
  } else {
    showToast('Gagal', res.message || 'Gagal menyimpan perubahan.', 'danger');
  }
}

async function simpanFotoProfil() {
  const btn = document.getElementById('btnUploadFoto');
  const input = document.getElementById('inputFotoProfil');
  const file = input.files && input.files[0];
  if (!file) { showToast('Peringatan', 'Pilih berkas foto terlebih dahulu.', 'warning'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Peringatan', 'Ukuran foto melebihi 2 MB.', 'warning'); return; }

  setBtnLoading(btn, 'Mengunggah...');
  try {
    const base64 = await bacaFileSebagaiBase64(file);
    const res = await panggilAPI('uploadFoto', [base64, file.name, file.type]);
    resetBtn(btn);
    if (res.success && res.data && res.data.fotoURL) {
      const urlFoto = res.data.fotoURL;
      await panggilAPI('updateProfil', [AppState.session.alamat || '', urlFoto]);
      AppState.session.fotoURL = urlFoto;
      simpanSesiLokal(AppState.session);
      AppState.cache.users = null;
      document.getElementById('previewFotoWrap').innerHTML = '<img src="' + esc(urlFoto) + '" style="width:100%;height:100%;object-fit:cover;">';
      renderShellPeran();
      showToast('Berhasil', 'Foto profil berhasil diperbarui.', 'success');
    } else {
      showToast('Gagal', (res && res.message) || 'Gagal mengunggah foto.', 'danger');
    }
  } catch (e) {
    resetBtn(btn);
    showToast('Gagal', 'Gagal membaca berkas foto.', 'danger');
  }
}

/** Ubah berkas jadi teks base64 agar bisa dikirim lewat JSON. */
function bacaFileSebagaiBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
    reader.onerror = function () { reject(new Error('Gagal membaca berkas.')); };
    reader.readAsDataURL(file);
  });
}

// ════════════════════════════════════════════════════════
// INISIALISASI
// ════════════════════════════════════════════════════════
let _sipumaSudahInit = false;

async function inisialisasiSipuma() {
  if (_sipumaSudahInit) return;
  _sipumaSudahInit = true;

  // Pasang penanganan submit form login
  const form = document.getElementById('loginForm');
  if (form) form.addEventListener('submit', handleLogin);

  const teksMuat = document.getElementById('loadingText');

  if (!GAS_URL || GAS_URL === 'GANTI_DENGAN_URL_EXEC_ANDA') {
    if (teksMuat) {
      teksMuat.innerHTML = '<b style="color:#DC2626;">Alamat server belum diisi.</b><br>' +
        '<span style="font-size:12px;">Buka berkas <code>js/config.js</code>, isi <code>GAS_URL</code> dengan URL Web App Apps Script Anda (yang berakhiran /exec).</span>';
    }
    return;
  }

  // Coba pulihkan sesi sebelumnya
  const sesiTersimpan = ambilSesiLokal();
  if (sesiTersimpan) {
    if (teksMuat) teksMuat.textContent = 'Memeriksa sesi Anda...';
    AppState.session = sesiTersimpan;
    const res = await panggilAPI('cekSesi', [], { percobaan: 2 });
    if (res.success) {
      const cfg = await panggilAPI('getAllConfig', [], { percobaan: 2 });
      if (cfg.success) AppState.config = cfg.data || {};
      masukKeAplikasi();
      return;
    }
    // Sesi tidak sah — tanganiSesiHabis() sudah dipanggil di dalam panggilAPI
    AppState.session = null;
    hapusSesiLokal();
  }

  tampilkanHalamanLogin();
}

// Jalankan segera bila dokumen sudah siap; kalau belum, tunggu event.
// Lapisan ketiga (setTimeout) berfungsi sebagai jaring pengaman.
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  inisialisasiSipuma();
} else {
  document.addEventListener('DOMContentLoaded', inisialisasiSipuma);
}
setTimeout(inisialisasiSipuma, 1500);
