// ════════════════════════════════════════════════════════
// MODUL PENCADANGAN — Firestore → Google Sheets
// ════════════════════════════════════════════════════════
// Menyalin isi Firestore kembali ke spreadsheet DB_SIPUMA setiap hari,
// sehingga Anda tetap punya salinan yang bisa dibuka, dibaca, dan
// diperiksa seperti biasa — tanpa perlu masuk ke Console Firebase.
//
// SIFATNYA SATU ARAH: Firestore → Sheets.
// Mengubah isi spreadsheet TIDAK akan memengaruhi aplikasi. Spreadsheet
// di sini murni arsip, bukan lagi sumber data.
//
// Biaya kuota: sekitar 1.500 bacaan Firestore per hari (± 3% dari kuota
// gratis harian). Aman dijalankan otomatis.

// Nama sheet tujuan diberi awalan agar tidak bertabrakan dengan sheet
// lama yang masih menyimpan data asli sebelum migrasi.
const PREFIKS_CADANGAN = 'FB_';

const KOLEKSI_DICADANGKAN = [
  'cabang', 'users', 'umkm', 'omset', 'tenagaKerja', 'kemandirian',
  'fasilitasi', 'prestasi', 'legalitas', 'laporanCsr', 'closing', 'config'
];

/** Ubah nilai apa pun jadi bentuk yang aman ditulis ke sel spreadsheet. */
function nilaiUntukSel(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm');
  if (typeof v === 'object') return JSON.stringify(v);   // mis. omset bulanan
  return v;
}

/**
 * Cadangkan satu koleksi ke satu sheet.
 * Sheet ditulis ulang seluruhnya setiap kali — bukan ditambahkan — supaya
 * isinya selalu mencerminkan keadaan Firestore saat itu, termasuk data
 * yang sudah dihapus.
 */
function cadangkanKoleksi(namaKoleksi) {
  const dokumen = fbBacaKoleksi(namaKoleksi);
  const ss = getSpreadsheet();
  const namaSheet = PREFIKS_CADANGAN + namaKoleksi;

  let sheet = ss.getSheetByName(namaSheet);
  if (!sheet) sheet = ss.insertSheet(namaSheet);
  sheet.clear();

  if (!dokumen.length) {
    sheet.getRange(1, 1).setValue('(kosong pada ' +
      Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm') + ')');
    return 0;
  }

  // Kumpulkan SELURUH nama field yang pernah muncul — dokumen Firestore
  // tidak wajib punya field yang sama persis, jadi mengambil dari dokumen
  // pertama saja bisa membuat sebagian kolom hilang.
  const kolom = {};
  dokumen.forEach(function (d) {
    Object.keys(d).forEach(function (k) { kolom[k] = true; });
  });
  const headers = Object.keys(kolom).sort(function (a, b) {
    if (a === '_id') return -1;          // id selalu di kolom pertama
    if (b === '_id') return 1;
    return a.localeCompare(b);
  });

  const baris = dokumen.map(function (d) {
    return headers.map(function (h) { return nilaiUntukSel(d[h]); });
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#0284C7').setFontColor('#ffffff');
  sheet.getRange(2, 1, baris.length, headers.length).setValues(baris);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, Math.min(headers.length, 12));

  return dokumen.length;
}

/**
 * Jalankan pencadangan seluruh koleksi.
 * Inilah fungsi yang dipasang sebagai pemicu harian.
 */
function cadangkanFirestoreKeSheets(paksa) {
  const mulai = Date.now();
  Logger.log('💾 Mencadangkan Firestore ke Google Sheets...');
  Logger.log('');

  // ── Lewati bila tidak ada perubahan sejak pencadangan terakhir ──
  // Aplikasi mencatat stempel waktu setiap kali data diubah. Dengan
  // memeriksanya lebih dulu, hari yang tidak ada perubahan hanya memakan
  // 1 bacaan Firestore, bukan ± 1.500.
  //
  // Bila penanda tidak terbaca karena alasan apa pun, pencadangan tetap
  // DIJALANKAN — lebih baik mencadangkan tanpa perlu daripada melewatkan
  // perubahan yang benar-benar terjadi.
  if (!paksa) {
    try {
      const penanda = fbAmbilDokumen('meta', 'perubahan');
      const waktuUbah = penanda && penanda.terakhirDiubah
        ? new Date(penanda.terakhirDiubah).getTime() : null;
      const waktuCadanganTerakhir = Number(
        PropertiesService.getScriptProperties().getProperty('CADANGAN_TERAKHIR') || 0);

      if (waktuUbah && waktuCadanganTerakhir && waktuUbah <= waktuCadanganTerakhir) {
        Logger.log('ℹ️  Tidak ada perubahan data sejak pencadangan terakhir —');
        Logger.log('    pencadangan dilewati. Hanya 1 bacaan Firestore terpakai.');
        Logger.log('');
        Logger.log('    Terakhir dicadangkan : ' +
          Utilities.formatDate(new Date(waktuCadanganTerakhir), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'));
        Logger.log('    Terakhir data diubah : ' +
          Utilities.formatDate(new Date(waktuUbah), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'));
        Logger.log('');
        Logger.log('    Untuk memaksa: jalankan cadangkanSekarangPaksa()');
        return { dilewati: true };
      }
    } catch (e) {
      Logger.log('  ⚠️ Penanda perubahan tidak terbaca (' + e.message + ') —');
      Logger.log('     pencadangan tetap dijalankan agar tidak ada yang terlewat.');
    }
  }

  const hasil = {};
  let totalDok = 0, gagal = 0;

  KOLEKSI_DICADANGKAN.forEach(function (k) {
    try {
      const n = cadangkanKoleksi(k);
      hasil[k] = n;
      totalDok += n;
      Logger.log('  ✅ ' + k + ': ' + n + ' dokumen');
    } catch (e) {
      gagal++;
      hasil[k] = 'GAGAL: ' + e.message;
      Logger.log('  ❌ ' + k + ': ' + e.message);
    }
  });

  // Catat waktu pencadangan terakhir, supaya mudah diperiksa
  try {
    const ss = getSpreadsheet();
    let info = ss.getSheetByName('FB_InfoCadangan');
    if (!info) {
      info = ss.insertSheet('FB_InfoCadangan');
      info.appendRow(['Waktu', 'Total Dokumen', 'Koleksi Gagal', 'Lama (detik)']);
      info.getRange(1, 1, 1, 4).setFontWeight('bold')
          .setBackground('#0284C7').setFontColor('#ffffff');
      info.setFrozenRows(1);
    }
    info.insertRowAfter(1);
    info.getRange(2, 1, 1, 4).setValues([[
      Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'),
      totalDok, gagal, Math.round((Date.now() - mulai) / 1000)
    ]]);
    // Simpan 60 catatan terakhir saja agar tidak menumpuk
    if (info.getLastRow() > 61) {
      info.deleteRows(62, info.getLastRow() - 61);
    }
  } catch (e) {
    Logger.log('  ⚠️ Gagal mencatat info cadangan: ' + e.message);
  }

  Logger.log('');
  Logger.log('═══════════════════════════════');
  Logger.log(gagal ? ('⚠️  Selesai dengan ' + gagal + ' kegagalan')
                   : '✅ Pencadangan berhasil seluruhnya');
  Logger.log('Total dokumen : ' + totalDok);
  Logger.log('Lama          : ' + Math.round((Date.now() - mulai) / 1000) + ' detik');
  // Catat waktu pencadangan agar pemeriksaan berikutnya punya pembanding.
  // Hanya dicatat bila SELURUH koleksi berhasil — kalau ada yang gagal,
  // pencadangan berikutnya harus mencoba lagi, bukan menganggap selesai.
  if (!gagal) {
    PropertiesService.getScriptProperties()
      .setProperty('CADANGAN_TERAKHIR', String(Date.now()));
  } else {
    Logger.log('⚠️  Waktu pencadangan TIDAK dicatat karena ada kegagalan —');
    Logger.log('    pencadangan berikutnya akan mencoba lagi.');
  }

  Logger.log('');
  Logger.log('Hasilnya ada di sheet berawalan "FB_" pada DB_SIPUMA.');
  return hasil;
}

/**
 * Pasang pemicu harian secara otomatis.
 * Jalankan SEKALI. Aman diulang — pemicu lama dihapus dulu agar tidak
 * menumpuk dan menyebabkan pencadangan berjalan berkali-kali sehari.
 */
function pasangPemicuCadanganHarian() {
  const nama = 'cadangkanFirestoreKeSheets';
  let dihapus = 0;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === nama) {
      ScriptApp.deleteTrigger(t);
      dihapus++;
    }
  });

  ScriptApp.newTrigger(nama)
    .timeBased()
    .atHour(1)            // sekitar pukul 01.00 WIB
    .everyDays(1)
    .create();

  Logger.log('✅ Pemicu harian terpasang (sekitar pukul 01.00 WIB).');
  if (dihapus) Logger.log('   ' + dihapus + ' pemicu lama dihapus agar tidak menumpuk.');
  Logger.log('');
  Logger.log('Pencadangan akan berjalan otomatis setiap hari.');
  Logger.log('Untuk menjalankan manual: pilih fungsi cadangkanFirestoreKeSheets lalu Run.');
}

/** Lepas pemicu harian (bila suatu saat perlu dihentikan). */
function lepasPemicuCadanganHarian() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cadangkanFirestoreKeSheets') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  Logger.log(n ? ('✅ ' + n + ' pemicu dilepas.') : 'ℹ️  Tidak ada pemicu yang terpasang.');
}

/** Lihat pemicu apa saja yang sedang aktif di project ini. */
function lihatPemicuAktif() {
  const daftar = ScriptApp.getProjectTriggers();
  if (!daftar.length) { Logger.log('Tidak ada pemicu aktif.'); return; }
  Logger.log('Pemicu aktif:');
  daftar.forEach(function (t) {
    Logger.log('  • ' + t.getHandlerFunction() + '  (' + t.getEventType() + ')');
  });
}


/** Paksa pencadangan walau tidak ada perubahan tercatat. */
function cadangkanSekarangPaksa() {
  return cadangkanFirestoreKeSheets(true);
}

/** Lihat status pencadangan terakhir tanpa menjalankan apa pun. */
function cekStatusCadangan() {
  const w = Number(PropertiesService.getScriptProperties()
    .getProperty('CADANGAN_TERAKHIR') || 0);
  if (!w) { Logger.log('Belum pernah ada pencadangan yang tercatat berhasil.'); return; }
  Logger.log('Pencadangan terakhir berhasil: ' +
    Utilities.formatDate(new Date(w), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'));
  try {
    const p = fbAmbilDokumen('meta', 'perubahan');
    if (p && p.terakhirDiubah) {
      Logger.log('Data terakhir diubah      : ' +
        Utilities.formatDate(new Date(p.terakhirDiubah), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'));
      Logger.log(new Date(p.terakhirDiubah).getTime() > w
        ? '→ Ada perubahan belum tercadangkan.'
        : '→ Cadangan sudah mutakhir.');
    }
  } catch (e) { Logger.log('Penanda perubahan tidak terbaca: ' + e.message); }
}
