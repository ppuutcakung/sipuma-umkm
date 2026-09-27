// ════════════════════════════════════════════════════════
// MODUL: LEGALITAS USAHA
// ════════════════════════════════════════════════════════
// Admin  : kelola penuh (tambah / ubah / hapus) seluruh UMKM
// UMKM   : hanya melihat legalitas usahanya sendiri
//
// Aturan status (dihitung di server, agar seragam di semua tampilan):
//   Seumur hidup / sisa > 1 tahun   → Aktif
//   Sisa ≤ 1 tahun                  → Perlu Diperbarui
//   Sudah lewat tanggal batas       → Kadaluarsa

const JENIS_LEGALITAS = [
  'NIB (Nomor Induk Berusaha)',
  'SIUP',
  'TDP',
  'NPWP',
  'PIRT',
  'Sertifikat Halal',
  'BPOM',
  'HAKI / Merek Dagang',
  'Sertifikat Produk',
  'Izin Usaha Mikro Kecil (IUMK)',
  'Lainnya'
];

const LEGALITAS_PER_HALAMAN = 12;

/** Kelas warna untuk lencana status legalitas. */
function kelasStatusLegalitas(status) {
  if (status === 'Aktif') return 'pramandiri';
  if (status === 'Kadaluarsa') return 'pemula';
  return 'madya';
}

function lencanaStatusLegalitas(l) {
  const cls = kelasStatusLegalitas(l.Status);
  return '<span class="tier-score-pill tier-' + cls + '">' + esc(l.Status) + '</span>';
}

/** Keterangan masa berlaku yang mudah dipahami. */
function keteranganMasaBerlaku(l) {
  if (l.IsSeumurHidup) return 'Berlaku seumur hidup';
  if (!l.TanggalKadaluarsa) return 'Tanggal kadaluarsa belum diisi';
  const tgl = formatTgl(l.TanggalKadaluarsa);
  if (l.SisaHari === null || l.SisaHari === undefined) return 'Berlaku sampai ' + tgl;
  if (l.SisaHari < 0) return 'Kadaluarsa sejak ' + tgl + ' (' + Math.abs(l.SisaHari) + ' hari lalu)';
  return 'Berlaku sampai ' + tgl + ' (' + l.SisaHari + ' hari lagi)';
}

// ════════════════════════════════════════════════════════
// HALAMAN ADMIN
// ════════════════════════════════════════════════════════
function loadLegalitasAdmin() {
  const sec = AppState.currentSection;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML = areaMemuat();

  ensureUmkmCacheThen(function () {
    panggilServerAman('getAllLegalitas', [], function (res) {
      if (AppState.currentSection !== sec) return;
      AppState.cache.legalitas = res.success ? (res.data || []) : [];
      renderLegalitasAdmin();
    }, function () {
      if (AppState.currentSection !== sec) return;
      wadah.innerHTML = areaGagal('Gagal memuat data legalitas.', 'loadLegalitasAdmin()');
    });
  });
}

function renderLegalitasAdmin() {
  const rows = AppState.cache.legalitas || [];
  const aktif    = rows.filter(function (l) { return l.Status === 'Aktif'; }).length;
  const perbarui = rows.filter(function (l) { return l.Status === 'Perlu Diperbarui'; }).length;
  const lewat    = rows.filter(function (l) { return l.Status === 'Kadaluarsa'; }).length;

  document.getElementById('app-container').innerHTML =
    pageHeader('Kepatuhan Usaha', 'Legalitas', 'UMKM',
      'Catat dan pantau masa berlaku legalitas UMKM binaan, agar tidak ada yang terlewat kadaluarsa.',
      '<button class="btn btn-primary" onclick="formLegalitas()"><i class="bi bi-plus-lg"></i> Tambah Legalitas</button>') +

    '<div class="grid grid-4 mb-4">' +
      '<div class="kpi-card c-blue"><div class="kpi-label">Total Dokumen</div><div class="kpi-value">' + rows.length + '</div></div>' +
      '<div class="kpi-card c-green"><div class="kpi-label">Aktif</div><div class="kpi-value">' + aktif + '</div></div>' +
      '<div class="kpi-card c-purple"><div class="kpi-label">Perlu Diperbarui</div><div class="kpi-value">' + perbarui + '</div><div class="kpi-meta">Sisa berlaku ≤ 1 tahun</div></div>' +
      '<div class="kpi-card c-red"><div class="kpi-label">Kadaluarsa</div><div class="kpi-value">' + lewat + '</div></div>' +
    '</div>' +

    '<div class="table-card">' +
      '<div class="table-toolbar">' +
        '<div class="d-flex gap-2 align-center" style="flex-wrap:wrap;">' +
          '<select class="form-select" id="legalFilterStatus" style="width:auto;height:34px;" onchange="renderLegalitasTabel(1)">' +
            '<option value="">Semua Status</option>' +
            '<option value="Kadaluarsa">Kadaluarsa</option>' +
            '<option value="Perlu Diperbarui">Perlu Diperbarui</option>' +
            '<option value="Aktif">Aktif</option>' +
          '</select>' +
          '<div class="input-group-icon" style="width:230px;">' +
            '<i class="bi bi-search"></i>' +
            '<input type="text" class="form-control" id="legalCari" style="height:34px;" placeholder="Cari UMKM / jenis legalitas..." oninput="renderLegalitasTabel(1)">' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="legalTabelArea"></div>' +
    '</div>';

  renderLegalitasTabel(1);
}

function renderLegalitasTabel(halaman) {
  const area = document.getElementById('legalTabelArea');
  if (!area) return;
  const fStatus = document.getElementById('legalFilterStatus') ? document.getElementById('legalFilterStatus').value : '';
  const kunci = document.getElementById('legalCari') ? document.getElementById('legalCari').value.trim().toLowerCase() : '';

  let rows = (AppState.cache.legalitas || []).slice();
  if (fStatus) rows = rows.filter(function (l) { return l.Status === fStatus; });
  if (kunci) {
    rows = rows.filter(function (l) {
      return String(l.NamaUMKM).toLowerCase().includes(kunci) ||
             String(l.JenisLegalitas).toLowerCase().includes(kunci) ||
             String(l.NomorLegalitas || '').toLowerCase().includes(kunci);
    });
  }
  // Paling mendesak di atas: kadaluarsa, lalu yang paling dekat masa habisnya
  const urutan = { 'Kadaluarsa': 0, 'Perlu Diperbarui': 1, 'Aktif': 2 };
  rows.sort(function (a, b) {
    const d = (urutan[a.Status] || 3) - (urutan[b.Status] || 3);
    if (d !== 0) return d;
    return (a.SisaHari === null ? 99999 : a.SisaHari) - (b.SisaHari === null ? 99999 : b.SisaHari);
  });

  const totalHalaman = Math.max(1, Math.ceil(rows.length / LEGALITAS_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * LEGALITAS_PER_HALAMAN;
  const hal = rows.slice(mulai, mulai + LEGALITAS_PER_HALAMAN);

  area.innerHTML =
    '<div style="overflow-x:auto;"><table class="sipuma-table">' +
      '<thead><tr><th>UMKM</th><th>Jenis Legalitas</th><th>Nomor</th><th>Masa Berlaku</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (hal.length ? hal.map(function (l) {
        return '<tr>' +
          '<td><b>' + esc(l.NamaUMKM) + '</b><div class="text-muted" style="font-size:11px;">' + esc(l.IDUMKM) + '</div></td>' +
          '<td>' + esc(l.JenisLegalitas) + '</td>' +
          '<td>' + esc(l.NomorLegalitas || '-') + '</td>' +
          '<td style="font-size:12px;">' + esc(keteranganMasaBerlaku(l)) + '</td>' +
          '<td>' + lencanaStatusLegalitas(l) + '</td>' +
          '<td>' +
            '<button class="action-icon-btn primary" title="Ubah" onclick=\'formLegalitas(' + JSON.stringify(l) + ')\'><i class="bi bi-pencil"></i></button>' +
            '<button class="action-icon-btn danger" title="Hapus" onclick="hapusLegalitas(\'' + esc(l.ID) + '\')"><i class="bi bi-trash"></i></button>' +
          '</td></tr>';
      }).join('')
      : '<tr><td colspan="6"><div class="table-empty"><i class="bi bi-inbox"></i>' +
        ((fStatus || kunci) ? 'Tidak ada data yang cocok.' : 'Belum ada data legalitas.') + '</div></td></tr>') +
      '</tbody></table></div>' +
    (totalHalaman > 1
      ? '<div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;padding:0 4px 4px;">' +
        Array.from({ length: totalHalaman }, function (_, i) { return i + 1; }).map(function (p) {
          return '<button class="btn ' + (p === halaman ? 'btn-primary' : 'btn-outline') + ' btn-sm" onclick="renderLegalitasTabel(' + p + ')">' + p + '</button>';
        }).join('') + '</div>'
      : '');
}

function formLegalitas(data) {
  const isEdit = !!data;
  const seumurHidup = isEdit && (data.IsSeumurHidup || String(data.SeumurHidup).toLowerCase() === 'ya');

  const body =
    '<input type="hidden" id="legalId" value="' + (isEdit ? esc(data.ID) : '') + '">' +
    '<div class="form-group"><label class="form-label">Pilih UMKM</label>' +
      dropdownUmkmCari('legalUmkm', isEdit ? data.IDUMKM : null, '', isEdit) + '</div>' +
    '<div class="grid grid-2">' +
      '<div class="form-group"><label class="form-label">Jenis Legalitas</label>' +
        '<select class="form-select" id="legalJenis">' + optionsHtml(JENIS_LEGALITAS, isEdit ? data.JenisLegalitas : null) + '</select></div>' +
      '<div class="form-group"><label class="form-label">Nomor Legalitas</label>' +
        '<input class="form-control" id="legalNomor" value="' + (isEdit ? esc(data.NomorLegalitas || '') : '') + '" placeholder="Contoh: 1234567890123"></div>' +
    '</div>' +
    '<div class="grid grid-2">' +
      '<div class="form-group"><label class="form-label">Tanggal Terbit</label>' +
        '<input type="date" class="form-control" id="legalTerbit" value="' + (isEdit && data.TanggalTerbit ? formatTglUntukInput(data.TanggalTerbit) : '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Tanggal Kadaluarsa</label>' +
        '<input type="date" class="form-control" id="legalKadaluarsa" value="' + (isEdit && data.TanggalKadaluarsa ? formatTglUntukInput(data.TanggalKadaluarsa) : '') + '"' + (seumurHidup ? ' disabled' : '') + '></div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-check-switch" style="cursor:pointer;">' +
        '<input type="checkbox" id="legalSeumurHidup"' + (seumurHidup ? ' checked' : '') + ' onchange="document.getElementById(\'legalKadaluarsa\').disabled = this.checked;">' +
        '<span style="font-size:13px;">Berlaku seumur hidup (tanpa masa kadaluarsa)</span>' +
      '</label>' +
    '</div>' +
    '<div class="grid grid-2">' +
      '<div class="form-group"><label class="form-label">Instansi Penerbit</label>' +
        '<input class="form-control" id="legalPenerbit" value="' + (isEdit ? esc(data.Penerbit || '') : '') + '" placeholder="Contoh: OSS / Dinas Kesehatan"></div>' +
      '<div class="form-group"><label class="form-label">Catatan (opsional)</label>' +
        '<input class="form-control" id="legalCatatan" value="' + (isEdit ? esc(data.Catatan || '') : '') + '"></div>' +
    '</div>' +
    '<div class="text-muted" style="font-size:11.5px;background:var(--canvas);padding:9px 12px;border-radius:8px;">' +
      '<b>Aturan status otomatis:</b> seumur hidup atau sisa berlaku lebih dari 1 tahun → <b>Aktif</b>. ' +
      'Sisa 1 tahun atau kurang → <b>Perlu Diperbarui</b>. Lewat tanggal batas → <b>Kadaluarsa</b>.' +
    '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal(\'modalGeneric\')">Batal</button>' +
    '<button class="btn btn-primary" id="btnSimpanLegal" onclick="simpanLegalitas(' + isEdit + ')"><i class="bi bi-save"></i> Simpan</button>';

  openFormModal(isEdit ? 'Ubah Data Legalitas' : 'Tambah Data Legalitas', body, footer);
}

function simpanLegalitas(isEdit) {
  const btn = document.getElementById('btnSimpanLegal');
  const kodeUmkm = document.getElementById('legalUmkm').value;
  const seumurHidup = document.getElementById('legalSeumurHidup').checked;
  const kadaluarsa = document.getElementById('legalKadaluarsa').value;

  if (!kodeUmkm) { showToast('Peringatan', 'Pilih UMKM terlebih dahulu.', 'warning'); return; }
  if (!seumurHidup && !kadaluarsa) {
    showToast('Peringatan', 'Isi tanggal kadaluarsa, atau centang "Berlaku seumur hidup".', 'warning');
    return;
  }

  const umkmObj = (AppState.cache.umkm || []).find(function (u) { return u.KodeUnik === kodeUmkm; });
  const record = {
    IDUMKM: kodeUmkm,
    NamaUMKM: umkmObj ? umkmObj.NamaUMKM : '',
    JenisLegalitas: document.getElementById('legalJenis').value,
    NomorLegalitas: document.getElementById('legalNomor').value.trim(),
    TanggalTerbit: document.getElementById('legalTerbit').value,
    TanggalKadaluarsa: seumurHidup ? '' : kadaluarsa,
    SeumurHidup: seumurHidup,
    Penerbit: document.getElementById('legalPenerbit').value.trim(),
    Catatan: document.getElementById('legalCatatan').value.trim()
  };
  if (isEdit) record.ID = document.getElementById('legalId').value;

  setBtnLoading(btn);
  panggilServerAman(isEdit ? 'updateLegalitas' : 'addLegalitas', [record], function (res) {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      closeModal('modalGeneric');
      AppState.cache.legalitas = null;   // paksa ambil ulang agar status terhitung server
      loadLegalitasAdmin();
    } else {
      showToast('Gagal', res.message, 'danger');
    }
  }, function () {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan data legalitas.', 'danger');
  });
}

function hapusLegalitas(id) {
  showConfirm('Hapus data legalitas ini secara permanen?', function () {
    closeModal('modalConfirm');
    panggilServerAman('deleteLegalitas', [id], function (res) {
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        AppState.cache.legalitas = null;
        loadLegalitasAdmin();
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    }, function () {
      showToast('Error', 'Gagal menghapus data legalitas.', 'danger');
    });
  }, 'Ya, Hapus');
}

// ════════════════════════════════════════════════════════
// HALAMAN UMKM (hanya melihat)
// ════════════════════════════════════════════════════════
function loadLegalitasSaya() {
  const sec = AppState.currentSection;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML = areaMemuat();

  panggilServerAman('getLegalitasUMKM', [AppState.session.idUmkm], function (res) {
    if (AppState.currentSection !== sec) return;
    if (!res.success) { wadah.innerHTML = areaGagal('Gagal memuat data legalitas.', 'loadLegalitasSaya()'); return; }
    renderLegalitasSaya(res.data || []);
  }, function () {
    if (AppState.currentSection !== sec) return;
    wadah.innerHTML = areaGagal('Gagal memuat data legalitas.', 'loadLegalitasSaya()');
  });
}

function renderLegalitasSaya(rows) {
  const aktif    = rows.filter(function (l) { return l.Status === 'Aktif'; }).length;
  const perbarui = rows.filter(function (l) { return l.Status === 'Perlu Diperbarui'; }).length;
  const lewat    = rows.filter(function (l) { return l.Status === 'Kadaluarsa'; }).length;

  const urutan = { 'Kadaluarsa': 0, 'Perlu Diperbarui': 1, 'Aktif': 2 };
  rows = rows.slice().sort(function (a, b) {
    const d = (urutan[a.Status] || 3) - (urutan[b.Status] || 3);
    if (d !== 0) return d;
    return (a.SisaHari === null ? 99999 : a.SisaHari) - (b.SisaHari === null ? 99999 : b.SisaHari);
  });

  document.getElementById('app-container').innerHTML =
    pageHeader('Kepatuhan Usaha', 'Legalitas', 'Usaha Saya',
      'Daftar legalitas usaha Anda beserta masa berlakunya. Segera urus perpanjangan bila ada yang mendekati kadaluarsa.', '') +

    '<div class="grid grid-3 mb-4">' +
      '<div class="kpi-card c-green"><div class="kpi-label">Aktif</div><div class="kpi-value">' + aktif + '</div><div class="kpi-meta">Masa berlaku masih panjang</div></div>' +
      '<div class="kpi-card c-purple"><div class="kpi-label">Perlu Diperbarui</div><div class="kpi-value">' + perbarui + '</div><div class="kpi-meta">Sisa berlaku 1 tahun atau kurang</div></div>' +
      '<div class="kpi-card c-red"><div class="kpi-label">Kadaluarsa</div><div class="kpi-value">' + lewat + '</div><div class="kpi-meta">Sudah lewat masa berlaku</div></div>' +
    '</div>' +

    ((perbarui || lewat)
      ? '<div class="panel mb-3" style="background:var(--madya-bg);border-left:4px solid var(--madya-accent);">' +
        '<div style="font-size:13px;color:var(--madya-text);">' +
        '<b><i class="bi bi-exclamation-triangle-fill"></i> Perlu perhatian.</b> ' +
        'Ada ' + (lewat ? lewat + ' dokumen yang sudah kadaluarsa' : '') +
        (lewat && perbarui ? ' dan ' : '') +
        (perbarui ? perbarui + ' dokumen yang mendekati masa habis' : '') +
        '. Hubungi pendamping PPU UT Cakung untuk proses perpanjangannya.</div></div>'
      : '') +

    '<div class="table-card"><div style="overflow-x:auto;"><table class="sipuma-table">' +
      '<thead><tr><th>Jenis Legalitas</th><th>Nomor</th><th>Terbit</th><th>Masa Berlaku</th><th>Status</th></tr></thead>' +
      '<tbody>' +
      (rows.length ? rows.map(function (l) {
        return '<tr>' +
          '<td><b>' + esc(l.JenisLegalitas) + '</b>' +
            (l.Penerbit ? '<div class="text-muted" style="font-size:11px;">' + esc(l.Penerbit) + '</div>' : '') + '</td>' +
          '<td>' + esc(l.NomorLegalitas || '-') + '</td>' +
          '<td>' + (l.TanggalTerbit ? formatTgl(l.TanggalTerbit) : '-') + '</td>' +
          '<td style="font-size:12px;">' + esc(keteranganMasaBerlaku(l)) + '</td>' +
          '<td>' + lencanaStatusLegalitas(l) + '</td></tr>';
      }).join('')
      : '<tr><td colspan="5"><div class="table-empty"><i class="bi bi-inbox"></i>' +
        'Belum ada data legalitas yang tercatat. Hubungi pendamping PPU UT Cakung untuk mendaftarkannya.</div></td></tr>') +
      '</tbody></table></div></div>';
}
