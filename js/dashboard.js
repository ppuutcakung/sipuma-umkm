// ════════════════════════════════════════════════════════
// DASHBOARD — Admin / CSR UT / UMKM
// ════════════════════════════════════════════════════════

async function loadDashboard() {
  const role = AppState.session.role;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML = areaMemuat();
  const sec = AppState.currentSection;

  if (role === 'UMKM') {
    const res = await panggilAPI('getDashboardUMKM', [null, AppState.tahunDipilih || null]);
    if (AppState.currentSection !== sec) return;
    if (!res.success) { wadah.innerHTML = areaGagal('Gagal memuat dashboard.', 'loadDashboard()'); return; }
    renderDashboardUMKM(res.data);
    return;
  }

  // Admin & CSR UT memakai dashboard organisasi yang sama
  if (AppState.cache.dashboardOrganisasi) {
    renderDashboardOrganisasi(AppState.cache.dashboardOrganisasi, role);
    return;
  }
  const res = await panggilAPI('getDashboardOrganisasi', []);
  if (AppState.currentSection !== sec) return;
  if (!res.success) { wadah.innerHTML = areaGagal('Gagal memuat dashboard.', 'loadDashboard()'); return; }
  AppState.cache.dashboardOrganisasi = res.data;
  renderDashboardOrganisasi(res.data, role);
}

/** Muat ulang dashboard untuk tahun tertentu (dipicu filter tahun). */
async function gantiTahunDashboard(tahun) {
  const role = AppState.session.role;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML = areaMemuat();
  const sec = AppState.currentSection;
  AppState.tahunDipilih = Number(tahun);
  if (role === 'UMKM') {
    const resU = await panggilAPI('getDashboardUMKM', [null, Number(tahun)]);
    if (AppState.currentSection !== sec) return;
    if (!resU.success) { wadah.innerHTML = areaGagal('Gagal memuat dashboard.', 'loadDashboard()'); return; }
    renderDashboardUMKM(resU.data);
    return;
  }
  const res = await panggilAPI('getDashboardOrganisasi', [Number(tahun)]);
  if (AppState.currentSection !== sec) return;
  if (!res.success) { wadah.innerHTML = areaGagal('Gagal memuat dashboard.', 'loadDashboard()'); return; }
  AppState.cache.dashboardOrganisasi = res.data;
  renderDashboardOrganisasi(res.data, role);
}

function renderDashboardOrganisasi(d, role) {
  const isAdmin = role === 'Admin';
  const wadah = document.getElementById('app-container');
  if (!d) { wadah.innerHTML = areaGagal('Data dashboard kosong.', 'loadDashboard()'); return; }

  const persenFasilitasi = d.targetFasilitasi ? Math.min(100, Math.round(d.totalFasilitasi / d.targetFasilitasi * 100)) : 0;
  const rataPendapatan = d.totalUMKM ? (d.totalOmset / d.totalUMKM / 12) : 0;
  const rataTenagaKerja = d.totalUMKM ? Math.round(d.totalTenagaKerja / d.totalUMKM) : 0;

  const filterTahun = filterTahunDashboard(d);

  wadah.innerHTML =
    pageHeader('Ringkasan Program', 'Dashboard', 'Utama',
      'Ikhtisar perkembangan seluruh UMKM binaan PPU UT Cakung — data kumulatif (YTD) sesuai tahun yang dipilih.',
      filterTahun) +

    '<div class="grid grid-4 mb-4">' +
      '<div class="kpi-card c-red">' +
        '<div class="kpi-top"><span class="kpi-label">Total UMKM</span><span class="kpi-icon"><i class="bi bi-building"></i></span></div>' +
        '<div class="kpi-value">' + d.totalUMKM + '</div>' +
        '<div class="kpi-meta">Kuliner: ' + d.perSektor.Kuliner + ' | Kerajinan: ' + d.perSektor.Kerajinan + ' | Pertanian: ' + d.perSektor.Pertanian + ' | Manufaktur: ' + d.perSektor.Manufaktur + '</div>' +
      '</div>' +
      '<div class="kpi-card c-blue">' +
        '<div class="kpi-top"><span class="kpi-label">Total Omset (YTD)</span><span class="kpi-icon"><i class="bi bi-cash-stack"></i></span></div>' +
        '<div class="kpi-value">' + formatRupiah(d.totalOmset) + '</div>' +
        '<div class="kpi-meta">Rata-rata Pendapatan UMKM &nbsp; <b>' + formatRupiah(rataPendapatan) + '/bln</b></div>' +
      '</div>' +
      '<div class="kpi-card c-purple">' +
        '<div class="kpi-top"><span class="kpi-label">Tenaga Kerja Terserap</span><span class="kpi-icon"><i class="bi bi-people-fill"></i></span></div>' +
        '<div class="kpi-value">' + d.totalTenagaKerja + ' <span class="unit">orang</span></div>' +
        '<div class="kpi-meta">Rerata &nbsp; <b>' + rataTenagaKerja + ' org/UMKM</b></div>' +
      '</div>' +
      '<div class="kpi-card c-green">' +
        '<div class="kpi-top"><span class="kpi-label">Fasilitasi Pemasaran</span><span class="kpi-icon"><i class="bi bi-megaphone-fill"></i></span></div>' +
        '<div class="kpi-value">' + formatRupiah(d.totalFasilitasi) + '</div>' +
        '<div class="kpi-meta">Target: <b>' + formatRupiah(d.targetFasilitasi) + '</b> (' + persenFasilitasi + '%)</div>' +
      '</div>' +
    '</div>' +

    // Dua grafik bersebelahan: Omset dan Tenaga Kerja
    '<div class="grid grid-2 mb-4">' +
      '<div class="panel">' +
        '<div class="panel-title">Tren Omset Bulanan</div>' +
        '<div class="panel-sub">Akumulasi omset UMKM binaan per bulan</div>' +
        '<div style="height:260px;margin-top:12px;"><canvas id="chartOmset"></canvas></div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title">Perkembangan Tenaga Kerja</div>' +
        '<div class="panel-sub">Jumlah tenaga kerja terserap per bulan</div>' +
        '<div style="height:260px;margin-top:12px;"><canvas id="chartTenagaKerja"></canvas></div>' +
      '</div>' +
    '</div>' +

    // Distribusi kelas kemandirian — melebar penuh di bawah kedua grafik
    '<div class="panel mb-4">' +
      '<div class="flex-between" style="flex-wrap:wrap;gap:8px;">' +
        '<div><div class="panel-title mb-0">Distribusi Kelas Kemandirian</div>' +
        '<div class="panel-sub mb-0">' + d.totalUMKMDenganKelas + ' UMKM telah diasesmen — bersumber dari tab Asesmen Kemandirian</div></div>' +
      '</div>' +
      '<div class="grid grid-4 mt-3">' +
        TIER_LIST.map(function (t) {
          const jml = d.distribusiKelas[t] || 0;
          const persen = d.totalUMKMDenganKelas ? Math.round(jml / d.totalUMKMDenganKelas * 100) : 0;
          return '<div style="padding:12px;background:var(--canvas);border-radius:10px;">' +
            '<div class="d-flex flex-between" style="font-size:12.5px;margin-bottom:6px;">' +
              '<span class="tier-name"><span class="dot dot-' + tierClass(t) + '"></span>' + esc(t) + '</span>' +
              '<b>' + jml + '</b></div>' +
            '<div class="progress-track"><div class="progress-fill tier-' + tierClass(t) + '" style="width:' + persen + '%;"></div></div>' +
            '<div class="text-muted mt-2" style="font-size:11px;">' + persen + '% dari total</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>' +

    '<div class="grid grid-2">' +
      '<div class="panel">' +
        '<div class="flex-between mb-3">' +
          '<div><div class="panel-title mb-0">Catatan Prestasi UMKM</div>' +
          '<div class="panel-sub mb-0">5 UMKM dengan prestasi terbanyak</div></div>' +
        '</div>' +
        (d.prestasiTerbaru && d.prestasiTerbaru.length
          ? d.prestasiTerbaru.map(function (p, i) {
              return '<div class="prestasi-item"><div class="p-icon"><i class="bi bi-star-fill"></i></div>' +
                '<div class="d-flex flex-between" style="flex:1;align-items:center;">' +
                '<div class="p-title">' + (i + 1) + '. ' + esc(p.NamaUMKM) + '</div>' +
                '<span class="sector-tag">' + p.jumlah + ' penghargaan</span></div></div>';
            }).join('')
          : '<div class="table-empty"><i class="bi bi-inbox"></i>Belum ada catatan prestasi.</div>') +
        '<a onclick="navigateTo(\'' + (isAdmin ? 'prestasi' : 'performaTerbaik') + '\')" style="font-size:12.5px;cursor:pointer;display:block;text-align:center;margin-top:12px;">Buka Catatan Prestasi Lengkap <i class="bi bi-arrow-right"></i></a>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title">' + (isAdmin ? 'File Laporan CSR (PDF)' : 'Akses File Laporan PPU') + '</div>' +
        '<div class="panel-sub">Laporan terbaru yang tersedia</div>' +
        '<div class="mt-3">' +
          (d.laporanTerbaru && d.laporanTerbaru.length
            ? d.laporanTerbaru.map(function (l) {
                return '<div class="d-flex flex-between" style="padding:9px 0;border-bottom:1px solid var(--border-color);">' +
                  '<div><div style="font-size:13px;font-weight:600;">' + esc(l.NamaFile) + '</div>' +
                  '<div class="text-muted" style="font-size:11px;">' + esc(l.Bulan) + ' ' + esc(l.Tahun) + ' &middot; ' + esc(l.Status) + '</div></div>' +
                  '<a href="' + esc(l.FileURL) + '" target="_blank" class="action-icon-btn primary"><i class="bi bi-box-arrow-up-right"></i></a></div>';
              }).join('')
            : '<div class="table-empty"><i class="bi bi-inbox"></i>Belum ada laporan.</div>') +
        '</div>' +
        '<a onclick="navigateTo(\'fileLaporan\')" style="font-size:12.5px;cursor:pointer;display:block;text-align:center;margin-top:12px;">Lihat Semua Laporan <i class="bi bi-arrow-right"></i></a>' +
      '</div>' +
    '</div>' +

    widgetLegalitasOrganisasi(d);

  gambarChartOmset(d);
  gambarChartTenagaKerja(d);
}

/** Grafik batang perkembangan tenaga kerja per bulan. */
function gambarChartTenagaKerja(d) {
  const kanvas = document.getElementById('chartTenagaKerja');
  if (!kanvas || typeof Chart === 'undefined') return;
  try {
    new Chart(kanvas, {
      type: 'bar',
      data: {
        labels: d.bulanLabel || BULAN_LIST,
        datasets: [{
          label: 'Tenaga Kerja',
          data: d.tenagaKerjaPerBulan || [],
          backgroundColor: 'rgba(124,58,237,0.75)',
          borderRadius: 4,
          maxBarThickness: 28
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.parsed.y + ' orang'; } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  } catch (e) { console.warn('Grafik tenaga kerja gagal digambar:', e); }
}

function gambarChartOmset(d) {
  const kanvas = document.getElementById('chartOmset');
  if (!kanvas || typeof Chart === 'undefined') return;
  try {
    new Chart(kanvas, {
      type: 'line',
      data: {
        labels: d.bulanLabel || BULAN_LIST,
        datasets: [{
          label: 'Omset',
          data: d.omsetPerBulan || [],
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2,132,199,0.12)',
          fill: true, tension: 0.35, borderWidth: 2,
          pointRadius: 3, pointBackgroundColor: '#0284C7'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function (v) { return formatRupiah(v); }, font: { size: 10 } } },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  } catch (e) { console.warn('Chart gagal digambar:', e); }
}

// ── Dashboard khusus UMKM ──

function renderDashboardUMKM(d) {
  const wadah = document.getElementById('app-container');
  if (!d) { wadah.innerHTML = areaGagal('Data dashboard kosong.', 'loadDashboard()'); return; }

  const persenTarget = d.target ? Math.min(100, Math.round(d.totalRealisasi / d.target * 100)) : 0;
  const cls = d.kelas ? tierClass(d.kelas.Kelas) : 'madya';
  const legal = d.legalitas || [];

  wadah.innerHTML =
    pageHeader('Ringkasan Usaha Saya', 'Dashboard', 'Bisnis UMKM Saya',
      'Pantau realisasi omset, penyerapan tenaga kerja, status legalitas, dan kelas kemandirian usaha Anda.',
      filterTahunDashboard(d)) +


    // ── Baris 1: tiga widget ringkas & sejajar ──
    '<div class="grid grid-3 mb-4">' +
      widgetKemandirianRingkas(d, cls) +
      widgetRealisasiOmset(d, persenTarget) +
      widgetStatusLegalitas(legal) +
    '</div>' +

    // ── Baris 2: dua grafik bersebelahan ──
    '<div class="grid grid-2 mb-4">' +
      '<div class="panel">' +
        '<div class="panel-title">Tren Omset Bulanan</div>' +
        '<div class="panel-sub">Realisasi omset usaha Anda per bulan</div>' +
        '<div style="height:250px;margin-top:12px;"><canvas id="chartOmset"></canvas></div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title">Perkembangan Tenaga Kerja</div>' +
        '<div class="panel-sub">Jumlah tenaga kerja usaha Anda per bulan</div>' +
        '<div style="height:250px;margin-top:12px;"><canvas id="chartTenagaKerja"></canvas></div>' +
        '<div class="d-flex flex-between mt-2" style="font-size:12px;">' +
          '<span class="text-muted">Data bulan terakhir</span>' +
          '<b>' + d.tenagaKerjaTerbaru + ' orang</b>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── Baris 3: catatan hasil asesmen ──
    blokCatatanAsesmen(d.kelas) +

    // ── Baris 4: prestasi & fasilitasi ──
    '<div class="grid grid-2">' +
      '<div class="panel">' +
        '<div class="panel-title">Prestasi Usaha Saya</div>' +
        (d.prestasi && d.prestasi.length
          ? d.prestasi.slice(0, 5).map(function (p) {
              return '<div class="prestasi-item"><div class="p-icon"><i class="bi bi-star-fill"></i></div><div>' +
                '<div class="p-title">' + esc(p.KategoriPrestasi) + '</div>' +
                '<div class="p-desc">' + esc(p.DeskripsiPrestasi) + '</div>' +
                '<div class="p-meta"><span><i class="bi bi-calendar3"></i> ' + esc(p.Bulan) + ' ' + esc(p.Tahun) + '</span></div></div></div>';
            }).join('')
          : '<div class="table-empty"><i class="bi bi-inbox"></i>Belum ada catatan prestasi.</div>') +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title">Fasilitasi Pemasaran Diterima</div>' +
        (d.fasilitasi && d.fasilitasi.length
          ? d.fasilitasi.slice(0, 5).map(function (f) {
              return '<div class="d-flex flex-between" style="padding:9px 0;border-bottom:1px solid var(--border-color);">' +
                '<div><div style="font-size:13px;font-weight:600;">' + esc(f.NamaCustomer || f.DeskripsiKegiatan) + '</div>' +
                '<div class="text-muted" style="font-size:11px;">' + formatTgl(f.TanggalFasilitasi) + '</div></div>' +
                '<b style="font-size:13px;">' + formatRupiahFull(f.NominalRupiah) + '</b></div>';
            }).join('')
          : '<div class="table-empty"><i class="bi bi-inbox"></i>Belum ada fasilitasi tercatat.</div>') +
        '<a onclick="navigateTo(\'fasilitasiSaya\')" style="font-size:12.5px;cursor:pointer;display:block;text-align:center;margin-top:12px;">Lihat Semua <i class="bi bi-arrow-right"></i></a>' +
      '</div>' +
    '</div>';

  gambarChartOmset({ bulanLabel: d.bulanLabel, omsetPerBulan: d.omsetBulanan });
  gambarChartTenagaKerja({ bulanLabel: d.bulanLabel, tenagaKerjaPerBulan: d.tkPerBulan || [] });
}

/** Widget status kemandirian — ringkas, tiap pilar satu baris. */
function widgetKemandirianRingkas(d, cls) {
  if (!d.kelas) {
    return '<div class="panel tier-panel tier-' + cls + ' tier-panel-ringkas">' +
      '<span style="font-size:11px;text-transform:uppercase;font-weight:700;opacity:.8;">Status Kemandirian Usaha</span>' +
      '<div class="tier-nama">Belum Dinilai</div>' +
      '<div class="text-muted mt-2" style="font-size:11.5px;">Asesmen akan dilakukan oleh pendamping PPU UT Cakung.</div>' +
    '</div>';
  }
  const k = d.kelas;
  return '<div class="panel tier-panel tier-' + cls + ' tier-panel-ringkas" style="display:flex;flex-direction:column;">' +
    '<div class="d-flex flex-between align-center">' +
      '<span style="font-size:11px;text-transform:uppercase;font-weight:700;opacity:.8;">Status Kemandirian</span>' +
      '<span class="lvl-badge">Skor ' + k.RataRata + '</span>' +
    '</div>' +
    '<div class="tier-nama">' + esc(k.Kelas) + '</div>' +
    '<div class="pilar-list">' +
      '<div class="pilar-baris"><span class="pilar-label">Produksi</span><span class="pilar-nilai">' + k.SkorProduksi + '</span></div>' +
      '<div class="pilar-baris"><span class="pilar-label">Pemasaran</span><span class="pilar-nilai">' + k.SkorPemasaran + '</span></div>' +
      '<div class="pilar-baris"><span class="pilar-label">Keuangan</span><span class="pilar-nilai">' + k.SkorKeuangan + '</span></div>' +
    '</div>' +
    '<div style="font-size:10.5px;opacity:.75;margin-top:auto;padding-top:10px;"><i class="bi bi-calendar3"></i> Dinilai ' + formatBulanTahun(k.TanggalAsesmen) + '</div>' +
  '</div>';
}

/** Widget realisasi omset — ringkas dan proporsional. */
function widgetRealisasiOmset(d, persen) {
  // Tata letak memakai flex-column agar baris terakhir (target + status)
  // menempel di DASAR kartu — sejajar dengan baris "Dinilai" pada widget
  // Status Kemandirian di sebelahnya, walau isi tengahnya berbeda tinggi.
  return '<div class="panel tier-panel-ringkas" style="display:flex;flex-direction:column;">' +
    '<span class="text-muted" style="font-size:11px;text-transform:uppercase;font-weight:700;">Realisasi Omset</span>' +

    '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:6px 0;">' +
      '<div style="font-size:26px;font-weight:800;line-height:1.15;letter-spacing:-0.5px;">' +
        formatRupiahFull(d.totalRealisasi) + '</div>' +
      '<div class="d-flex flex-between align-center" style="margin-top:10px;">' +
        '<div class="progress-track" style="flex:1;margin-right:10px;">' +
          '<div class="progress-fill" style="width:' + persen + '%;background:var(--primary);"></div></div>' +
        '<b style="font-size:13px;white-space:nowrap;">' + persen + '%</b>' +
      '</div>' +
    '</div>' +

    '<div class="d-flex flex-between align-center" style="gap:8px;flex-wrap:wrap;">' +
      '<span class="text-muted" style="font-size:10.5px;">dari target ' + formatRupiahFull(d.target) + '</span>' +
      '<span class="status-pill ' + (d.statusTarget === 'Tercapai' ? 'allowed' : 'blocked') + '" style="font-size:10.5px;">' +
        '<span class="dot"></span>' + esc(d.statusTarget) + '</span>' +
    '</div>' +
  '</div>';
}

/** Widget status legalitas — ringkasan jumlah + daftar yang perlu perhatian. */
function widgetStatusLegalitas(legal) {
  const aktif    = legal.filter(function (l) { return l.Status === 'Aktif'; }).length;
  const perbarui = legal.filter(function (l) { return l.Status === 'Perlu Diperbarui'; }).length;
  const lewat    = legal.filter(function (l) { return l.Status === 'Kadaluarsa'; }).length;

  // Tampilkan yang paling mendesak lebih dulu: kadaluarsa, lalu perlu diperbarui
  const perluPerhatian = legal
    .filter(function (l) { return l.Status !== 'Aktif'; })
    .sort(function (a, b) { return (a.SisaHari === null ? 9999 : a.SisaHari) - (b.SisaHari === null ? 9999 : b.SisaHari); })
    .slice(0, 3);

  let isi;
  if (!legal.length) {
    isi = '<div class="text-muted" style="font-size:12px;margin-top:12px;">' +
      'Belum ada data legalitas yang tercatat. Hubungi pendamping PPU untuk mendaftarkan legalitas usaha Anda.</div>';
  } else if (!perluPerhatian.length) {
    isi = '<div style="font-size:12.5px;margin-top:12px;color:var(--pramandiri-text);">' +
      '<i class="bi bi-check-circle-fill"></i> Seluruh legalitas usaha Anda dalam keadaan aktif.</div>';
  } else {
    isi = '<div style="margin-top:10px;">' + perluPerhatian.map(function (l) {
      const warna = l.Status === 'Kadaluarsa' ? 'var(--pemula-text)' : 'var(--madya-text)';
      const ket = l.Status === 'Kadaluarsa'
        ? 'Kadaluarsa ' + formatTgl(l.TanggalKadaluarsa)
        : 'Berlaku sampai ' + formatTgl(l.TanggalKadaluarsa) +
          (l.SisaHari !== null ? ' (' + l.SisaHari + ' hari lagi)' : '');
      return '<div class="legal-item">' +
        '<div><div class="legal-nama">' + esc(l.JenisLegalitas) + '</div>' +
        '<div class="legal-sub">' + esc(ket) + '</div></div>' +
        '<i class="bi bi-exclamation-triangle-fill" style="color:' + warna + ';"></i></div>';
    }).join('') + '</div>';
  }

  return '<div class="panel tier-panel-ringkas">' +
    '<span class="text-muted" style="font-size:11px;text-transform:uppercase;font-weight:700;">Status Legalitas</span>' +
    '<div class="legal-ringkas">' +
      '<div class="legal-kotak legal-aktif"><div class="angka">' + aktif + '</div><div class="label">Aktif</div></div>' +
      '<div class="legal-kotak legal-perbarui"><div class="angka">' + perbarui + '</div><div class="label">Perbarui</div></div>' +
      '<div class="legal-kotak legal-lewat"><div class="angka">' + lewat + '</div><div class="label">Lewat</div></div>' +
    '</div>' + isi +
    '<a onclick="navigateTo(\'legalitasSaya\')" style="font-size:12px;cursor:pointer;display:block;text-align:center;margin-top:10px;">Lihat Detail Legalitas <i class="bi bi-arrow-right"></i></a>' +
  '</div>';
}

/** Blok catatan hasil asesmen dari pendamping. */
function blokCatatanAsesmen(k) {
  if (!k) return '';
  const punyaCatatan = k.CatatanProduksi || k.CatatanPemasaran || k.CatatanKeuangan || k.SaranProgram;
  if (!punyaCatatan) return '';

  function baris(judul, isi) {
    if (!isi) return '';
    return '<div class="catatan-asesmen"><div class="ca-judul">' + judul + '</div>' +
      '<div class="ca-isi">' + esc(isi) + '</div></div>';
  }

  return '<div class="panel mb-4">' +
    '<div class="panel-title">Catatan Hasil Asesmen</div>' +
    '<div class="panel-sub">Masukan dari pendamping berdasarkan asesmen ' + formatBulanTahun(k.TanggalAsesmen) + '</div>' +
    '<div class="grid grid-2 mt-3">' +
      '<div>' +
        baris('Pilar Produksi', k.CatatanProduksi) +
        baris('Pilar Pemasaran', k.CatatanPemasaran) +
        baris('Pilar Keuangan', k.CatatanKeuangan) +
      '</div>' +
      '<div>' +
        baris('Rekomendasi Program yang Perlu Diikuti', k.SaranProgram) +
      '</div>' +
    '</div>' +
    '<div class="d-flex align-center gap-2 mt-2" style="font-size:12px;color:var(--text-muted);border-top:1px solid var(--border-color);padding-top:10px;">' +
      '<i class="bi bi-person-badge"></i> Asesor: <b style="color:var(--text-primary);">' + esc(k.Asesor || 'Tidak dicantumkan') + '</b>' +
    '</div>' +
  '</div>';
}


/** Pemilih Tahun Data — dipakai bersama oleh dashboard Admin, CSR UT, dan UMKM. */
function filterTahunDashboard(d) {
  const daftar = (d.daftarTahun && d.daftarTahun.length) ? d.daftarTahun : [d.tahun];
  return '<div class="d-flex gap-2 align-center">' +
    '<label class="form-label mb-0" style="white-space:nowrap;">Tahun Data</label>' +
    '<select class="form-select" style="width:auto;height:34px;" onchange="gantiTahunDashboard(this.value)">' +
      daftar.map(function (t) {
        return '<option value="' + t + '"' + (Number(t) === Number(d.tahun) ? ' selected' : '') + '>' + t + '</option>';
      }).join('') +
    '</select></div>';
}




/**
 * Ringkasan legalitas seluruh UMKM aktif.
 *
 * Tiga status dihitung dengan aturan yang sama persis seperti di halaman
 * Legalitas, jadi angkanya selalu sejalan. Ditambah satu angka keempat:
 * UMKM yang belum punya catatan legalitas sama sekali — kelompok ini
 * tidak muncul di ketiga status, padahal justru paling perlu ditindak.
 */
function widgetLegalitasOrganisasi(d) {
  const L = d.legalitas || { Aktif: 0, 'Perlu Diperbarui': 0, Kadaluarsa: 0 };
  const perluPerhatian = (L['Perlu Diperbarui'] || 0) + (L.Kadaluarsa || 0);

  const kartu = function (judul, angka, ikon, warnaBg, warnaTeks, keterangan) {
    return '<div style="flex:1;min-width:150px;background:' + warnaBg + ';border-radius:10px;padding:14px 16px;">' +
      '<div style="font-size:11.5px;color:' + warnaTeks + ';font-weight:600;display:flex;align-items:center;gap:6px;">' +
        '<i class="bi ' + ikon + '"></i> ' + judul + '</div>' +
      '<div style="font-size:26px;font-weight:700;color:' + warnaTeks + ';line-height:1.2;margin-top:4px;">' + angka + '</div>' +
      '<div style="font-size:11px;color:' + warnaTeks + ';opacity:.85;">' + keterangan + '</div>' +
    '</div>';
  };

  return '<div class="panel mt-4">' +
    '<div class="d-flex flex-between align-center" style="flex-wrap:wrap;gap:8px;">' +
      '<div>' +
        '<div class="panel-title mb-0">Informasi Legalitas UMKM</div>' +
        '<div class="panel-sub">' + (d.totalLegalitas || 0) + ' dokumen legalitas dari UMKM aktif</div>' +
      '</div>' +
      (perluPerhatian > 0
        ? '<span class="status-pill blocked"><span class="dot"></span>' + perluPerhatian + ' perlu ditindak</span>'
        : '<span class="status-pill allowed"><span class="dot"></span>Semua terkendali</span>') +
    '</div>' +
    '<div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;">' +
      kartu('Aktif', L.Aktif || 0, 'bi-patch-check-fill',
            'var(--pramandiri-bg)', 'var(--pramandiri-text)', 'Masa berlaku masih panjang') +
      kartu('Perlu Diperbarui', L['Perlu Diperbarui'] || 0, 'bi-exclamation-triangle-fill',
            'var(--madya-bg)', 'var(--madya-text)', 'Berakhir dalam 1 tahun') +
      kartu('Kadaluarsa', L.Kadaluarsa || 0, 'bi-x-octagon-fill',
            'var(--pemula-bg)', 'var(--pemula-text)', 'Sudah lewat masa berlaku') +
      kartu('Belum Ada Data', d.umkmTanpaLegalitas || 0, 'bi-dash-circle',
            'var(--canvas)', 'var(--text-muted)', 'UMKM tanpa catatan legalitas') +
    '</div>' +
    '<a onclick="navigateTo(\'legalitas\')" style="font-size:12.5px;cursor:pointer;display:block;text-align:center;margin-top:14px;">' +
      'Buka Legalitas UMKM <i class="bi bi-arrow-right"></i></a>' +
  '</div>';
}
