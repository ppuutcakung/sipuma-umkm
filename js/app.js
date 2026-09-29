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

  // Tiga label dibedakan agar tiap tempat menampilkan keterangan yang tepat:
  // lencana peran di topbar, tagline di bawah nama pengguna, dan status sesi.
  const labelRole    = { Admin: 'Admin / PIC', UT: 'Stakeholder', UMKM: 'Pelaku UMKM (Binaan)' }[s.role] || s.role;
  const labelTagline = { Admin: 'Admin / PIC', UT: 'read-only',   UMKM: 'Pelaku UMKM (Binaan)' }[s.role] || s.role;
  document.getElementById('roleBadge').textContent = labelRole;
  document.getElementById('userChipName').textContent = s.username;
  document.getElementById('userChipRole').textContent = labelTagline;

  const inisial = String(s.username || '?').trim().substring(0, 2).toUpperCase();
  const avatar = document.getElementById('avatarCircle');
  if (s.fotoURL) {
    avatar.innerHTML = '<img src="' + esc(normalizeFotoUrl(s.fotoURL)) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  } else {
    avatar.textContent = inisial;
  }

  document.getElementById('ctxChip').innerHTML = '<i class="bi bi-building"></i> ' +
    (s.role === 'UMKM' ? esc(s.username)
      : s.role === 'UT' ? 'UMKM Binaan'                      // akun lintas lembaga — sengaja umum
      : 'UMKM Binaan ' + esc((typeof infoCabangAktif === 'function'
            ? (infoCabangAktif().nama || 'PPU/LPB') : 'PPU/LPB')));
  document.getElementById('ctxSub').textContent = {
    Admin: 'Panel Administrasi & Pengelolaan Data',
    UT: 'Panel Pemantauan Program',
    UMKM: 'Panel Pelaporan Usaha'
  }[s.role] || '';

  // Pemilih cabang hanya muncul untuk peran lintas cabang
  if (typeof renderPemilihCabang === 'function') renderPemilihCabang();

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
      case 'legalitas':          cekTersedia(window.loadLegalitasAdmin, 'Legalitas UMKM'); break;
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
      case 'legalitasSaya':      cekTersedia(window.loadLegalitasSaya, 'Legalitas Usaha Saya'); break;
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
          (s.fotoURL ? '<img src="' + esc(normalizeFotoUrl(s.fotoURL)) + '" style="width:100%;height:100%;object-fit:cover;">' : esc(String(s.username || '?').substring(0, 2).toUpperCase())) +
        '</div>' +
        '<div style="font-weight:700;">' + esc(s.username) + '</div>' +
        '<div class="text-muted" style="font-size:12px;">' + esc(s.role) + '</div>' +
        '<div class="form-group mt-3" style="text-align:left;">' +
          '<label class="form-label">Ganti Foto Profil</label>' +
          '<input type="file" class="form-control" id="inputFotoProfil" accept="image/*">' +
          '<div class="login-hint">Format JPG/PNG, ukuran maksimal 2 MB.</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-block" id="btnUploadFoto" onclick="simpanFotoProfil()"><i class="bi bi-upload"></i> Unggah Foto</button>' +
        (s.fotoURL ? '<button class="btn btn-outline btn-block mt-2" id="btnHapusFoto" onclick="hapusFotoProfilSaya()" style="color:var(--pemula-text);border-color:var(--pemula-text);"><i class="bi bi-trash"></i> Hapus Foto</button>' : '') +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title mb-3">Informasi Akun</div>' +
        '<div class="form-group"><label class="form-label">Username</label><input class="form-control" value="' + esc(s.username) + '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Peran</label><input class="form-control" value="' + esc(s.role) + '" disabled></div>' +
        (s.idUmkm ? '<div class="form-group"><label class="form-label">Kode UMKM</label><input class="form-control" value="' + esc(s.idUmkm) + '" disabled></div>' : '') +
        '<div class="form-group"><label class="form-label">Alamat</label><textarea class="form-control" id="inputAlamatAkun" placeholder="Alamat lengkap">' + esc(s.alamat || '') + '</textarea></div>' +
        '<button class="btn btn-primary btn-block" id="btnSimpanAkun" onclick="simpanPengaturanAkun()"><i class="bi bi-save"></i> Simpan Perubahan</button>' +
      '</div>' +
    '</div>' +
    (s.role === 'Admin' ? panelPengaturanAplikasi() : '');
}

/** Panel identitas aplikasi — hanya Admin yang boleh mengubah. */
function panelPengaturanAplikasi() {
  const c = AppState.config || {};
  const thSekarang = Number(c.tahunAktif) || new Date().getFullYear();
  const pilihanTahun = [];
  for (let y = thSekarang - 1; y <= thSekarang + 5; y++) pilihanTahun.push(y);

  return '<div class="panel mt-4">' +
    '<div class="panel-title">Periode Aktif Aplikasi</div>' +
    '<div class="panel-sub">Menentukan tahun yang tampil secara bawaan bagi semua pengguna. ' +
      'Data tahun sebelumnya <b>tidak dihapus</b> dan tetap dapat dilihat lewat filter Tahun Data.</div>' +
    '<div class="grid grid-2 mt-3">' +
      '<div class="form-group"><label class="form-label">Periode Tahun</label>' +
        '<select class="form-select" id="cfgPeriode">' +
          pilihanTahun.map(function (y) {
            return '<option value="' + y + '"' + (y === thSekarang ? ' selected' : '') + '>' + y + '</option>';
          }).join('') +
        '</select></div>' +
      '<div class="form-group" style="display:flex;align-items:flex-end;">' +
        '<button class="btn btn-primary" id="btnSimpanPeriode" onclick="simpanPeriodeAktif()">' +
          '<i class="bi bi-calendar-check"></i> Terapkan Periode</button></div>' +
    '</div>' +
    '<div class="text-muted" style="font-size:11.5px;background:var(--canvas);padding:9px 12px;border-radius:8px;">' +
      '<b>Tidak terpengaruh periode:</b> Data Master UMKM, Asesmen Kemandirian, Legalitas UMKM, ' +
      'Manajemen User, dan Pengaturan — semuanya berlaku lintas tahun.' +
    '</div>' +
  '</div>' +

  '<div class="panel mt-4">' +
    '<div class="panel-title">Identitas Aplikasi</div>' +
    '<div class="panel-sub">Pengaturan ini berlaku untuk semua pengguna SIPUMA. Perubahan langsung terlihat setelah disimpan.</div>' +
    '<div class="grid grid-2 mt-3">' +
      '<div class="form-group"><label class="form-label">Nama / Judul Aplikasi</label>' +
        '<input class="form-control" id="cfgJudul" value="' + esc(c.namaAplikasi || 'SIPUMA') + '" placeholder="Contoh: SIPUMA"></div>' +
      '<div class="form-group"><label class="form-label">Tagline</label>' +
        '<input class="form-control" id="cfgTagline" value="' + esc(c.taglineAplikasi || '') + '" placeholder="Contoh: by PPU UT Cakung"></div>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Nama Organisasi (untuk berkas ekspor)</label>' +
      '<input class="form-control" id="cfgOrganisasi" value="' + esc(c.namaOrganisasi || '') + '" placeholder="Contoh: LPB UT Tanjung">' +
      '<div class="login-hint">Tercetak di baris kedua pada berkas Excel &amp; PDF. ' +
        'Berlaku untuk cabang ini saja. Bila dikosongkan, dipakai nama cabang dari sistem.</div></div>' +
    '<div class="form-group"><label class="form-label">Teks Footer</label>' +
      '<input class="form-control" id="cfgFooter" value="' + esc(c.teksFooter || 'Cakung, Kota Jakarta Timur, DKI Jakarta - Binaan PPU UT Cakung') + '"></div>' +
    '<div class="grid grid-2">' +
      '<div class="form-group"><label class="form-label">Warna Utama Aplikasi</label>' +
        '<div class="d-flex gap-2 align-center">' +
          '<input type="color" class="form-control" id="cfgWarna" value="' + esc(c.warnaUtama || '#0284C7') + '" style="width:64px;padding:4px;height:38px;" oninput="document.getElementById(\'cfgWarnaTeks\').value = this.value;">' +
          '<input class="form-control" id="cfgWarnaTeks" value="' + esc(c.warnaUtama || '#0284C7') + '" placeholder="#0284C7" oninput="if(/^#[0-9A-Fa-f]{6}$/.test(this.value)) document.getElementById(\'cfgWarna\').value = this.value;">' +
        '</div>' +
        '<div class="login-hint">Ubah warna, lalu Simpan untuk melihat hasilnya.</div></div>' +
      '<div class="form-group"><label class="form-label">Logo Aplikasi</label>' +
        '<input type="file" class="form-control" id="cfgLogoFile" accept="image/*">' +
        '<div class="login-hint">PNG transparan disarankan, maksimal 1 MB.' +
          (c.logoURL ? ' <a href="' + esc(c.logoURL) + '" target="_blank">Lihat logo saat ini</a>' : '') + '</div></div>' +
    '</div>' +
    '<div class="d-flex gap-2">' +
      '<button class="btn btn-primary" id="btnSimpanAplikasi" onclick="simpanPengaturanAplikasi()"><i class="bi bi-save"></i> Simpan Identitas Aplikasi</button>' +
      '<button class="btn btn-outline" onclick="resetIdentitasAplikasi()">Kembalikan ke Bawaan</button>' +
    '</div>' +
  '</div>' +

  '<div class="panel mt-4">' +
    '<div class="panel-title">Cadangan Data (Backup)</div>' +
    '<div class="panel-sub">Unduh salinan seluruh data aplikasi tanpa perlu membuka Google Drive.</div>' +
    '<div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;">' +
      '<button class="btn btn-primary" id="btnBackupExcel" onclick="unduhBackup(\'excel\')">' +
        '<i class="bi bi-file-earmark-excel"></i> Unduh Cadangan (Excel)</button>' +
      '<button class="btn btn-outline" id="btnBackupJson" onclick="unduhBackup(\'json\')">' +
        '<i class="bi bi-filetype-json"></i> Unduh Cadangan (JSON)</button>' +
    '</div>' +
    '<div class="text-muted mt-3" style="font-size:11.5px;background:var(--canvas);padding:9px 12px;border-radius:8px;">' +
      '<b>Excel</b> — satu berkas berisi banyak lembar, mudah dibaca dan diperiksa.<br>' +
      '<b>JSON</b> — salinan mentah yang lebih lengkap, cocok bila suatu saat perlu dipulihkan.<br>' +
      '<b>Demi keamanan,</b> berkas cadangan <b>tidak menyertakan password</b> maupun data sesi login. ' +
      'Cadangan ini untuk arsip data, bukan untuk memulihkan akun.' +
    '</div>' +
  '</div>';
}

/** Unduh cadangan seluruh data aplikasi. */
function unduhBackup(format) {
  const btn = document.getElementById(format === 'json' ? 'btnBackupJson' : 'btnBackupExcel');
  setBtnLoading(btn, 'Menyiapkan...');
  panggilServerAman('getBackupData', [], function (res) {
    resetBtn(btn);
    if (!res.success) { showToast('Gagal', res.message || 'Gagal menyiapkan cadangan.', 'danger'); return; }
    const d = res.data;
    const stempel = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      unduhBerkas(JSON.stringify(d, null, 2), 'Backup-SIPUMA-' + stempel + '.json', 'application/json');
      showToast('Berhasil', 'Cadangan JSON berhasil diunduh (' + d.jumlahSheet + ' lembar data).', 'success');
      return;
    }

    // Excel banyak lembar: tiap <table> menjadi satu worksheet, urut sesuai daftar nama.
    const namaSheet = Object.keys(d.sheets);
    let tabelSemua = '';
    namaSheet.forEach(function (nama) {
      const s = d.sheets[nama];
      tabelSemua += bangunTabelEkspor('Data: ' + nama, s.headers.length ? s.headers : ['(kosong)'],
        s.rows, null, 'Jumlah baris: ' + s.rows.length);
    });

    const isi =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>' +
      namaSheet.map(function (n) {
        return '<x:ExcelWorksheet><x:Name>' + n.substring(0, 30) + '</x:Name>' +
               '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>';
      }).join('') +
      '</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>' +
      tabelSemua + '</body></html>';

    unduhBerkas(isi, 'Backup-SIPUMA-' + stempel + '.xls', 'application/vnd.ms-excel');
    showToast('Berhasil', 'Cadangan Excel berhasil diunduh (' + d.jumlahSheet + ' lembar data).', 'success');
  }, function () {
    resetBtn(btn);
    showToast('Error', 'Gagal mengambil data cadangan dari server.', 'danger');
  });
}

async function simpanPengaturanAplikasi() {
  const btn = document.getElementById('btnSimpanAplikasi');
  const judul   = document.getElementById('cfgJudul').value.trim();
  const tagline = document.getElementById('cfgTagline').value.trim();
  const footer  = document.getElementById('cfgFooter').value.trim();
  const organisasi = document.getElementById('cfgOrganisasi').value.trim();
  const warna   = document.getElementById('cfgWarnaTeks').value.trim() || document.getElementById('cfgWarna').value;
  const fileLogo = document.getElementById('cfgLogoFile').files[0];

  if (!/^#[0-9A-Fa-f]{6}$/.test(warna)) {
    showToast('Peringatan', 'Format warna harus seperti #0284C7.', 'warning');
    return;
  }

  setBtnLoading(btn);
  try {
    // Unggah logo lebih dulu bila ada berkas baru dipilih
    if (fileLogo) {
      if (fileLogo.size > 1024 * 1024) {
        resetBtn(btn);
        showToast('Peringatan', 'Ukuran logo melebihi 1 MB.', 'warning');
        return;
      }
      const b64 = await bacaFileSebagaiBase64(fileLogo);
      const up = await panggilAPI('uploadFoto', [b64, 'logo-aplikasi-' + Date.now() + '-' + fileLogo.name, fileLogo.type]);
      if (up.success && up.data && up.data.fotoURL) {
        await panggilAPI('setConfig', ['logoURL', up.data.fotoURL]);
        AppState.config.logoURL = up.data.fotoURL;
      } else {
        resetBtn(btn);
        showToast('Gagal', (up && up.message) || 'Logo gagal diunggah.', 'danger');
        return;
      }
    }

    const hasil = await Promise.all([
      panggilAPI('setConfig', ['namaAplikasi', judul]),
      panggilAPI('setConfig', ['taglineAplikasi', tagline]),
      panggilAPI('setConfig', ['teksFooter', footer]),
      panggilAPI('setConfig', ['namaOrganisasi', organisasi]),
      panggilAPI('setConfig', ['warnaUtama', warna])
    ]);
    resetBtn(btn);

    if (hasil.every(function (r) { return r.success; })) {
      AppState.config.namaAplikasi = judul;
      AppState.config.taglineAplikasi = tagline;
      AppState.config.teksFooter = footer;
      AppState.config.namaOrganisasi = organisasi;
      AppState.config.warnaUtama = warna;
      terapkanIdentitasAplikasi();
      showToast('Berhasil', 'Identitas aplikasi berhasil diperbarui.', 'success');
    } else {
      showToast('Gagal', 'Sebagian pengaturan gagal disimpan. Silakan coba lagi.', 'danger');
    }
  } catch (e) {
    resetBtn(btn);
    showToast('Gagal', 'Terjadi kesalahan saat menyimpan.', 'danger');
  }
}

function resetIdentitasAplikasi() {
  showConfirm('Kembalikan judul, tagline, footer, dan warna ke pengaturan bawaan?', function () {
    closeModal('modalConfirm');
    document.getElementById('cfgJudul').value = 'SIPUMA';
    document.getElementById('cfgTagline').value = 'by PPU UT Cakung';
    document.getElementById('cfgFooter').value = 'Cakung, Kota Jakarta Timur, DKI Jakarta - Binaan PPU UT Cakung';
    document.getElementById('cfgOrganisasi').value = '';
    document.getElementById('cfgWarna').value = '#0284C7';
    document.getElementById('cfgWarnaTeks').value = '#0284C7';
    showToast('Siap', 'Nilai bawaan sudah diisi. Klik Simpan untuk menerapkannya.', 'info');
  }, 'Ya, Kembalikan');
}

/**
 * Terapkan identitas aplikasi (judul, tagline, logo, footer, warna) ke
 * tampilan. Dipanggil setiap kali masuk aplikasi dan setelah disimpan.
 */
function terapkanIdentitasAplikasi() {
  const c = AppState.config || {};

  if (c.namaAplikasi) {
    document.title = c.namaAplikasi + ' — PPU UT Cakung';
    document.querySelectorAll('.brand-name').forEach(function (el) { el.textContent = c.namaAplikasi; });
  }
  if (c.taglineAplikasi) {
    document.querySelectorAll('.brand-sub').forEach(function (el) { el.textContent = c.taglineAplikasi; });
  }
  if (c.teksFooter) {
    const f = document.querySelector('.app-footer span');
    if (f) f.innerHTML = '<i class="bi bi-geo-alt"></i> ' + esc(c.teksFooter);
  }
  if (c.logoURL) {
    document.querySelectorAll('.logo-badge').forEach(function (el) {
      el.innerHTML = '<img src="' + esc(normalizeFotoUrl(c.logoURL)) + '" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">';
    });
  }
  if (c.warnaUtama && /^#[0-9A-Fa-f]{6}$/.test(c.warnaUtama)) {
    const akar = document.documentElement;
    akar.style.setProperty('--primary', c.warnaUtama);
    akar.style.setProperty('--primary-active', gelapkanWarna(c.warnaUtama, 18));
    akar.style.setProperty('--primary-light', terangkanWarna(c.warnaUtama, 90));
    akar.style.setProperty('--sidebar-active-bg', c.warnaUtama);
  }
}

/** Gelapkan warna heksadesimal beberapa persen (untuk status aktif/tekan). */
function gelapkanWarna(hex, persen) {
  const n = parseInt(hex.slice(1), 16);
  const f = (100 - persen) / 100;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return '#' + [r, g, b].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
}

/** Terangkan warna heksadesimal (untuk latar lembut). */
function terangkanWarna(hex, persen) {
  const n = parseInt(hex.slice(1), 16);
  const f = persen / 100;
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * f);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * f);
  const b = Math.round((n & 255) + (255 - (n & 255)) * f);
  return '#' + [r, g, b].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
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
    // Argumen ke-4 = foto lama, agar berkasnya dihapus dari Drive dan
    // tidak menumpuk setiap kali pengguna mengganti foto.
    const res = await panggilAPI('uploadFoto', [base64, file.name, file.type, AppState.session.fotoURL || '']);
    resetBtn(btn);
    if (res.success && res.data && res.data.fotoURL) {
      const urlFoto = res.data.fotoURL;
      await panggilAPI('updateProfil', [AppState.session.alamat || '', urlFoto]);
      AppState.session.fotoURL = urlFoto;
      simpanSesiLokal(AppState.session);
      AppState.cache.users = null;
      document.getElementById('previewFotoWrap').innerHTML = '<img src="' + esc(normalizeFotoUrl(urlFoto)) + '" style="width:100%;height:100%;object-fit:cover;">';
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

  // Nyalakan Firebase sebelum apa pun yang menyentuh data
  if (!mulaiFirebase()) {
    if (teksMuat) teksMuat.innerHTML =
      '<b style="color:#DC2626;">Gagal memuat Firebase.</b><br>' +
      '<span style="font-size:12px;">Periksa koneksi internet, lalu muat ulang halaman.</span>';
    return;
  }

  // Pemulihan sesi diserahkan ke Firebase Auth: ia menyimpan sesinya
  // sendiri di perangkat dan memperbarui token secara berkala, sehingga
  // pengguna tidak perlu login ulang tiap kali menutup tab.
  if (teksMuat) teksMuat.textContent = 'Memeriksa sesi Anda...';

  await new Promise(function (selesai) {
    const berhenti = fbAuth.onAuthStateChanged(async function (user) {
      berhenti();
      if (!user) { tampilkanHalamanLogin(); return selesai(); }
      try {
        const k = await klaimPengguna();
        const tersimpan = ambilSesiLokal() || {};
        AppState.session = {
          username: k.username,
          role: roleKeLama(k.role),   // untuk menu & halaman
          roleFS: k.role,             // untuk Firestore
          cabang: k.cabang, idUmkm: k.idUmkm,
          fotoURL: tersimpan.fotoURL || '', alamat: tersimpan.alamat || ''
        };
        if (k.role === 'stakeholder' || k.role === 'superadmin') {
          await muatDaftarCabang();
          AppState.cabangDipilih = (AppState.daftarCabang[0] || {}).kode || 'CAKUNG';
        } else {
          AppState.cabangDipilih = null;
        }
        simpanSesiLokal(AppState.session);
        const cfg = await panggilAPI('getAllConfig', []);
        AppState.config = cfg.success ? (cfg.data || {}) : {};
        masukKeAplikasi();
      } catch (e) {
        console.error('Pemulihan sesi gagal:', e);
        await keluarFirebase();
        hapusSesiLokal();
        tampilkanHalamanLogin();
      }
      selesai();
    });
  });
}

// Jalankan segera bila dokumen sudah siap; kalau belum, tunggu event.
// Lapisan ketiga (setTimeout) berfungsi sebagai jaring pengaman.
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  inisialisasiSipuma();
} else {
  document.addEventListener('DOMContentLoaded', inisialisasiSipuma);
}
setTimeout(inisialisasiSipuma, 1500);

/** Hapus foto profil pengguna yang sedang login (berkas Drive ikut dihapus). */
function hapusFotoProfilSaya() {
  showConfirm('Hapus foto profil Anda? Berkas fotonya juga akan dihapus dari Google Drive.', function () {
    closeModal('modalConfirm');
    const btn = document.getElementById('btnHapusFoto');
    setBtnLoading(btn, 'Menghapus...');
    panggilServerAman('hapusFotoProfil', [], function (res) {
      resetBtn(btn);
      if (res.success) {
        AppState.session.fotoURL = '';
        simpanSesiLokal(AppState.session);
        AppState.cache.users = null;
        renderShellPeran();
        loadPengaturan();           // segarkan halaman agar tombol menyesuaikan
        showToast('Berhasil', res.message, 'success');
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    }, function () {
      resetBtn(btn);
      showToast('Error', 'Gagal menghapus foto. Silakan coba lagi.', 'danger');
    });
  }, 'Ya, Hapus');
}


/** Terapkan periode (tahun) aktif aplikasi — hanya Admin. */
function simpanPeriodeAktif() {
  const btn = document.getElementById('btnSimpanPeriode');
  const tahun = Number(document.getElementById('cfgPeriode').value);

  showConfirm(
    'Jadikan <b>tahun ' + tahun + '</b> sebagai periode aktif aplikasi?<br><br>' +
    'Seluruh pengguna (Admin, Stakeholder, dan UMKM) akan melihat data tahun ini secara bawaan, ' +
    'dan kolom isian tahun ' + tahun + ' siap digunakan.<br><br>' +
    '<b>Data tahun sebelumnya tetap tersimpan</b> dan masih bisa dilihat lewat filter Tahun Data.',
    function () {
      closeModal('modalConfirm');
      setBtnLoading(btn, 'Menerapkan...');
      panggilServerAman('setPeriodeAktif', [tahun], function (res) {
        resetBtn(btn);
        if (res.success) {
          AppState.config.tahunAktif = tahun;
          AppState.tahunDipilih = null;
          AppState.cache.dashboardOrganisasi = null;
          AppState.cache.omsetAll = null;
          AppState.cache.tenagaKerjaAll = null;
          showToast('Berhasil', res.message, 'success');
        } else {
          showToast('Gagal', res.message, 'danger');
        }
      }, function () {
        resetBtn(btn);
        showToast('Error', 'Gagal menerapkan periode.', 'danger');
      });
    }, 'Ya, Terapkan');
}
