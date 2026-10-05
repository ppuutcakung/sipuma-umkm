// ════════════════════════════════════════════════════════
// MODUL EKSPOR — Excel (.xls) & PDF
// ════════════════════════════════════════════════════════
// Seluruh proses dilakukan di browser, tanpa memanggil server, sehingga
// ekspor terasa seketika dan tidak menambah beban Apps Script.
//
// Susunan kepala dokumen (sesuai kesepakatan):
//   Baris 1 : Judul sesuai tab            (tengah)
//   Baris 2 : PPU UT Cakung               (tengah)
//   Baris 3 : Periode Download: <tanggal> (tengah)

/** Tanggal & jam unduh dalam bahasa Indonesia. */
function waktuUnduhSekarang() {
  const d = new Date();
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' pukul ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function namaBerkasEkspor(judul, ext) {
  const d = new Date();
  const stempel = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return judul.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') + '-' + stempel + '.' + ext;
}

/**
 * Bangun tabel HTML lengkap dengan kepala dokumen.
 * Dipakai bersama oleh ekspor Excel dan PDF agar hasilnya konsisten.
 *
 * @param {string}   judul    judul dokumen
 * @param {string[]} kolom    nama-nama kolom
 * @param {Array[]}  baris    isi tabel (array per baris)
 * @param {number[]} lebar    lebar tiap kolom dalam karakter (untuk Excel)
 * @param {string}   subJudul keterangan tambahan (opsional, mis. filter aktif)
 */
function bangunTabelEkspor(judul, kolom, baris, lebar, subJudul) {
  const jml = kolom.length;
  lebar = lebar || kolom.map(function () { return 18; });

  let html = '<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">';

  // ── Kepala dokumen: tiga baris, semuanya di tengah ──
  html += '<tr><td colspan="' + jml + '" style="text-align:center;font-size:15pt;font-weight:bold;border:none;padding:10px 6px 2px;">' +
    escEks(judul) + '</td></tr>';
  // Nama organisasi mengikuti CABANG yang sedang dilihat, bukan ditulis
  // tetap di dalam kode. Sebelumnya selalu "PPU UT Cakung" — keliru
  // begitu ada cabang kedua, karena berkasnya jadi salah identitas.
  const organisasi = (typeof namaOrganisasi === 'function') ? namaOrganisasi() : 'PPU UT Cakung';
  html += '<tr><td colspan="' + jml + '" style="text-align:center;font-size:12pt;font-weight:bold;border:none;padding:2px 6px;">' +
    escEks(organisasi) + '</td></tr>';
  html += '<tr><td colspan="' + jml + '" style="text-align:center;font-size:10pt;border:none;padding:2px 6px 10px;">' +
    'Periode Download: ' + escEks(waktuUnduhSekarang()) + '</td></tr>';
  if (subJudul) {
    // Keterangan boleh lebih dari satu baris — ringkasan per sektor
    // ditaruh di baris sendiri agar tidak berdesakan dengan baris utama.
    const barisKet = String(subJudul).split('\n');
    html += '<tr><td colspan="' + jml + '" style="text-align:center;font-size:10pt;border:none;padding:0 6px 10px;">' +
      barisKet.map(function (b, i) {
        return i === 0
          ? '<i>' + escEks(b) + '</i>'
          : '<div style="font-size:9pt;margin-top:3px;font-family:Consolas,\'Courier New\',monospace;' +
              'white-space:pre;">' + escEks(b) + '</div>';
      }).join('') +
      '</td></tr>';
  }
  html += '<tr><td colspan="' + jml + '" style="border:none;height:6px;"></td></tr>';

  // ── Baris judul kolom ──
  html += '<tr>';
  kolom.forEach(function (k, i) {
    html += '<th style="background:#0284C7;color:#fff;font-weight:bold;text-align:center;' +
      'border:1px solid #0369A1;padding:8px 6px;width:' + (lebar[i] * 8) + 'px;">' + escEks(k) + '</th>';
  });
  html += '</tr>';

  // ── Isi tabel ──
  if (!baris.length) {
    html += '<tr><td colspan="' + jml + '" style="text-align:center;padding:14px;border:1px solid #CBD5E1;color:#64748B;">' +
      'Tidak ada data untuk ditampilkan.</td></tr>';
  } else {
    baris.forEach(function (r, idx) {
      const latar = idx % 2 ? '#F8FAFC' : '#FFFFFF';
      html += '<tr style="background:' + latar + ';">';
      r.forEach(function (sel) {
        // Sel boleh berupa objek { teks, warna, tebal } untuk penandaan
        // khusus — misalnya status "Tidak Aktif" yang perlu merah.
        const objek = sel && typeof sel === 'object' && sel.teks !== undefined;
        const isi = objek ? sel.teks : sel;
        const angka = typeof isi === 'number';
        const gaya = objek
          ? (sel.warna ? 'color:' + sel.warna + ';' : '') + (sel.tebal ? 'font-weight:bold;' : '')
          : '';
        html += '<td style="border:1px solid #CBD5E1;padding:6px;vertical-align:top;' +
          'text-align:' + (angka ? 'right' : 'left') + ';mso-number-format:\\@;' + gaya + '">' +
          escEks(isi === null || isi === undefined ? '' : isi) + '</td>';
      });
      html += '</tr>';
    });
  }

  html += '</table>';
  return html;
}

function escEks(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ════════════════════════════════════════════════════════
// EKSPOR EXCEL
// ════════════════════════════════════════════════════════
function eksporExcel(judul, kolom, baris, lebar, subJudul) {
  try {
    const tabel = bangunTabelEkspor(judul, kolom, baris, lebar, subJudul);
    // Format Excel-XML sederhana: dikenali Excel, WPS, maupun LibreOffice.
    const isi =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="UTF-8">' +
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>' + escEks(judul.substring(0, 30)) + '</x:Name>' +
      '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
      '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
      '</head><body>' + tabel + '</body></html>';

    unduhBerkas(isi, namaBerkasEkspor(judul, 'xls'), 'application/vnd.ms-excel');
    showToast('Berhasil', 'Berkas Excel berhasil diunduh.', 'success');
  } catch (e) {
    console.error('Ekspor Excel gagal:', e);
    showToast('Gagal', 'Tidak dapat membuat berkas Excel.', 'danger');
  }
}

// ════════════════════════════════════════════════════════
// EKSPOR PDF (lewat jendela cetak bawaan browser)
// ════════════════════════════════════════════════════════
function eksporPDF(judul, kolom, baris, lebar, subJudul) {
  try {
    const tabel = bangunTabelEkspor(judul, kolom, baris, lebar, subJudul);
    // Kolom banyak → otomatis pakai orientasi mendatar agar tidak terpotong
    const mendatar = kolom.length > 5;

    const halaman =
      '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">' +
      '<title>' + escEks(judul) + '</title><style>' +
      '@page { size: A4 ' + (mendatar ? 'landscape' : 'portrait') + '; margin: 12mm; }' +
      'body { font-family: Calibri, Arial, sans-serif; margin:0; }' +
      'table { width:100%; border-collapse:collapse; font-size:' + (mendatar ? '9pt' : '10pt') + '; }' +
      'th { background:#0284C7 !important; color:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
      'tr { page-break-inside: avoid; }' +
      'thead { display: table-header-group; }' +   // judul kolom berulang tiap halaman
      '</style></head><body>' + tabel +
      '<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>' +
      '</body></html>';

    const w = window.open('', '_blank');
    if (!w) {
      showToast('Diblokir', 'Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.', 'warning');
      return;
    }
    w.document.write(halaman);
    w.document.close();
    showToast('Menyiapkan PDF', 'Pada jendela cetak, pilih "Save as PDF" sebagai tujuan.', 'info');
  } catch (e) {
    console.error('Ekspor PDF gagal:', e);
    showToast('Gagal', 'Tidak dapat membuat berkas PDF.', 'danger');
  }
}

function unduhBerkas(isi, namaBerkas, tipe) {
  const blob = new Blob(['\ufeff' + isi], { type: tipe + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaBerkas;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

/** Pasangan tombol Excel + PDF yang seragam di semua tab. */
function tombolEkspor(fungsiData) {
  return '<div class="d-flex gap-2">' +
    '<button class="btn btn-outline btn-sm" onclick="' + fungsiData + '(\'excel\')" title="Unduh sebagai Excel">' +
      '<i class="bi bi-file-earmark-excel"></i> Excel</button>' +
    '<button class="btn btn-outline btn-sm" onclick="' + fungsiData + '(\'pdf\')" title="Unduh sebagai PDF">' +
      '<i class="bi bi-file-earmark-pdf"></i> PDF</button>' +
  '</div>';
}

// ════════════════════════════════════════════════════════
// SUMBER DATA TIAP TAB
// ════════════════════════════════════════════════════════
// Tiap fungsi menyiapkan kolom + baris, lalu menyerahkannya ke
// eksporExcel / eksporPDF sesuai format yang diminta.

function jalankanEkspor(format, judul, kolom, baris, lebar, subJudul) {
  if (format === 'pdf') eksporPDF(judul, kolom, baris, lebar, subJudul);
  else eksporExcel(judul, kolom, baris, lebar, subJudul);
}

/** Data Master UMKM */
function eksporDataMasterUMKM(format) {
  const rows = (AppState.cache.umkm || []).slice().sort(function (a, b) {
    return new Date(b.TanggalBinaan || 0) - new Date(a.TanggalBinaan || 0);
  });
  const kolom = ['No', 'Nama UMKM', 'Sektor', 'Spesialisasi', 'Alamat Usaha', 'Binaan Sejak', 'Status'];
  const lebar = [5, 28, 14, 24, 32, 14, 12];
  const baris = rows.map(function (u, i) {
    const aktif = (typeof umkmAktif === 'function') ? umkmAktif(u) : true;
    return [i + 1, u.NamaUMKM, u.SektorUsaha, u.Spesialisasi || '-',
            u.AlamatUsaha || '-', formatBulanTahun(u.TanggalBinaan),
            // Status tidak aktif ditandai merah agar langsung terlihat
            // saat berkasnya dibaca tanpa perlu menelusuri satu per satu.
            aktif ? 'Aktif' : { teks: 'Tidak Aktif', warna: '#DC2626', tebal: true }];
  });
  const nAktif = rows.filter(function (u) {
    return (typeof umkmAktif === 'function') ? umkmAktif(u) : true;
  }).length;
  jalankanEkspor(format, 'Data Master UMKM', kolom, baris, lebar,
    'Jumlah data: ' + rows.length + ' UMKM   |   Aktif: ' + nAktif +
    '   |   Tidak Aktif: ' + (rows.length - nAktif));
}

/** Rekap Omset Seluruh UMKM */
function eksporRekapOmset(format) {
  const tahun = (document.getElementById('omsetTahunSelect') || {}).value ||
                AppState.config.tahunAktif || new Date().getFullYear();

  // Dibangun dari DAFTAR UMKM, bukan dari data omset.
  //
  // Sebelumnya dibangun dari data omset, sehingga UMKM yang belum mengisi
  // tahun itu sama sekali tidak muncul di berkas — laporannya jadi tampak
  // kurang tanpa penjelasan. Sekarang semua UMKM aktif ikut tercantum;
  // yang belum mengisi tertulis Rp 0.
  const omsetTh = (AppState.cache.omsetAll || []).filter(function (r) {
    return Number(r.Tahun) === Number(tahun);
  });
  const umkmAktifSaja = (AppState.cache.umkm || []).filter(umkmAktif);

  const baris = umkmAktifSaja.map(function (u) {
    const o = omsetTh.find(function (r) { return r.IDUMKM === u.KodeUnik; });
    let bulanTerakhir = '';
    if (o) {
      for (let i = BULAN_LIST.length - 1; i >= 0; i--) {
        if ((Number(o[BULAN_LIST[i]]) || 0) > 0) { bulanTerakhir = BULAN_LIST[i]; break; }
      }
    }
    const target = o ? (Number(o.TargetOmsetTahunan) || 0) : 0;
    const real = o ? (Number(o.TotalRealisasi) || 0) : 0;
    return {
      nama: u.NamaUMKM,
      sektor: u.SektorUsaha,
      target: target,
      real: real,
      persen: target ? Math.round(real / target * 100) + '%' : '-',
      status: o ? (o.StatusTarget || '-') : 'Belum ada data',
      bulanTerakhir: bulanTerakhir || 'Belum ada'
    };
  }).sort(function (a, b) { return b.real - a.real; })   // omset tertinggi di atas
    .map(function (r, i) {
      return [i + 1, r.nama, r.sektor, formatRupiahFull(r.target),
              formatRupiahFull(r.real), r.persen, r.status, r.bulanTerakhir];
    });

  const kolom = ['No', 'Nama UMKM', 'Sektor', 'Target Omset', 'Total Realisasi', 'Capaian (%)', 'Status', 'Terakhir Input'];
  const lebar = [5, 26, 13, 17, 17, 11, 15, 13];

  // Omset per sektor — menunjukkan sektor mana yang porsinya terbesar
  const realPerUmkm = {};
  omsetTh.forEach(function (o) { realPerUmkm[o.IDUMKM] = Number(o.TotalRealisasi) || 0; });
  const ringkas = ringkasanPerSektor(umkmAktifSaja,
    function (u) { return realPerUmkm[u.KodeUnik] || 0; },
    formatRupiah);

  const totalSemua = umkmAktifSaja.reduce(function (s, u) {
    return s + (realPerUmkm[u.KodeUnik] || 0);
  }, 0);

  jalankanEkspor(format, 'Rekap Omset Seluruh UMKM', kolom, baris, lebar,
    'Tahun ' + tahun + '   |   ' + umkmAktifSaja.length + ' UMKM aktif' +
    '   —   Total: ' + formatRupiahFull(totalSemua) + '\n' + ringkas);
}

/** Rekap Tenaga Kerja Seluruh UMKM */
function eksporRekapTenagaKerja(format) {
  const filterSektor = (document.getElementById('rekapTkFilterSektor') || {}).value || '';
  // Hanya UMKM aktif — yang dinonaktifkan tidak ikut dilaporkan
  const semuaUmkm = (AppState.cache.umkm || []).filter(function (u) {
    return umkmAktif(u) && (!filterSektor || u.SektorUsaha === filterSektor);
  });
  const semuaTk = AppState.cache.tenagaKerjaAll || [];

  const baris = semuaUmkm.map(function (u, i) {
    const milik = semuaTk.filter(function (t) { return t.IDUMKM === u.KodeUnik; });
    let terbaru = null;
    milik.forEach(function (t) {
      if (!terbaru ||
          Number(t.Tahun) > Number(terbaru.Tahun) ||
          (Number(t.Tahun) === Number(terbaru.Tahun) &&
           BULAN_LIST.indexOf(t.Bulan) > BULAN_LIST.indexOf(terbaru.Bulan))) terbaru = t;
    });
    return [i + 1, u.NamaUMKM, u.SektorUsaha,
            terbaru ? (terbaru.Bulan + ' ' + terbaru.Tahun) : 'Belum ada data',
            terbaru ? Number(terbaru.JumlahTenagaKerja) : 0];
  }).sort(function (a, b) { return b[4] - a[4]; })
    .map(function (r, i) { r[0] = i + 1; return r; });

  const kolom = ['No', 'Nama UMKM', 'Sektor', 'Bulan Input Terakhir', 'Jumlah Tenaga Kerja'];
  const lebar = [5, 30, 14, 20, 18];

  // Total tenaga kerja per sektor — supaya langsung terlihat sektor mana
  // yang menyerap tenaga kerja terbanyak.
  const tkPerUmkm = {};
  baris.forEach(function (r) { tkPerUmkm[r[1]] = Number(r[4]) || 0; });
  const ringkas = ringkasanPerSektor(semuaUmkm,
    function (u) { return tkPerUmkm[u.NamaUMKM] || 0; },
    function (n) { return n + ' orang'; });

  const totalSemua = Object.keys(tkPerUmkm).reduce(function (s, k) { return s + tkPerUmkm[k]; }, 0);
  jalankanEkspor(format, 'Rekap Tenaga Kerja Seluruh UMKM', kolom, baris, lebar,
    (filterSektor ? 'Sektor: ' + filterSektor : 'Seluruh sektor') +
    '   —   Total: ' + totalSemua + ' orang\n' + ringkas);
}

/** Rekap Asesmen Kemandirian */
function eksporRekapAsesmen(format) {
  const aktif = daftarKodeUmkmAktif();
  const rows = (AppState.cache.kemandirianAll || [])
    .filter(function (r) { return aktif.indexOf(r.IDUMKM) > -1; })
    .sort(function (a, b) { return (Number(b.RataRata) || 0) - (Number(a.RataRata) || 0); });

  // Sebaran KELAS × SEKTOR.
  //
  // Satu baris per kelas, dengan urutan sektor yang SELALU SAMA — sengaja
  // tidak diurutkan per baris, supaya kolomnya sejajar dan mudah
  // dibandingkan antar kelas saat dibaca sekilas.
  const sektorUmkm = {};
  (AppState.cache.umkm || []).forEach(function (u) { sektorUmkm[u.KodeUnik] = u.SektorUsaha; });

  const matriks = {};
  TIER_LIST.forEach(function (kelas) {
    matriks[kelas] = {};
    SEKTOR_LIST.forEach(function (s) { matriks[kelas][s] = 0; });
  });
  rows.forEach(function (r) {
    const kelas = r.Kelas;
    const sektor = sektorUmkm[r.IDUMKM];
    if (matriks[kelas] && matriks[kelas][sektor] !== undefined) matriks[kelas][sektor]++;
  });

  const ringkasSektor = TIER_LIST.map(function (kelas) {
    const totalKelas = SEKTOR_LIST.reduce(function (s, x) { return s + matriks[kelas][x]; }, 0);
    const rinci = SEKTOR_LIST.map(function (s) {
      return (s + ': ' + matriks[kelas][s]).padEnd(16, ' ');
    }).join('');
    // Nama kelas dan jumlahnya disamakan lebarnya agar kolom sektor
    // di kanannya berbaris lurus antar kelas.
    const label = (kelas + ' (' + totalKelas + ' UMKM)').padEnd(24, ' ');
    return label + rinci;
  }).join('\n');
  const kolom = ['No', 'Nama UMKM', 'Produksi', 'Pemasaran', 'Keuangan',
                 'Rata-Rata', 'Kelas', 'Bulan Asesmen', 'Asesor'];
  const lebar = [5, 28, 10, 11, 11, 11, 14, 16, 18];
  const baris = rows.map(function (r, i) {
    return [i + 1, r.NamaUMKM, r.SkorProduksi, r.SkorPemasaran, r.SkorKeuangan,
            r.RataRata, r.Kelas, formatBulanTahun(r.TanggalAsesmen), r.Asesor || '-'];
  });
  jalankanEkspor(format, 'Rekap Asesmen Kemandirian UMKM', kolom, baris, lebar,
    'Jumlah UMKM yang telah diasesmen: ' + rows.length +
    '\n' + ringkasSektor);
}

/** Legalitas UMKM */
function eksporLegalitas(format) {
  const aktifL = daftarKodeUmkmAktif();
  const rows = (AppState.cache.legalitas || [])
    .filter(function (l) { return aktifL.indexOf(l.IDUMKM) > -1; });
  const urutan = { 'Kadaluarsa': 0, 'Perlu Diperbarui': 1, 'Aktif': 2 };
  rows.sort(function (a, b) {
    const d = (urutan[a.Status] || 3) - (urutan[b.Status] || 3);
    if (d !== 0) return d;
    return (a.SisaHari === null ? 99999 : a.SisaHari) - (b.SisaHari === null ? 99999 : b.SisaHari);
  });

  const kolom = ['No', 'Nama UMKM', 'Jenis Legalitas', 'Nomor',
                 'Penerbit', 'Tanggal Terbit', 'Masa Berlaku', 'Status'];
  const lebar = [5, 28, 24, 22, 20, 15, 28, 18];
  const baris = rows.map(function (l, i) {
    return [i + 1, l.NamaUMKM, l.JenisLegalitas, l.NomorLegalitas || '-',
            l.Penerbit || '-', l.TanggalTerbit ? formatTgl(l.TanggalTerbit) : '-',
            (typeof keteranganMasaBerlaku === 'function' ? keteranganMasaBerlaku(l) : ''), l.Status];
  });
  const aktif = rows.filter(function (l) { return l.Status === 'Aktif'; }).length;
  const perbarui = rows.filter(function (l) { return l.Status === 'Perlu Diperbarui'; }).length;
  const lewat = rows.filter(function (l) { return l.Status === 'Kadaluarsa'; }).length;
  jalankanEkspor(format, 'Legalitas UMKM', kolom, baris, lebar,
    'Aktif: ' + aktif + '  |  Perlu Diperbarui: ' + perbarui + '  |  Kadaluarsa: ' + lewat);
}


/** Kode seluruh UMKM yang berstatus aktif pada cabang yang sedang dilihat. */
function daftarKodeUmkmAktif() {
  return (AppState.cache.umkm || []).filter(umkmAktif)
    .map(function (u) { return u.KodeUnik; });
}


/** Rangkum angka per sektor jadi satu baris keterangan. */
function ringkasanPerSektor(daftarUmkm, ambilAngka, formatAngka) {
  const total = {};
  SEKTOR_LIST.forEach(function (s) { total[s] = 0; });
  daftarUmkm.forEach(function (u) {
    if (total[u.SektorUsaha] === undefined) return;
    total[u.SektorUsaha] += Number(ambilAngka(u)) || 0;
  });
  // Sektor dengan angka tertinggi ditaruh di depan, agar langsung terlihat
  // mana penyumbang terbesarnya.
  return SEKTOR_LIST.slice()
    .sort(function (a, b) { return total[b] - total[a]; })
    .map(function (s) { return s + ': ' + (formatAngka ? formatAngka(total[s]) : total[s]); })
    .join('   |   ');
}
