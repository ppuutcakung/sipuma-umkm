// ════════════════════════════════════════════════════════
// MODUL MIGRASI — Google Sheets → Firestore
// ════════════════════════════════════════════════════════
// Memindahkan seluruh data yang sudah ada ke Firestore, sekaligus
// memberi penanda cabang pada setiap dokumen.
//
// SIFATNYA MENYALIN, BUKAN MEMINDAHKAN:
// data di Google Sheets TIDAK dihapus maupun diubah. Bila hasilnya
// tidak sesuai, cukup hapus koleksi di Firestore lalu ulangi.

// Seluruh data lama berasal dari Cakung
const CABANG_DEFAULT = 'CAKUNG';

const DAFTAR_CABANG = [
  { kode: 'CAKUNG',  nama: 'PPU UT Cakung',    alamat: 'Cakung, Jakarta Timur', aktif: true },
  { kode: 'TANJUNG', nama: 'PPU Site Tanjung', alamat: '',                      aktif: true }
];

/** Ubah tanggal apa pun jadi Date yang sah, atau null. */
function migTanggal(v) {
  if (!v) return null;
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function migAngka(v) { return Number(v) || 0; }
function migTeks(v)  { return (v === null || v === undefined) ? '' : String(v); }

/** Id dokumen yang aman dipakai Firestore (tanpa "/" dan spasi ganda). */
function migId(s) {
  return String(s).replace(/[\/\\#?]/g, '-').replace(/\s+/g, ' ').trim();
}

// ════════════════════════════════════════════════════════
// MIGRASI PER KOLEKSI
// ════════════════════════════════════════════════════════

function migrasiCabang() {
  const daftar = DAFTAR_CABANG.map(function (c) {
    return { id: c.kode, data: { kode: c.kode, nama: c.nama, alamat: c.alamat, aktif: c.aktif } };
  });
  return fbTulisBanyak('cabang', daftar);
}

function migrasiUMKM() {
  const rows = readSheetAsObjects('DataMasterUMKM');
  const daftar = rows.filter(function (u) { return u.KodeUnik; }).map(function (u) {
    return {
      id: migId(u.KodeUnik),
      data: {
        cabang: CABANG_DEFAULT,
        kodeUnik: migTeks(u.KodeUnik),
        namaUMKM: migTeks(u.NamaUMKM),
        sektor: migTeks(u.SektorUsaha),
        spesialisasi: migTeks(u.Spesialisasi),
        alamat: migTeks(u.AlamatUsaha),
        tanggalBinaan: migTanggal(u.TanggalBinaan),
        fotoURL: migTeks(u.FotoURL),
        statusAktif: umkmBerstatusAktif(u),
        terakhirUpdate: migTanggal(u.TerakhirUpdate) || new Date()
      }
    };
  });
  return fbTulisBanyak('umkm', daftar);
}

function migrasiPengguna() {
  const rows = readSheetAsObjects('UserCredentials');
  const pengguna = [], kredensial = [];

  rows.forEach(function (u) {
    if (!u.Username) return;
    const id = migId(u.Username);

    // Peran disesuaikan dengan penamaan baru di Firestore
    const peta = { 'Admin': 'admin', 'UT': 'stakeholder', 'UMKM': 'umkm' };
    const role = peta[String(u.Role)] || 'umkm';

    pengguna.push({
      id: id,
      data: {
        username: migTeks(u.Username),
        role: role,
        // Stakeholder memantau seluruh cabang, jadi tidak diikat satu cabang
        cabang: (role === 'stakeholder') ? '' : CABANG_DEFAULT,
        idUmkm: migTeks(u.IDUMKM),
        statusAkses: migTeks(u.StatusAksesLogin) || 'Allowed',
        alasanPemblokiran: migTeks(u.AlasanPemblokiran),
        statusAktif: u.StatusAktif !== false,
        fotoURL: migTeks(u.FotoURL),
        alamat: migTeks(u.Alamat),
        catatan: migTeks(u.Catatan),
        tanggalDibuat: migTanggal(u.TanggalDibuat) || new Date()
      }
    });

    // Password disimpan di koleksi TERPISAH yang tertutup bagi frontend
    // (Security Rules menolak semua akses; hanya GAS yang boleh membacanya).
    if (u.PasswordHash) {
      kredensial.push({
        id: id,
        data: { username: migTeks(u.Username), hash: migTeks(u.PasswordHash), salt: migTeks(u.Salt) }
      });
    }
  });

  const a = fbTulisBanyak('users', pengguna);
  const b = fbTulisBanyak('kredensial', kredensial);
  Logger.log('   (kredensial: ' + b + ' akun)');
  return a;
}

function migrasiOmset() {
  const rows = readSheetAsObjects('OmsetBulanan');
  const daftar = rows.filter(function (r) { return r.IDUMKM && r.Tahun; }).map(function (r) {
    const bulanan = {};
    BULAN_LIST.forEach(function (b) { bulanan[b] = migAngka(r[b]); });
    return {
      id: migId(r.IDUMKM) + '_' + r.Tahun,
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        tahun: migAngka(r.Tahun),
        target: migAngka(r.TargetOmsetTahunan),
        bulanan: bulanan,
        totalRealisasi: migAngka(r.TotalRealisasi),
        statusTarget: migTeks(r.StatusTarget)
      }
    };
  });
  return fbTulisBanyak('omset', daftar);
}

function migrasiTenagaKerja() {
  const rows = readSheetAsObjects('TenagaKerja');
  const daftar = rows.filter(function (r) { return r.IDUMKM && r.Tahun && r.Bulan; }).map(function (r) {
    return {
      id: migId(r.IDUMKM) + '_' + r.Tahun + '_' + migTeks(r.Bulan),
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        tahun: migAngka(r.Tahun),
        bulan: migTeks(r.Bulan),
        jumlah: migAngka(r.JumlahTenagaKerja),
        catatan: migTeks(r.Catatan)
      }
    };
  });
  return fbTulisBanyak('tenagaKerja', daftar);
}

function migrasiKemandirian() {
  const rows = readSheetAsObjects('KelasKemandirian');
  const daftar = rows.filter(function (r) { return r.IDUMKM; }).map(function (r) {
    return {
      id: migId(r.IDUMKM),
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        skorProduksi: migAngka(r.SkorProduksi),
        skorPemasaran: migAngka(r.SkorPemasaran),
        skorKeuangan: migAngka(r.SkorKeuangan),
        rataRata: migAngka(r.RataRata),
        kelas: migTeks(r.Kelas),
        catatanProduksi: migTeks(r.CatatanProduksi),
        catatanPemasaran: migTeks(r.CatatanPemasaran),
        catatanKeuangan: migTeks(r.CatatanKeuangan),
        saranProgram: migTeks(r.SaranProgram),
        asesor: migTeks(r.Asesor),
        tanggalAsesmen: migTanggal(r.TanggalAsesmen)
      }
    };
  });
  return fbTulisBanyak('kemandirian', daftar);
}

function migrasiFasilitasi() {
  const rows = readSheetAsObjects('FasilitasiPemasaran');
  const daftar = rows.filter(function (r) { return r.ID; }).map(function (r) {
    return {
      id: migId(r.ID),
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        namaCustomer: migTeks(r.NamaCustomer),
        kegiatan: migTeks(r.DeskripsiKegiatan),
        nominal: migAngka(r.NominalRupiah),
        tanggal: migTanggal(r.TanggalFasilitasi),
        catatan: migTeks(r.Catatan)
      }
    };
  });
  return fbTulisBanyak('fasilitasi', daftar);
}

function migrasiPrestasi() {
  const rows = readSheetAsObjects('CatatanPrestasi');
  const daftar = rows.filter(function (r) { return r.ID; }).map(function (r) {
    return {
      id: migId(r.ID),
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        bulan: migTeks(r.Bulan),
        tahun: migAngka(r.Tahun),
        deskripsi: migTeks(r.DeskripsiPrestasi),
        kategori: migTeks(r.KategoriPrestasi),
        catatanTambahan: migTeks(r.CatatanTambahan),
        tanggalPencatatan: migTanggal(r.TanggalPencatatan)
      }
    };
  });
  return fbTulisBanyak('prestasi', daftar);
}

function migrasiLegalitas() {
  let rows = [];
  try { rows = readSheetAsObjects('Legalitas'); } catch (e) { return 0; }
  const daftar = rows.filter(function (r) { return r.ID; }).map(function (r) {
    const seumurHidup = String(r.SeumurHidup).toLowerCase() === 'ya';
    return {
      id: migId(r.ID),
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        jenis: migTeks(r.JenisLegalitas),
        nomor: migTeks(r.NomorLegalitas),
        terbit: migTanggal(r.TanggalTerbit),
        kadaluarsa: seumurHidup ? null : migTanggal(r.TanggalKadaluarsa),
        seumurHidup: seumurHidup,
        penerbit: migTeks(r.Penerbit),
        catatan: migTeks(r.Catatan)
      }
    };
  });
  return fbTulisBanyak('legalitas', daftar);
}

function migrasiLaporanCSR() {
  const rows = readSheetAsObjects('LaporanCSR');
  const daftar = rows.filter(function (r) { return r.ID; }).map(function (r) {
    return {
      id: migId(r.ID),
      data: {
        cabang: CABANG_DEFAULT,
        bulan: migTeks(r.Bulan),
        tahun: migAngka(r.Tahun),
        namaFile: migTeks(r.NamaFile),
        fileURL: migTeks(r.FileURL),
        fileID: migTeks(r.FileID),
        deskripsi: migTeks(r.DeskripsiLaporan),
        status: migTeks(r.Status) || 'Final',
        diuploadOleh: migTeks(r.DiuploadOleh),
        tanggalUpload: migTanggal(r.TanggalUpload)
      }
    };
  });
  return fbTulisBanyak('laporanCsr', daftar);
}

function migrasiClosing() {
  let rows = [];
  try { rows = readSheetAsObjects('PeriodeClosing'); } catch (e) { return 0; }
  const daftar = rows.filter(function (r) { return r.IDUMKM && r.Tahun; }).map(function (r) {
    return {
      id: CABANG_DEFAULT + '_' + migId(r.IDUMKM) + '_' + r.Tahun + '_' + migTeks(r.Jenis),
      data: {
        cabang: CABANG_DEFAULT,
        idUmkm: migTeks(r.IDUMKM),
        namaUMKM: migTeks(r.NamaUMKM),
        tahun: migAngka(r.Tahun),
        jenis: migTeks(r.Jenis),
        status: migTeks(r.Status) || 'Closed',
        tanggalClosing: migTanggal(r.TanggalClosing),
        oleh: migTeks(r.OlehSiapa)
      }
    };
  });
  return fbTulisBanyak('closing', daftar);
}

function migrasiConfig() {
  const res = getAllConfig();
  const cfg = (res && res.success) ? res.data : {};
  const daftar = DAFTAR_CABANG.map(function (c) {
    return {
      id: c.kode,
      data: {
        cabang: c.kode,
        tahunAktif: Number(cfg.tahunAktif) || new Date().getFullYear(),
        targetFasilitasiTahunan: Number(cfg.targetFasilitasiTahunan) || 0,
        namaAplikasi: migTeks(cfg.namaAplikasi) || 'SIPUMA',
        taglineAplikasi: migTeks(cfg.taglineAplikasi),
        teksFooter: migTeks(cfg.teksFooter),
        warnaUtama: migTeks(cfg.warnaUtama) || '#0284C7',
        logoURL: migTeks(cfg.logoURL)
      }
    };
  });
  return fbTulisBanyak('config', daftar);
}

// ════════════════════════════════════════════════════════
// JALANKAN SELURUH MIGRASI
// ════════════════════════════════════════════════════════

/**
 * Pindahkan SELURUH data ke Firestore.
 *
 * AMAN: data di Google Sheets tidak disentuh sama sekali.
 * Aman pula dijalankan berulang — dokumen dengan id sama akan ditimpa,
 * bukan digandakan.
 */
function jalankanMigrasiFirestore() {
  const mulai = Date.now();
  Logger.log('🚀 Memulai pemindahan data ke Firestore...');
  Logger.log('   Sumber : Google Sheets (DB_SIPUMA)');
  Logger.log('   Tujuan : Firestore project ' + FB_PROJECT_ID);
  Logger.log('   Cabang : ' + CABANG_DEFAULT + ' (seluruh data lama)');
  Logger.log('');

  const langkah = [
    ['Cabang',          migrasiCabang],
    ['Pengguna',        migrasiPengguna],
    ['Data Master UMKM',migrasiUMKM],
    ['Omset',           migrasiOmset],
    ['Tenaga Kerja',    migrasiTenagaKerja],
    ['Kemandirian',     migrasiKemandirian],
    ['Fasilitasi',      migrasiFasilitasi],
    ['Prestasi',        migrasiPrestasi],
    ['Legalitas',       migrasiLegalitas],
    ['Laporan CSR',     migrasiLaporanCSR],
    ['Closing',         migrasiClosing],
    ['Konfigurasi',     migrasiConfig]
  ];

  const hasil = {};
  let gagal = 0;

  langkah.forEach(function (l) {
    const nama = l[0];
    try {
      Logger.log('📦 ' + nama + '...');
      const n = l[1]();
      hasil[nama] = n;
      Logger.log('   ✅ ' + n + ' dokumen');
    } catch (e) {
      gagal++;
      hasil[nama] = 'GAGAL: ' + e.message;
      Logger.log('   ❌ ' + e.message);
    }
  });

  const detik = Math.round((Date.now() - mulai) / 1000);
  Logger.log('');
  Logger.log('═══════════════════════════════');
  Logger.log(gagal ? ('⚠️  SELESAI dengan ' + gagal + ' kegagalan') : '✅ SELURUHNYA BERHASIL');
  Logger.log('Waktu: ' + detik + ' detik');
  Logger.log(JSON.stringify(hasil, null, 2));
  Logger.log('');
  Logger.log('Data di Google Sheets TIDAK diubah — tetap utuh sebagai cadangan.');
  Logger.log('Langkah berikutnya: jalankan verifikasiMigrasi() untuk mencocokkan jumlah.');
  return hasil;
}

/**
 * Cocokkan jumlah baris di Sheets dengan jumlah dokumen di Firestore.
 * Wajib dijalankan setelah migrasi — jangan percaya laporan "berhasil"
 * tanpa memastikan angkanya benar-benar sama.
 */
function verifikasiMigrasi() {
  Logger.log('🔍 Memverifikasi hasil pemindahan...');
  Logger.log('');

  const pasangan = [
    ['DataMasterUMKM',      'umkm'],
    ['UserCredentials',     'users'],
    ['OmsetBulanan',        'omset'],
    ['TenagaKerja',         'tenagaKerja'],
    ['KelasKemandirian',    'kemandirian'],
    ['FasilitasiPemasaran', 'fasilitasi'],
    ['CatatanPrestasi',     'prestasi'],
    ['Legalitas',           'legalitas'],
    ['LaporanCSR',          'laporanCsr'],
    ['PeriodeClosing',      'closing']
  ];

  let cocok = 0, beda = 0;
  pasangan.forEach(function (p) {
    let nSheet = 0, nFs = 0;
    try { nSheet = readSheetAsObjects(p[0]).length; } catch (e) { nSheet = 0; }
    try { nFs = fbBacaKoleksi(p[1]).length; } catch (e) { nFs = -1; }

    const sama = (nSheet === nFs);
    if (sama) cocok++; else beda++;
    Logger.log((sama ? '  ✅ ' : '  ⚠️  ') + p[0] + ' → ' + p[1] +
               '  |  Sheets: ' + nSheet + '  Firestore: ' + nFs);
  });

  Logger.log('');
  if (beda === 0) {
    Logger.log('✅ SEMUA COCOK (' + cocok + ' koleksi). Data siap dipakai.');
  } else {
    Logger.log('⚠️  ' + beda + ' koleksi jumlahnya berbeda.');
    Logger.log('   Selisih kecil bisa wajar bila ada baris kosong/tanpa ID di Sheets —');
    Logger.log('   baris seperti itu memang sengaja dilewati saat pemindahan.');
    Logger.log('   Periksa koleksi yang bertanda ⚠️ sebelum melanjutkan.');
  }
}

/**
 * Hapus SELURUH data di Firestore (untuk mengulang migrasi dari nol).
 * Tidak menyentuh Google Sheets sama sekali.
 */
function kosongkanFirestore() {
  const koleksi = ['umkm','users','kredensial','omset','tenagaKerja','kemandirian',
                   'fasilitasi','prestasi','legalitas','laporanCsr','closing','config','cabang'];
  let total = 0;
  koleksi.forEach(function (k) {
    try {
      const dok = fbBacaKoleksi(k);
      dok.forEach(function (d) {
        UrlFetchApp.fetch(fbUrlDasar() + '/' + k + '/' + encodeURIComponent(d._id), {
          method: 'delete',
          headers: { Authorization: 'Bearer ' + fbAccessToken() },
          muteHttpExceptions: true
        });
        total++;
      });
      Logger.log('  🗑️  ' + k + ': ' + dok.length + ' dokumen dihapus');
    } catch (e) {
      Logger.log('  ⚠️  ' + k + ': ' + e.message);
    }
  });
  Logger.log('');
  Logger.log('✅ ' + total + ' dokumen dihapus dari Firestore.');
  Logger.log('   Google Sheets tidak tersentuh — migrasi dapat diulang kapan saja.');
}
