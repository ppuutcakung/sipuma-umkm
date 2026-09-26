// ════════════════════════════════════════════════════════
// DASHBOARD — Admin / CSR UT / UMKM
// ════════════════════════════════════════════════════════

async function loadDashboard() {
  const role = AppState.session.role;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML = areaMemuat();
  const sec = AppState.currentSection;

  if (role === 'UMKM') {
    const res = await panggilAPI('getDashboardUMKM', []);
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

function renderDashboardOrganisasi(d, role) {
  const isAdmin = role === 'Admin';
  const wadah = document.getElementById('app-container');
  if (!d) { wadah.innerHTML = areaGagal('Data dashboard kosong.', 'loadDashboard()'); return; }

  const persenFasilitasi = d.targetFasilitasi ? Math.min(100, Math.round(d.totalFasilitasi / d.targetFasilitasi * 100)) : 0;
  const rataPendapatan = d.totalUMKM ? (d.totalOmset / d.totalUMKM / 12) : 0;
  const rataTenagaKerja = d.totalUMKM ? Math.round(d.totalTenagaKerja / d.totalUMKM) : 0;

  wadah.innerHTML =
    pageHeader('Ringkasan Program', isAdmin ? 'Dashboard' : 'Dashboard', 'Utama',
      'Ikhtisar perkembangan seluruh UMKM binaan PPU UT Cakung tahun ' + d.tahun + '.', '') +

    '<div class="grid grid-4 mb-4">' +
      '<div class="kpi-card c-red">' +
        '<div class="kpi-top"><span class="kpi-label">Total UMKM</span><span class="kpi-icon"><i class="bi bi-building"></i></span></div>' +
        '<div class="kpi-value">' + d.totalUMKM + '</div>' +
        '<div class="kpi-meta">Kuliner: ' + d.perSektor.Kuliner + ' | Kerajinan: ' + d.perSektor.Kerajinan + ' | Pertanian: ' + d.perSektor.Pertanian + ' | Manufaktur: ' + d.perSektor.Manufaktur + '</div>' +
      '</div>' +
      '<div class="kpi-card c-blue">' +
        '<div class="kpi-top"><span class="kpi-label">Total Omset (' + d.tahun + ' YTD)</span><span class="kpi-icon"><i class="bi bi-cash-stack"></i></span></div>' +
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
        '<div class="kpi-meta">Target ' + d.tahun + ': <b>' + formatRupiah(d.targetFasilitasi) + '</b> (' + persenFasilitasi + '%)</div>' +
      '</div>' +
    '</div>' +

    '<div class="grid grid-2-1 mb-4">' +
      '<div class="panel">' +
        '<div class="panel-title">Tren Omset Bulanan ' + d.tahun + '</div>' +
        '<div class="panel-sub">Akumulasi omset UMKM binaan per bulan</div>' +
        '<div style="height:260px;margin-top:12px;"><canvas id="chartOmset"></canvas></div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title">Distribusi Kelas Kemandirian</div>' +
        '<div class="panel-sub">' + d.totalUMKMDenganKelas + ' UMKM telah diasesmen</div>' +
        '<div class="mt-3">' +
          TIER_LIST.map(function (t) {
            const jml = d.distribusiKelas[t] || 0;
            const persen = d.totalUMKMDenganKelas ? Math.round(jml / d.totalUMKMDenganKelas * 100) : 0;
            return '<div class="mb-3">' +
              '<div class="d-flex flex-between" style="font-size:12.5px;margin-bottom:4px;">' +
                '<span class="tier-name"><span class="dot dot-' + tierClass(t) + '"></span>' + t + '</span>' +
                '<b>' + jml + ' UMKM</b></div>' +
              '<div class="progress-track"><div class="progress-fill tier-' + tierClass(t) + '" style="width:' + persen + '%;"></div></div>' +
            '</div>';
          }).join('') +
        '</div>' +
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
    '</div>';

  gambarChartOmset(d);
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

  wadah.innerHTML =
    pageHeader('Ringkasan Usaha Saya', 'Dashboard', 'Bisnis UMKM Saya',
      'Pantau realisasi omset bulanan terhadap target tahunan, data penyerapan tenaga kerja, dan evaluasi kelas kemandirian bisnis Anda.', '') +

    '<div class="grid grid-2 mb-4">' +
      '<div class="panel tier-panel tier-' + cls + '">' +
        '<span style="font-size:11px;text-transform:uppercase;font-weight:700;opacity:.8;">Status Kemandirian Usaha</span>' +
        '<div style="font-size:22px;font-weight:700;margin-top:6px;">' + (d.kelas ? esc(d.kelas.Kelas) : 'Belum Dinilai') +
          (d.kelas ? ' <span class="lvl-badge">Skor ' + d.kelas.RataRata + '</span>' : '') + '</div>' +
        (d.kelas ? '<div class="pilar-row"><span>Produksi ' + d.kelas.SkorProduksi + '</span><span>Pemasaran ' + d.kelas.SkorPemasaran + '</span><span>Keuangan ' + d.kelas.SkorKeuangan + '</span></div>' : '') +
        (d.kelas ? '<div class="text-muted" style="font-size:11px;margin-top:6px;"><i class="bi bi-calendar3"></i> Dinilai: ' + formatBulanTahun(d.kelas.TanggalAsesmen) + '</div>' : '') +
      '</div>' +
      '<div class="panel">' +
        '<span class="text-muted" style="font-size:11px;text-transform:uppercase;font-weight:700;">Realisasi Omset ' + d.tahun + '</span>' +
        '<div style="font-size:24px;font-weight:700;margin-top:6px;">' + formatRupiahFull(d.totalRealisasi) + '</div>' +
        '<div class="text-muted" style="font-size:12px;">Target: ' + formatRupiahFull(d.target) + ' &middot; <b>' + persenTarget + '%</b></div>' +
        '<div class="progress-track mt-2"><div class="progress-fill" style="width:' + persenTarget + '%;background:var(--primary);"></div></div>' +
        '<div class="mt-2"><span class="status-pill ' + (d.statusTarget === 'Tercapai' ? 'allowed' : 'blocked') + '"><span class="dot"></span>' + esc(d.statusTarget) + '</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="grid grid-2-1 mb-4">' +
      '<div class="panel">' +
        '<div class="panel-title">Tren Omset Bulanan ' + d.tahun + '</div>' +
        '<div style="height:240px;margin-top:12px;"><canvas id="chartOmset"></canvas></div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title">Tenaga Kerja</div>' +
        '<div style="font-size:30px;font-weight:700;">' + d.tenagaKerjaTerbaru + ' <span style="font-size:14px;font-weight:500;" class="text-muted">orang</span></div>' +
        '<div class="text-muted" style="font-size:12px;">Data bulan terakhir yang Anda input</div>' +
        '<a class="btn btn-outline btn-block mt-3" onclick="navigateTo(\'updateTenagaKerja\')"><i class="bi bi-pencil"></i> Perbarui Data</a>' +
      '</div>' +
    '</div>' +

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
}
