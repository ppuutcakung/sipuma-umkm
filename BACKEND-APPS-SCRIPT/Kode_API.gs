/**
 * ============================================================
 * SIPUMA — Sistem Informasi Pendataan dan Manajemen UMKM
 * Backend (Kode.gs)
 * PPU UT Cakung — Program CSR United Tractors
 * Versi: 2.4.0-UTGROWTH
 * ============================================================
 * Arsitektur: Single Page Application (SPA) murni.
 * doGet() hanya dipanggil SEKALI. Semua navigasi & data ditarik
 * via google.script.run (tidak ada ?page= di URL).
 * ============================================================
 */

// ── Konstanta Global ──
const APP_NAME = 'SIPUMA';
const APP_FULL_NAME = 'Sistem Informasi Pendataan & Manajemen UMKM';
const FOLDER_NAME = 'SIPUMA_Data';
const SS_NAME = 'DB_SIPUMA';
const APP_VERSION = 'v2.4.0-UTGROWTH';

// Kode inisial per sektor UMKM (dipakai untuk generate Kode Unik otomatis)
const SEKTOR_KODE = {
  'Kuliner': 'KUL',
  'Kerajinan': 'KRJ',
  'Pertanian': 'PTN',
  'Manufaktur': 'MFG'
};

const BULAN_LIST = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BULAN_PANJANG = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ── Struktur Header setiap Sheet ──
const SHEET_HEADERS = {
  DataMasterUMKM: ['ID','NamaUMKM','KodeUnik','SektorUsaha','Spesialisasi','TanggalBinaan','AlamatUsaha','FotoURL','TerakhirUpdate','StatusAktif'],
  OmsetBulanan: ['ID','IDUMKM','NamaUMKM','Tahun','TargetOmsetTahunan',...BULAN_LIST,'TotalRealisasi','StatusTarget'],
  TenagaKerja: ['ID','IDUMKM','NamaUMKM','Bulan','Tahun','JumlahTenagaKerja','Catatan'],
  KelasKemandirian: ['ID','IDUMKM','NamaUMKM','SkorProduksi','SkorPemasaran','SkorKeuangan','RataRata','Kelas','CatatanProduksi','CatatanPemasaran','CatatanKeuangan','SaranProgram','TanggalAsesmen','Asesor'],
  FasilitasiPemasaran: ['ID','NamaCustomer','IDUMKM','NamaUMKM','DeskripsiKegiatan','NominalRupiah','TanggalFasilitasi','Catatan'],
  CatatanPrestasi: ['ID','IDUMKM','NamaUMKM','Bulan','Tahun','DeskripsiPrestasi','KategoriPrestasi','TanggalPencatatan','CatatanTambahan'],
  Legalitas: ['ID','IDUMKM','NamaUMKM','JenisLegalitas','NomorLegalitas','TanggalTerbit','TanggalKadaluarsa','SeumurHidup','Penerbit','Catatan','TanggalDicatat'],
  PeriodeClosing: ['ID','IDUMKM','NamaUMKM','Tahun','Jenis','Status','TanggalClosing','OlehSiapa','Catatan'],
  LaporanCSR: ['ID','Bulan','Tahun','NamaFile','FileURL','FileID','DeskripsiLaporan','TanggalUpload','DiuploadOleh','Status','Catatan'],
  UserCredentials: ['Username','KodeUnik','Role','IDUMKM','StatusAksesLogin','AlasanPemblokiran','StatusAktif','TanggalDibuat','TanggalPerubahanAkses','Catatan','FotoURL','Alamat']
};

// ── Helper: Include HTML Partial ──

function createResponse(success, data, message) {
  return { success: success, data: data, message: message };
}

// ── Helper: Generate ID unik (angka increment sederhana berbasis UUID pendek) ──
function generateShortId() {
  // Prefiks huruf "R" (Record) SENGAJA ditambahkan di depan supaya ID ini
  // TIDAK PERNAH terlihat seperti angka murni bagi Google Sheets — kalau
  // dibiarkan hanya potongan UUID saja, ada kemungkinan (kecil tapi nyata)
  // kebetulan semua karakternya berupa digit (misal "12345678"), yang
  // membuat Sheets otomatis menyimpannya sebagai TIPE ANGKA, bukan teks.
  // Ini pernah menyebabkan ID gagal cocok saat dibandingkan di kode lain.
  return 'R' + Utilities.getUuid().split('-')[0];
}

function formatTanggalID(date) {
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
}

// ════════════════════════════════════════════════════════
// MODUL KEAMANAN — Hash Password, Sesi Bertoken, Rate Limit
// ════════════════════════════════════════════════════════
// Inilah perbedaan mendasar versi API ini dengan versi iframe lama:
// dulu proses login hanya mengatur TAMPILAN di browser, sementara fungsi
// server tetap bisa dipanggil langsung siapa saja. Sekarang SETIAP
// permintaan data wajib membawa token sesi yang diverifikasi di server —
// tanpa token yang sah, server menolak, titik.

const SESI_BERLAKU_JAM   = 5;    // masa berlaku token sesi
const MAKS_GAGAL_LOGIN   = 5;    // percobaan gagal sebelum dikunci
const KUNCI_LOGIN_MENIT  = 15;   // lama penguncian setelah gagal berulang

/**
 * Ubah password menjadi hash SHA-256 yang tidak bisa dibalik.
 * Setiap pengguna punya "salt" (garam) acak sendiri, sehingga dua orang
 * dengan password sama pun menghasilkan hash yang berbeda — ini mencegah
 * penebakan massal memakai tabel hash siap pakai.
 */
function buatHashPassword(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '::' + String(password),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function buatSaltAcak() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 16);
}

function buatTokenAcak() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/**
 * Bandingkan dua teks dengan waktu yang relatif seragam, agar lamanya
 * proses tidak membocorkan seberapa banyak karakter yang sudah cocok.
 */
function bandinganAman(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return beda === 0;
}

// ── Pembatasan percobaan login (anti tebak-tebakan password) ──
function cekKuncianLogin(username) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('gagal_' + String(username).toLowerCase()) || 0);
  return n >= MAKS_GAGAL_LOGIN;
}
function catatGagalLogin(username) {
  const cache = CacheService.getScriptCache();
  const kunci = 'gagal_' + String(username).toLowerCase();
  const n = Number(cache.get(kunci) || 0) + 1;
  cache.put(kunci, String(n), KUNCI_LOGIN_MENIT * 60);
  return n;
}
function resetGagalLogin(username) {
  try { CacheService.getScriptCache().remove('gagal_' + String(username).toLowerCase()); } catch (e) {}
}

// ── Penyimpanan sesi ──
// Sesi disimpan di sheet "Sesi" agar tetap berlaku walau cache Google
// dibersihkan, TAPI juga disalin ke cache supaya pemeriksaan token pada
// setiap permintaan tetap cepat (tidak perlu baca sheet tiap kali).
function simpanSesi(token, user) {
  const kedaluwarsa = new Date(Date.now() + SESI_BERLAKU_JAM * 60 * 60 * 1000);
  const sesi = {
    token: token,
    username: user.Username,
    role: user.Role,
    idUmkm: user.IDUMKM || '',
    kedaluwarsa: kedaluwarsa.toISOString()
  };
  const sheet = getSheet('Sesi');
  sheet.appendRow([token, user.Username, user.Role, user.IDUMKM || '', new Date(), kedaluwarsa]);
  try {
    CacheService.getScriptCache().put('sesi_' + token, JSON.stringify(sesi), SESI_BERLAKU_JAM * 3600);
  } catch (e) {}
  return sesi;
}

function ambilSesi(token) {
  if (!token) return null;
  // Cepat: coba dari cache dulu
  try {
    const dariCache = CacheService.getScriptCache().get('sesi_' + token);
    if (dariCache) {
      const s = JSON.parse(dariCache);
      if (new Date(s.kedaluwarsa) > new Date()) return s;
      return null; // sudah lewat masa berlaku
    }
  } catch (e) {}

  // Cadangan: cari di sheet (misal cache sudah dibersihkan Google)
  const sheet = getSheet('Sesi');
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i > 0; i--) {
    if (bandinganAman(values[i][0], token)) {
      const kedaluwarsa = new Date(values[i][5]);
      if (kedaluwarsa <= new Date()) return null;
      const s = {
        token: token, username: values[i][1], role: values[i][2],
        idUmkm: values[i][3] || '', kedaluwarsa: kedaluwarsa.toISOString()
      };
      try { CacheService.getScriptCache().put('sesi_' + token, JSON.stringify(s), 1800); } catch (e) {}
      return s;
    }
  }
  return null;
}

function hapusSesi(token) {
  try { CacheService.getScriptCache().remove('sesi_' + token); } catch (e) {}
  try {
    const sheet = getSheet('Sesi');
    const values = sheet.getDataRange().getValues();
    for (let i = values.length - 1; i > 0; i--) {
      if (String(values[i][0]) === String(token)) { sheet.deleteRow(i + 1); break; }
    }
  } catch (e) {}
}

/**
 * Akhiri SEMUA sesi aktif milik seorang pengguna.
 * Dipakai saat username diganti: sesi lama masih menyimpan username lama,
 * sehingga sebagian operasi (mis. perbarui profil) akan gagal diam-diam.
 * Lebih aman memaksa login ulang dengan username baru.
 */
function hapusSesiPengguna(username) {
  try {
    const sheet = getSheet('Sesi');
    const values = sheet.getDataRange().getValues();
    let n = 0;
    for (let i = values.length - 1; i > 0; i--) {
      if (String(values[i][1]) === String(username)) {
        try { CacheService.getScriptCache().remove('sesi_' + values[i][0]); } catch (e) {}
        sheet.deleteRow(i + 1);
        n++;
      }
    }
    return n;
  } catch (e) { return 0; }
}

/** Bersihkan sesi kedaluwarsa — dipanggil sesekali agar sheet tidak menumpuk. */
function bersihkanSesiKedaluwarsa() {
  try {
    const sheet = getSheet('Sesi');
    const values = sheet.getDataRange().getValues();
    const sekarang = new Date();
    let dihapus = 0;
    for (let i = values.length - 1; i > 0; i--) {
      if (new Date(values[i][5]) <= sekarang) { sheet.deleteRow(i + 1); dihapus++; }
    }
    return dihapus;
  } catch (e) { return 0; }
}

// ════════════════════════════════════════════════════════
// LOGIN & LOGOUT
// ════════════════════════════════════════════════════════
function apiLogin(payload) {
  try {
    const role     = payload.role;
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');

    if (!username || !password) {
      return createResponse(false, null, 'Username dan password wajib diisi.');
    }
    if (cekKuncianLogin(username)) {
      return createResponse(false, null,
        'Terlalu banyak percobaan login gagal. Silakan tunggu ' + KUNCI_LOGIN_MENIT + ' menit sebelum mencoba lagi.');
    }

    const users = readSheetAsObjects('UserCredentials');
    const user = users.find(function (u) {
      return String(u.Role).toUpperCase() === String(role).toUpperCase() &&
             String(u.Username).trim().toLowerCase() === username.toLowerCase();
    });

    // Pesan kegagalan SENGAJA disamakan (tidak membedakan "user tidak ada"
    // vs "password salah") supaya tidak membocorkan daftar username yang sah.
    if (!user) {
      catatGagalLogin(username);
      return createResponse(false, null, 'Username atau password salah. Silakan periksa kembali.');
    }

    const cocok = user.PasswordHash
      ? bandinganAman(user.PasswordHash, buatHashPassword(password, user.Salt))
      : bandinganAman(user.KodeUnik, password); // jalur lama, sebelum migrasi hash

    if (!cocok) {
      const n = catatGagalLogin(username);
      const sisa = MAKS_GAGAL_LOGIN - n;
      return createResponse(false, null,
        'Username atau password salah.' + (sisa > 0 && sisa <= 2 ? ' Sisa ' + sisa + ' percobaan lagi.' : ''));
    }
    if (String(user.StatusAksesLogin) !== 'Allowed') {
      return createResponse(false, null, 'Akses Anda sedang diblokir. Silakan hubungi admin untuk informasi lebih lanjut.');
    }

    resetGagalLogin(username);
    const token = buatTokenAcak();
    simpanSesi(token, user);

    return createResponse(true, {
      token: token,
      berlakuSampai: new Date(Date.now() + SESI_BERLAKU_JAM * 3600 * 1000).toISOString(),
      profil: {
        username: user.Username,
        role: user.Role,
        idUmkm: user.IDUMKM || '',
        fotoURL: user.FotoURL || '',
        alamat: user.Alamat || ''
      },
      config: ambilConfigObjek()
    }, 'Login berhasil. Selamat datang, ' + user.Username + '!');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

function apiLogout(sesi) {
  hapusSesi(sesi.token);
  return createResponse(true, null, 'Anda telah keluar dari sistem.');
}

function apiCekSesi(sesi) {
  return createResponse(true, {
    profil: { username: sesi.username, role: sesi.role, idUmkm: sesi.idUmkm },
    berlakuSampai: sesi.kedaluwarsa
  }, 'Sesi masih aktif.');
}

function ambilConfigObjek() {
  try {
    const res = getAllConfig();
    return res && res.success ? res.data : {};
  } catch (e) { return {}; }
}

// ════════════════════════════════════════════════════════
// MIGRASI PASSWORD KE HASH — JALANKAN SEKALI SAJA
// ════════════════════════════════════════════════════════
/**
 * Mengubah semua password yang masih tersimpan sebagai teks biasa menjadi
 * hash. PASSWORD PENGGUNA TIDAK BERUBAH — mereka tetap memakai password
 * yang sama seperti biasa; yang berubah hanya cara penyimpanannya.
 *
 * Aman dijalankan lebih dari sekali: baris yang sudah punya hash dilewati.
 */
function migrasiPasswordKeHash() {
  const sheet = getSheet('UserCredentials');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  let kolomHash = headers.indexOf('PasswordHash');
  let kolomSalt = headers.indexOf('Salt');

  // Tambahkan kolom baru kalau belum ada
  if (kolomHash === -1) {
    sheet.getRange(1, headers.length + 1).setValue('PasswordHash');
    kolomHash = headers.length;
    headers.push('PasswordHash');
  }
  if (kolomSalt === -1) {
    sheet.getRange(1, headers.length + 1).setValue('Salt');
    kolomSalt = headers.length;
    headers.push('Salt');
  }

  const kolomKode = headers.indexOf('KodeUnik');
  const kolomUser = headers.indexOf('Username');
  let diproses = 0, dilewati = 0;

  for (let i = 1; i < values.length; i++) {
    const sudahAda = values[i][kolomHash];
    if (sudahAda) { dilewati++; continue; }

    const passwordLama = String(values[i][kolomKode] || '');
    if (!passwordLama) { dilewati++; continue; }

    const salt = buatSaltAcak();
    const hash = buatHashPassword(passwordLama, salt);
    sheet.getRange(i + 1, kolomHash + 1).setValue(hash);
    sheet.getRange(i + 1, kolomSalt + 1).setValue(salt);
    diproses++;
    Logger.log('  ✅ ' + values[i][kolomUser] + ' — password di-hash');
  }

  invalidasiCacheSheet('UserCredentials');
  Logger.log('');
  Logger.log('✅ Migrasi selesai. Di-hash: ' + diproses + ' akun, dilewati: ' + dilewati + ' akun.');
  Logger.log('⚠️  Password pengguna TIDAK berubah — mereka tetap login seperti biasa.');
  Logger.log('⚠️  Langkah berikutnya: jalankan kosongkanPasswordTeksBiasa() setelah');
  Logger.log('    memastikan semua peran bisa login normal di aplikasi baru.');
  return { diproses: diproses, dilewati: dilewati };
}

/**
 * Kosongkan kolom KodeUnik (tempat password teks biasa dulu tersimpan)
 * SETELAH migrasi hash terbukti berhasil dan semua peran bisa login.
 *
 * Aman untuk relasi data: kode UMKM tetap tersimpan utuh di kolom IDUMKM,
 * dan seluruh kode aplikasi sudah memakai IDUMKM untuk relasi antar-sheet.
 */
function kosongkanPasswordTeksBiasa() {
  const sheet = getSheet('UserCredentials');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const kolomKode = headers.indexOf('KodeUnik');
  const kolomHash = headers.indexOf('PasswordHash');

  if (kolomHash === -1) {
    Logger.log('❌ Kolom PasswordHash belum ada. Jalankan migrasiPasswordKeHash() dulu.');
    return;
  }
  let dikosongkan = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i][kolomHash] && values[i][kolomKode]) {
      sheet.getRange(i + 1, kolomKode + 1).setValue('');
      dikosongkan++;
    }
  }
  invalidasiCacheSheet('UserCredentials');
  Logger.log('✅ ' + dikosongkan + ' password teks biasa berhasil dihapus dari spreadsheet.');
  Logger.log('   Mulai sekarang password TIDAK LAGI bisa dibaca siapa pun dari sheet.');
}

/**
 * Reset password seorang pengguna — HANYA Admin.
 * Dibutuhkan terutama setelah password teks biasa dikosongkan: tanpa ini,
 * pengguna yang lupa password tidak punya jalan pemulihan sama sekali.
 */
function apiResetPassword(username, passwordBaru) {
  try {
    if (!username) throw new Error('Username wajib diisi.');
    if (!passwordBaru || String(passwordBaru).length < 6) {
      throw new Error('Password baru minimal 6 karakter.');
    }
    setPasswordUser(username, String(passwordBaru));
    return createResponse(true, null,
      'Password "' + username + '" berhasil diubah. Sampaikan password baru ini kepada yang bersangkutan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Ubah password seorang pengguna (dipakai Admin lewat Manajemen User). */
function setPasswordUser(username, passwordBaru) {
  const sheet = getSheet('UserCredentials');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const kolomUser = headers.indexOf('Username');
  let kolomHash = headers.indexOf('PasswordHash');
  let kolomSalt = headers.indexOf('Salt');

  if (kolomHash === -1 || kolomSalt === -1) {
    throw new Error('Kolom PasswordHash/Salt belum ada. Jalankan migrasiPasswordKeHash() terlebih dahulu.');
  }
  const rowIdx = values.findIndex(function (r, i) {
    return i > 0 && String(r[kolomUser]) === String(username);
  });
  if (rowIdx === -1) throw new Error('User tidak ditemukan.');

  const salt = buatSaltAcak();
  sheet.getRange(rowIdx + 1, kolomHash + 1).setValue(buatHashPassword(passwordBaru, salt));
  sheet.getRange(rowIdx + 1, kolomSalt + 1).setValue(salt);
  invalidasiCacheSheet('UserCredentials');
}

// ════════════════════════════════════════════════════════
// ROUTER API — doGet & doPost (JSON, tanpa HtmlService)
// ════════════════════════════════════════════════════════

/** Daftar action beserta peran yang boleh mengaksesnya.
 *  '*' = semua peran yang sudah login. */
const IZIN_AKSI = {
  // — Umum (semua peran yang sudah login) —
  logout:                  ['*'],
  cekSesi:                 ['*'],
  ping:                    ['*'],
  hapusFotoProfil:         ['*'],
  getDaftarUMKM:           ['*'],
  getAllConfig:            ['*'],
  updateProfil:            ['*'],
  uploadFoto:              ['*'],
  getDashboardOrganisasi:  ['Admin', 'UT'],
  getDashboardUMKM:        ['*'],

  // — Admin saja —
  addUMKM:                 ['Admin'],
  updateUMKM:              ['Admin'],
  deleteUMKM:              ['Admin'],
  setStatusAktifUMKM:      ['Admin'],
  saveKemandirian:         ['Admin'],
  addFasilitasi:           ['Admin'],
  addPrestasi:             ['Admin'],
  updatePrestasi:          ['Admin'],
  deletePrestasi:          ['Admin'],
  uploadLaporanCSR:        ['Admin'],
  deleteLaporanCSR:        ['Admin'],
  getAllUsers:             ['Admin'],
  updateUser:              ['Admin'],
  setStatusAkses:          ['Admin'],
  deleteUser:              ['Admin'],
  setConfig:               ['Admin'],
  deleteOmset:             ['Admin', 'UMKM'],

  // — Admin & CSR UT (pemantauan) —
  getAllOmset:             ['Admin', 'UT'],
  getRiwayatOmsetUMKM:     ['Admin', 'UT', 'UMKM'],
  getStatusClosing:        ['Admin', 'UT', 'UMKM'],
  getAllClosing:           ['Admin', 'UT'],
  setClosing:              ['Admin', 'UMKM'],
  bukaClosing:             ['Admin'],
  setPeriodeAktif:         ['Admin'],
  getBackupData:           ['Admin'],
  resetPassword:           ['Admin'],
  resetPasswordFirebase:   ['Admin'],
  buatKredensialUMKM:      ['Admin'],
  hapusKredensial:         ['Admin'],
  pindahKredensial:        ['Admin'],
  hapusBerkasFoto:         ['*'],
  gantiPasswordSendiri:    ['*'],
  unggahBerkasLaporan:     ['Admin'],
  hapusBerkasLaporan:      ['Admin'],
  getAllTenagaKerja:       ['Admin', 'UT'],
  getAllKelasKemandirian:  ['Admin', 'UT'],
  getAllFasilitasi:        ['Admin', 'UT', 'UMKM'],
  getAllLegalitas:         ['Admin', 'UT'],
  getLegalitasUMKM:        ['Admin', 'UT', 'UMKM'],
  addLegalitas:            ['Admin'],
  updateLegalitas:         ['Admin'],
  deleteLegalitas:         ['Admin'],
  getAllPrestasi:          ['Admin', 'UT'],
  getAllLaporanCSR:        ['Admin', 'UT'],
  getPerformaTerbaik:      ['Admin', 'UT'],

  // — Data per-UMKM (UMKM hanya boleh data miliknya, dijaga tambahan di bawah) —
  getOmsetUMKM:            ['Admin', 'UT', 'UMKM'],
  saveOmset:               ['Admin', 'UMKM'],
  getTenagaKerjaUMKM:      ['Admin', 'UT', 'UMKM'],
  saveTenagaKerja:         ['Admin', 'UMKM'],
  getKelasKemandirianUMKM: ['Admin', 'UT', 'UMKM'],
  getUMKMByKode:           ['*']
};

/** Action yang argumen pertamanya adalah kode UMKM — dipakai untuk
 *  memastikan pengguna UMKM tidak bisa mengintip data UMKM lain. */
// PENTING: hanya masukkan action yang argumen PERTAMANYA benar-benar
// berupa KODE UMKM (teks). Action seperti saveOmset & saveTenagaKerja
// argumen pertamanya adalah OBJEK data — bila ikut diperiksa di sini,
// perbandingannya menjadi "[object Object]" vs kode UMKM sehingga SELALU
// ditolak. Keduanya sudah punya pemeriksaan sendiri (lihat di bawah,
// membaca record.IDUMKM) yang memang tepat untuk bentuk datanya.
const AKSI_TERIKAT_UMKM = [
  'getOmsetUMKM', 'getTenagaKerjaUMKM', 'getLegalitasUMKM', 'getRiwayatOmsetUMKM',
  'getStatusClosing', 'setClosing',
  'getKelasKemandirianUMKM', 'getUMKMByKode', 'deleteOmset'
];

function doGet(e) {
  // Endpoint GET hanya untuk cek kesehatan layanan. SEMUA data dilayani
  // lewat POST agar token sesi tidak pernah tercatat di log URL server.
  return buildResponse({
    success: true,
    data: { app: APP_NAME, versi: APP_VERSION, status: 'aktif' },
    message: 'SIPUMA API aktif. Gunakan POST untuk seluruh operasi data.'
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return buildResponse(createResponse(false, null, 'Permintaan kosong.'));
    }
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;
    if (!action) return buildResponse(createResponse(false, null, 'Action tidak disebutkan.'));

    // ── Login: satu-satunya action yang boleh tanpa token ──
    if (action === 'login') return buildResponse(apiLogin(payload));
    // Login versi Firebase: memverifikasi lalu menerbitkan Custom Token.
    // Sama seperti login biasa, action ini boleh dipanggil tanpa token.
    if (action === 'loginFirebase') return buildResponse(apiLoginFirebase(payload));
    // Menerbitkan sesi GAS dari token Firebase. Seperti login, action ini
    // boleh dipanggil tanpa token GAS — justru itu gunanya.
    if (action === 'sesiDariToken') return buildResponse(apiSesiDariToken(payload.idToken));

    // ── Selain login: token WAJIB dan diverifikasi di server ──
    const sesi = ambilSesi(payload.token);
    if (!sesi) {
      return buildResponse({
        success: false, data: null, sesiHabis: true,
        message: 'Sesi Anda sudah berakhir atau tidak sah. Silakan login kembali.'
      });
    }

    // ── Cek izin peran ──
    const izin = IZIN_AKSI[action];
    if (!izin) return buildResponse(createResponse(false, null, 'Action "' + action + '" tidak dikenal.'));
    if (izin.indexOf('*') === -1 && izin.indexOf(sesi.role) === -1) {
      return buildResponse(createResponse(false, null, 'Anda tidak memiliki hak akses untuk tindakan ini.'));
    }

    // ── Penjagaan tambahan: pengguna UMKM hanya boleh menyentuh datanya sendiri ──
    if (sesi.role === 'UMKM' && AKSI_TERIKAT_UMKM.indexOf(action) > -1) {
      const kodeDiminta = String((payload.args && payload.args[0]) || '');
      if (kodeDiminta && kodeDiminta !== String(sesi.idUmkm)) {
        return buildResponse(createResponse(false, null, 'Anda hanya dapat mengakses data usaha Anda sendiri.'));
      }
    }
    if (sesi.role === 'UMKM' && action === 'saveOmset') {
      const rec = (payload.args && payload.args[0]) || {};
      if (rec.IDUMKM && String(rec.IDUMKM) !== String(sesi.idUmkm)) {
        return buildResponse(createResponse(false, null, 'Anda hanya dapat menyimpan data usaha Anda sendiri.'));
      }
    }
    if (sesi.role === 'UMKM' && action === 'saveTenagaKerja') {
      const rec = (payload.args && payload.args[0]) || {};
      if (rec.IDUMKM && String(rec.IDUMKM) !== String(sesi.idUmkm)) {
        return buildResponse(createResponse(false, null, 'Anda hanya dapat menyimpan data usaha Anda sendiri.'));
      }
    }

    return buildResponse(jalankanAksi(action, payload, sesi));
  } catch (err) {
    return buildResponse(createResponse(false, null, 'Kesalahan server: ' + err.message));
  }
}

/** Peta action → fungsi logika bisnis yang sudah ada. */
function jalankanAksi(action, payload, sesi) {
  const a = (payload.args) || [];
  switch (action) {
    // Sesi
    case 'logout':                  return apiLogout(sesi);
    case 'cekSesi':                 return apiCekSesi(sesi);
    case 'ping':                    return createResponse(true, { waktu: new Date().toISOString() }, 'Terhubung');
    case 'hapusFotoProfil':         return hapusFotoProfil(sesi);
    case 'getAllConfig':            return getAllConfig();
    case 'setConfig':               return setConfig(a[0], a[1]);

    // Data Master UMKM
    case 'getDaftarUMKM':           return getDaftarUMKM();
    case 'getUMKMByKode':           return getUMKMByKode(a[0]);
    case 'addUMKM':                 return addUMKM(a[0]);
    case 'updateUMKM':              return updateUMKM(a[0]);
    case 'deleteUMKM':              return deleteUMKM(a[0]);
    case 'setStatusAktifUMKM':      return setStatusAktifUMKM(a[0], a[1]);

    // Omset
    case 'getOmsetUMKM':            return getOmsetUMKM(a[0], a[1]);
    case 'saveOmset':               return saveOmset(a[0]);
    case 'deleteOmset':             return deleteOmset(a[0], a[1]);
    case 'getAllOmset':             return getAllOmset();
    case 'getRiwayatOmsetUMKM':     return getRiwayatOmsetUMKM(sesi.role === 'UMKM' ? sesi.idUmkm : a[0]);

    // Closing periode
    case 'getStatusClosing':        return getStatusClosing(sesi.role === 'UMKM' ? sesi.idUmkm : a[0], a[1]);
    case 'getAllClosing':           return getAllClosing();
    case 'setClosing':              return setClosing(sesi.role === 'UMKM' ? sesi.idUmkm : a[0], a[1], a[2], sesi.username);
    case 'bukaClosing':             return bukaClosing(a[0], a[1], a[2]);
    case 'setPeriodeAktif':         return setPeriodeAktif(a[0]);
    case 'getBackupData':           return getBackupData();
    case 'resetPassword':           return apiResetPassword(a[0], a[1]);
    case 'resetPasswordFirebase':   return apiResetPasswordFirebase(a[0], a[1]);
    case 'buatKredensialUMKM':      return apiBuatKredensialUMKM(a[0], a[1], a[2]);
    case 'hapusKredensial':         return apiHapusKredensial(a[0]);
    case 'pindahKredensial':        return apiPindahKredensial(a[0], a[1]);
    case 'hapusBerkasFoto':         return apiHapusBerkasFoto(a[0]);
    case 'gantiPasswordSendiri':    return apiGantiPasswordSendiri(sesi.username, a[0], a[1]);
    case 'unggahBerkasLaporan':     return apiUnggahBerkasLaporan(a[0], a[1], a[2], a[3]);
    case 'hapusBerkasLaporan':      return apiHapusBerkasLaporan(a[0]);

    // Tenaga Kerja
    case 'getTenagaKerjaUMKM':      return getTenagaKerjaUMKM(a[0], a[1]);
    case 'saveTenagaKerja':         return saveTenagaKerja(a[0]);
    case 'getAllTenagaKerja':       return getAllTenagaKerja();

    // Kemandirian
    case 'getKelasKemandirianUMKM': return getKelasKemandirianUMKM(a[0]);
    case 'saveKemandirian':         return saveKelasKemandirian(a[0]);
    case 'getAllKelasKemandirian':  return getAllKelasKemandirian();

    // Fasilitasi
    case 'getAllFasilitasi':        return getAllFasilitasi();

    // Legalitas
    case 'getAllLegalitas':         return getAllLegalitas();
    case 'getLegalitasUMKM':        return getLegalitasUMKM(sesi.role === 'UMKM' ? sesi.idUmkm : a[0]);
    case 'addLegalitas':            return addLegalitas(a[0]);
    case 'updateLegalitas':         return updateLegalitas(a[0]);
    case 'deleteLegalitas':         return deleteLegalitas(a[0]);
    case 'addFasilitasi':           return addFasilitasi(a[0]);

    // Prestasi
    case 'getAllPrestasi':          return getAllPrestasi();
    case 'addPrestasi':             return addPrestasi(a[0]);
    case 'updatePrestasi':          return updatePrestasi(a[0]);
    case 'deletePrestasi':          return deletePrestasi(a[0]);
    case 'getPerformaTerbaik':      return getPerformaTerbaik(a[0], a[1]);

    // Laporan CSR
    case 'getAllLaporanCSR':        return getAllLaporanCSR();
    case 'uploadLaporanCSR':        return uploadLaporanCSR(a[0], a[1], a[2], a[3]);
    case 'deleteLaporanCSR':        return deleteLaporanCSR(a[0]);

    // Manajemen User
    case 'getAllUsers':             return getAllUsersAman();
    case 'updateUser':              return updateUserCredential(a[0]);
    case 'setStatusAkses':          return setStatusAksesLogin(a[0], a[1], a[2]);
    case 'deleteUser':              return deleteUser(a[0]);

    // Dashboard
    case 'getDashboardOrganisasi':  return getDashboardOrganisasi(a[0]);
    case 'getDashboardUMKM':        return getDashboardUMKM(sesi.role === 'UMKM' ? sesi.idUmkm : a[0], a[1]);

    // Profil
    case 'updateProfil':            return updateProfilSesuaiPeran(sesi, a[0], a[1]);
    case 'uploadFoto':              return uploadFotoProfil(a[0], a[1], a[2], a[3]);

    default: return createResponse(false, null, 'Action "' + action + '" belum diimplementasikan.');
  }
}

/**
 * Versi aman dari getAllUsers — kolom rahasia (PasswordHash, Salt, dan
 * sisa password teks biasa) DIBUANG sebelum dikirim ke browser. Tanpa ini,
 * daftar user di Manajemen User akan ikut membawa data kredensial.
 */
function getAllUsersAman() {
  try {
    const rows = readSheetAsObjects('UserCredentials').map(function (u) {
      const bersih = {};
      Object.keys(u).forEach(function (k) {
        if (k !== 'PasswordHash' && k !== 'Salt' && k !== 'KodeUnik') bersih[k] = u[k];
      });
      return bersih;
    });
    return createResponse(true, rows, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

/** Arahkan pembaruan profil ke fungsi yang sesuai dengan peran pengguna. */
function updateProfilSesuaiPeran(sesi, alamat, fotoURL) {
  if (sesi.role === 'UMKM') return updateProfilUMKM(sesi.idUmkm, alamat, fotoURL);
  return updateProfilCSRorAdmin(sesi.username, alamat, fotoURL);
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Pastikan sheet "Sesi" tersedia — jalankan sekali saat menyiapkan API. */
function siapkanSheetSesi() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Sesi');
  if (!sheet) {
    sheet = ss.insertSheet('Sesi');
    sheet.appendRow(['Token', 'Username', 'Role', 'IDUMKM', 'DibuatPada', 'KedaluwarsaPada']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0284C7').setFontColor('#ffffff');
    Logger.log('✅ Sheet "Sesi" berhasil dibuat.');
  } else {
    Logger.log('ℹ️  Sheet "Sesi" sudah ada, tidak dibuat ulang.');
  }
  return sheet;
}

/**
 * SATU TOMBOL untuk menyiapkan seluruh keamanan versi API.
 * Jalankan SEKALI dari Apps Script Editor setelah menempel Kode.gs baru.
 */
function siapkanKeamananAPI() {
  Logger.log('🔐 Menyiapkan keamanan SIPUMA versi API...');
  Logger.log('');
  Logger.log('1️⃣  Membuat sheet Sesi & Legalitas...');
  siapkanSheetSesi();
  siapkanSheetLegalitas();
  siapkanSheetClosing();
  Logger.log('');
  Logger.log('2️⃣  Mengubah password menjadi hash...');
  migrasiPasswordKeHash();
  Logger.log('');
  Logger.log('✅ SELESAI. Langkah berikutnya:');
  Logger.log('   a. Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)');
  Logger.log('   b. Salin URL /exec ke js/config.js di frontend');
  Logger.log('   c. Uji login ketiga peran di aplikasi baru');
  Logger.log('   d. Setelah semua peran terbukti bisa login, jalankan:');
  Logger.log('      kosongkanPasswordTeksBiasa()');
}

function setupAppEnvironment() {
  try {
    // 1. Folder utama di Drive
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    const mainFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);

    // 2. Sub-folder untuk file laporan CSR & foto profil
    const laporanFolder = getOrCreateSubFolder(mainFolder, 'Laporan_CSR');
    const fotoFolder = getOrCreateSubFolder(mainFolder, 'Foto_Profil');

    // 3. Spreadsheet database
    let ss;
    const files = mainFolder.getFilesByName(SS_NAME);
    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      ss = SpreadsheetApp.create(SS_NAME);
      DriveApp.getFileById(ss.getId()).moveTo(mainFolder);
    }

    // 4. Buat semua sheet + dummy data contoh
    createSheetIfNotExists(ss, 'DataMasterUMKM', SHEET_HEADERS.DataMasterUMKM, [
      ['0001','Dapoer Berkah Cakung','KUL0014','Kuliner','Nasi box & katering harian','01/03/2025','Cakung, Kota Jakarta Timur','', new Date()],
      ['0002','Batik Canting Mas Cakung','KRJ0007','Kerajinan','Batik tulis & cetak','15/06/2024','Cakung, Kota Jakarta Timur','', new Date()],
      ['0003','Keripik Singkong Barokah Jaya','KUL0015','Kuliner','Keripik singkong aneka rasa','20/01/2025','Cakung, Kota Jakarta Timur','', new Date()]
    ]);

    createSheetIfNotExists(ss, 'OmsetBulanan', SHEET_HEADERS.OmsetBulanan, [
      [generateShortId(),'KUL0014','Dapoer Berkah Cakung',2026,180000000,14000000,15500000,17000000,19000000,22000000,18000000,18000000,19000000,0,0,0,0,142500000,'Belum Tercapai']
    ]);

    createSheetIfNotExists(ss, 'TenagaKerja', SHEET_HEADERS.TenagaKerja, [
      [generateShortId(),'KUL0014','Dapoer Berkah Cakung','Agu',2026,6,'+2 karyawan baru warga RW 04']
    ]);

    createSheetIfNotExists(ss, 'KelasKemandirian', SHEET_HEADERS.KelasKemandirian, [
      [generateShortId(),'KUL0014','Dapoer Berkah Cakung',75,65,65,68.5,'Pra Mandiri','Kapasitas produksi stabil, SOP dapur bersih terpenuhi.','Penjualan offline kuat, kanal Instagram aktif.','Pencatatan kas harian tertib via SIPUMA.','Diikutsertakan dalam Pelatihan Digital Marketing Intensif & Sertifikasi Halal BPJPH Batch 3','15/07/2026','Siti Rahmawati']
    ]);

    createSheetIfNotExists(ss, 'FasilitasiPemasaran', SHEET_HEADERS.FasilitasiPemasaran, [
      [generateShortId(),'PT United Tractors Tbk','KUL0014','Dapoer Berkah Cakung','Tenant Bazar Kuliner Akbar HUT UT ke-54',7500000,'20/07/2026','Transaksi langsung selama 3 hari pameran']
    ]);

    createSheetIfNotExists(ss, 'CatatanPrestasi', SHEET_HEADERS.CatatanPrestasi, [
      [generateShortId(),'KUL0014','Dapoer Berkah Cakung','Agu',2026,'Meningkatkan kapasitas produksi dan merekrut 2 tenaga kerja baru warga RW 04 Cakung Barat setelah penambahan pesanan katering korporat.','Produksi','18/08/2026','']
    ]);

    createSheetIfNotExists(ss, 'LaporanCSR', SHEET_HEADERS.LaporanCSR, []);

    createSheetIfNotExists(ss, 'UserCredentials', SHEET_HEADERS.UserCredentials, [
      ['Admin','admin#2026','Admin','', 'Allowed','', true, new Date(), new Date(),'Akun default admin','',''],
      ['Tim CSR UT','csrut#2026','UT','', 'Allowed','', true, new Date(), new Date(),'Akun default CSR United Tractors','',''],
      ['Dapoer Berkah Cakung','KUL0014','UMKM','KUL0014','Allowed','', true, new Date(), new Date(),'','',''],
      ['Batik Canting Mas Cakung','KRJ0007','UMKM','KRJ0007','Allowed','', true, new Date(), new Date(),'','',''],
      ['Keripik Singkong Barokah Jaya','KUL0015','UMKM','KUL0015','Allowed','', true, new Date(), new Date(),'','','']
    ]);

    createSheetIfNotExists(ss, 'AppConfig', ['Key','Value'], [
      ['appName', APP_NAME],
      ['appFullName', APP_FULL_NAME],
      ['folderId', mainFolder.getId()],
      ['laporanFolderId', laporanFolder.getId()],
      ['fotoFolderId', fotoFolder.getId()],
      ['spreadsheetId', ss.getId()],
      ['tahunAktif', 2026],
      ['targetFasilitasiTahunan', 800000000],
      ['adminEmail', Session.getActiveUser().getEmail()]
    ]);

    // Simpan Spreadsheet ID ke Script Properties agar akses cepat
    PropertiesService.getScriptProperties().setProperty('spreadsheetId', ss.getId());

    // Hapus Sheet1 default
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

    Logger.log('✅ Setup SIPUMA selesai!');
    Logger.log('📁 Folder: ' + mainFolder.getUrl());
    Logger.log('📊 Spreadsheet: ' + ss.getUrl());

    return createResponse(true, { folderId: mainFolder.getId(), spreadsheetId: ss.getId(), url: ss.getUrl() }, 'Setup berhasil! SIPUMA siap dipakai.');
  } catch (error) {
    Logger.log('❌ Error setup: ' + error.message);
    return createResponse(false, null, error.message);
  }
}

function getOrCreateSubFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function createSheetIfNotExists(ss, sheetName, headers, dataRows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    (dataRows || []).forEach(row => sheet.appendRow(row));
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0284C7').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    try { headers.forEach((_, i) => sheet.autoResizeColumn(i + 1)); } catch (e) {}
  }
  return sheet;
}

// ════════════════════════════════════════════════════════
// AKSES SPREADSHEET & KONFIGURASI
// ════════════════════════════════════════════════════════
function getSpreadsheet() {
  let ssId = PropertiesService.getScriptProperties().getProperty('spreadsheetId');
  if (!ssId) {
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (!folders.hasNext()) throw new Error('Aplikasi belum di-setup. Jalankan fungsi setupAppEnvironment() terlebih dahulu.');
    const files = folders.next().getFilesByName(SS_NAME);
    if (!files.hasNext()) throw new Error('Database belum ditemukan. Jalankan fungsi setupAppEnvironment() terlebih dahulu.');
    ssId = files.next().getId();
    PropertiesService.getScriptProperties().setProperty('spreadsheetId', ssId);
  }
  return SpreadsheetApp.openById(ssId);
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sheet;
}

function getConfig(key) {
  try {
    const data = getSheet('AppConfig').getDataRange().getValues();
    const row = data.find(r => r[0] === key);
    return row ? row[1] : null;
  } catch (e) { return null; }
}

function setConfig(key, value) {
  try {
    const sheet = getSheet('AppConfig');
    const data = sheet.getDataRange().getValues();
    const idx = data.findIndex(r => r[0] === key);
    if (idx >= 0) sheet.getRange(idx + 1, 2).setValue(value);
    else sheet.appendRow([key, value]);
    return createResponse(true, null, 'Konfigurasi disimpan.');
  } catch (error) { return createResponse(false, null, error.message); }
}

function getAllConfig() {
  try {
    const data = getSheet('AppConfig').getDataRange().getValues();
    const config = {};
    data.slice(1).forEach(row => config[row[0]] = row[1]);
    return createResponse(true, config, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

// ════════════════════════════════════════════════════════
// HELPER BACA/TULIS SHEET GENERIK (batch)
// ════════════════════════════════════════════════════════
/**
 * PENYEMPURNAAN KECEPATAN (prinsip Server-Side Caching): sebelum membaca
 * sheet langsung (yang perlu waktu ~200-800ms), cek dulu apakah hasilnya
 * sudah pernah disimpan sementara (cache) beberapa detik terakhir — kalau
 * ada, langsung kembalikan dari cache (hanya beberapa milidetik). Cache
 * otomatis "basi" sendiri setelah CACHE_TTL_DETIK, dan juga langsung
 * dihapus paksa setiap ada data BARU ditulis (lihat invalidasiCacheSheet)
 * — jadi data yang ditampilkan tidak akan pernah lebih dari sedikit detik
 * ketinggalan dari data sungguhan di sheet.
 */
const CACHE_TTL_DETIK = 120;
function readSheetAsObjects(sheetName) {
  const cache = CacheService.getScriptCache();
  const kunciCache = 'sheet_' + sheetName;
  try {
    const tersimpan = cache.get(kunciCache);
    if (tersimpan) return JSON.parse(tersimpan);
  } catch (error) {
    // Cache bermasalah (jarang terjadi) — lanjut baca langsung dari sheet
    // di bawah, jangan sampai ini menghentikan aplikasi.
  }

  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  let hasil = [];
  if (values.length > 1) {
    const headers = values[0];
    hasil = values.slice(1).map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, c) => obj[h] = row[c]);
      return obj;
    });
  }
  try {
    // CacheService punya batas ukuran ~100KB per kunci — kalau data
    // sheet ini kebetulan lebih besar dari itu, put() akan gagal; kita
    // biarkan saja (tanpa cache untuk sheet itu), tidak menghentikan
    // aplikasi sama sekali.
    cache.put(kunciCache, JSON.stringify(hasil), CACHE_TTL_DETIK);
  } catch (error) { /* lewati cache untuk sheet ini, tidak masalah */ }
  return hasil;
}

/** Hapus cache satu sheet secara paksa — dipanggil setiap ada data BARU
 * ditulis/diubah/dihapus, supaya pembaca BERIKUTNYA selalu dapat data
 * terbaru walau belum sampai CACHE_TTL_DETIK. */
function invalidasiCacheSheet(sheetName) {
  try { CacheService.getScriptCache().remove('sheet_' + sheetName); } catch (error) { /* abaikan */ }
}

function writeRow(sheetName, rowArray) {
  getSheet(sheetName).appendRow(rowArray.map(amankanTeks));
  invalidasiCacheSheet(sheetName);
}

/**
 * Mencegah Google Sheets salah membaca teks bebas (catatan, alamat, dsb)
 * sebagai RUMUS. Kalau teks diawali karakter =, +, -, atau @, Sheets akan
 * mencoba menafsirkannya sebagai formula dan gagal (muncul "#ERROR!").
 * Menambahkan tanda kutip (') di depan memaksa Sheets memperlakukannya
 * sebagai teks biasa — persis seperti trik manual mengetik tanda kutip
 * di awal sel, dan tanda kutipnya sendiri TIDAK ikut tersimpan/tampil.
 */
function amankanTeks(nilai) {
  if (typeof nilai === 'string' && /^[=+\-@]/.test(nilai)) {
    return "'" + nilai;
  }
  return nilai;
}

// ════════════════════════════════════════════════════════
// AUTENTIKASI & SESI
// ════════════════════════════════════════════════════════

/**
 * Login multi-role: Admin, UMKM, UT (CSR United Tractors).
 * Validasi bertahap: (1) username & password cocok, (2) status akses = Allowed.
 */

// ════════════════════════════════════════════════════════
// MODUL: DATA MASTER UMKM (Admin)
// ════════════════════════════════════════════════════════
function getDaftarUMKM() {
  // PENTING: kembalikan data sebagai STRING JSON (bukan array-of-objects
  // mentah) — terbukti dari pengujian langsung bahwa Apps Script's
  // google.script.run punya bug/keterbatasan mengirim balik array berisi
  // objek dengan field Date secara langsung (hasilnya jadi null di sisi
  // klien, walau eksekusi di server sendiri berhasil sempurna). Mengonversi
  // ke string JSON di sini (lalu di-parse lagi di klien) menghindari
  // mekanisme serialisasi otomatis yang bermasalah itu sepenuhnya.
  try {
    const data = readSheetAsObjects('DataMasterUMKM');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function getUMKMByKode(kodeUnik) {
  try {
    const umkm = readSheetAsObjects('DataMasterUMKM').find(u => u.KodeUnik === kodeUnik);
    return createResponse(!!umkm, umkm || null, umkm ? 'OK' : 'UMKM tidak ditemukan.');
  } catch (error) { return createResponse(false, null, error.message); }
}

function generateKodeUnik(sektor) {
  const prefix = SEKTOR_KODE[sektor] || 'UMK';
  const existing = readSheetAsObjects('DataMasterUMKM')
    .map(u => u.KodeUnik)
    .filter(k => String(k).startsWith(prefix));
  let maxNum = 0;
  existing.forEach(k => {
    const n = parseInt(String(k).replace(prefix, ''), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  const next = (maxNum + 1).toString().padStart(4, '0');
  return prefix + next;
}

/**
 * Ubah teks tanggal dari klien menjadi objek Date yang benar untuk ditulis
 * ke sheet. Mendukung 2 format teks (BUKAN objek Date — google.script.run
 * tidak bisa mengirim objek Date sebagai properti di dalam objek argumen):
 * - 'YYYY-MM'    → Bulan & Tahun saja (dipakai kolom "Dibina Sejak"),
 *                  otomatis dianggap tanggal 1 di bulan tersebut.
 * - 'YYYY-MM-DD' → tanggal lengkap (dipakai kolom tanggal lainnya).
 */
function parseTanggalDariKlien(str, fallback) {
  if (!str) return fallback || new Date();
  const teksLengkap = /^\d{4}-\d{2}$/.test(str) ? (str + '-01') : str;
  const d = new Date(teksLengkap + 'T00:00:00');
  return isNaN(d.getTime()) ? (fallback || new Date()) : d;
}

/**
 * UMKM dianggap AKTIF kecuali ditandai tidak aktif secara eksplisit.
 * Penting: baris lama (dibuat sebelum kolom StatusAktif ada) bernilai
 * kosong — dan itu harus tetap dihitung AKTIF, bukan malah hilang.
 */
// ════════════════════════════════════════════════════════
// MODUL: CLOSING PERIODE (Kunci Data Omset & Tenaga Kerja)
// ════════════════════════════════════════════════════════
// Setelah UMKM selesai mengisi satu tahun penuh, datanya dapat "di-closing"
// agar tidak berubah lagi. Penguncian ini ditegakkan DI SERVER — bukan
// sekadar menyembunyikan tombol di layar — sehingga tetap berlaku walau
// ada yang mencoba mengirim data secara langsung.
//
// Hanya Admin yang dapat MEMBUKA kembali closing.

/** Kunci baris closing: satu UMKM, satu tahun, satu jenis data. */
function kunciClosing(kodeUnik, tahun, jenis) {
  return String(kodeUnik) + '|' + String(tahun) + '|' + String(jenis);
}

/** true bila data (Omset / TenagaKerja) UMKM pada tahun itu sudah dikunci. */
const PENANDA_CLOSING_GLOBAL = '__SEMUA_UMKM__';

function apakahSudahClosing(kodeUnik, tahun, jenis) {
  try {
    const rows = readSheetAsObjects('PeriodeClosing');
    // Data dianggap terkunci bila SALAH SATU terpenuhi:
    //  (a) UMKM ini mengunci sendiri (self closing), ATAU
    //  (b) Admin mengunci SELURUH UMKM untuk tahun & jenis itu.
    return rows.some(function (r) {
      const cocokTarget = String(r.IDUMKM) === String(kodeUnik) ||
                          String(r.IDUMKM) === PENANDA_CLOSING_GLOBAL;
      return cocokTarget &&
             Number(r.Tahun) === Number(tahun) &&
             String(r.Jenis) === String(jenis) &&
             String(r.Status) === 'Closed';
    });
  } catch (e) {
    // Bila sheet belum ada, anggap belum ada yang dikunci — jangan sampai
    // ketiadaan sheet malah memblokir seluruh penyimpanan data.
    return false;
  }
}

/** Status closing satu UMKM pada satu tahun (untuk ditampilkan di layar). */
function apakahClosingGlobal(tahun, jenis) {
  try {
    return readSheetAsObjects('PeriodeClosing').some(function (r) {
      return String(r.IDUMKM) === PENANDA_CLOSING_GLOBAL &&
             Number(r.Tahun) === Number(tahun) &&
             String(r.Jenis) === String(jenis) &&
             String(r.Status) === 'Closed';
    });
  } catch (e) { return false; }
}

function getStatusClosing(kodeUnik, tahun) {
  try {
    const th = Number(tahun) || Number(getConfig('tahunAktif')) || new Date().getFullYear();
    const globalOmset = apakahClosingGlobal(th, 'Omset');
    const globalTk    = apakahClosingGlobal(th, 'TenagaKerja');
    return createResponse(true, {
      tahun: th,
      omset:        apakahSudahClosing(kodeUnik, th, 'Omset'),
      tenagaKerja:  apakahSudahClosing(kodeUnik, th, 'TenagaKerja'),
      // Membedakan sumber penguncian, agar tampilan bisa menjelaskan
      // apakah dikunci sendiri oleh UMKM atau serentak oleh Admin.
      globalOmset:       globalOmset,
      globalTenagaKerja: globalTk
    }, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

/** Seluruh catatan closing (dipakai Admin untuk pemantauan). */
function getAllClosing() {
  try {
    return createResponse(true, readSheetAsObjects('PeriodeClosing'), 'OK');
  } catch (error) { return createResponse(true, [], 'OK'); }
}

/**
 * Kunci data satu UMKM untuk satu tahun.
 * jenis: 'Omset' | 'TenagaKerja' | 'Semua'
 */
function setClosing(kodeUnik, tahun, jenis, olehSiapa) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const th = Number(tahun);
    if (!kodeUnik || !th) throw new Error('UMKM dan tahun wajib diisi.');

    const daftarJenis = (jenis === 'Semua') ? ['Omset', 'TenagaKerja'] : [jenis];
    const global = String(kodeUnik) === PENANDA_CLOSING_GLOBAL;
    const umkm = global ? null : readSheetAsObjects('DataMasterUMKM').find(function (u) {
      return String(u.KodeUnik) === String(kodeUnik);
    });

    daftarJenis.forEach(function (j) {
      if (apakahSudahClosing(kodeUnik, th, j)) return;   // sudah terkunci, lewati
      writeRow('PeriodeClosing', [
        generateShortId(), kodeUnik, global ? '(SELURUH UMKM)' : (umkm ? umkm.NamaUMKM : ''), th, j,
        'Closed', new Date(), olehSiapa || '', ''
      ]);
    });
    invalidasiCacheSheet('PeriodeClosing');
    return createResponse(true, { kodeUnik: kodeUnik, tahun: th, jenis: jenis, global: global },
      global
        ? 'Seluruh UMKM berhasil dikunci untuk tahun ' + th + '. Tidak ada yang dapat mengubah data tahun ini sampai Admin membukanya.'
        : 'Data tahun ' + th + ' berhasil dikunci (closing).');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

/** Buka kembali kunci — HANYA Admin (dibatasi lewat IZIN_AKSI). */
function bukaClosing(kodeUnik, tahun, jenis) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const th = Number(tahun);
    const sheet = getSheet('PeriodeClosing');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const cI = headers.indexOf('IDUMKM'), cT = headers.indexOf('Tahun'), cJ = headers.indexOf('Jenis');

    let dihapus = 0;
    for (let i = values.length - 1; i > 0; i--) {
      const cocokJenis = (jenis === 'Semua') || String(values[i][cJ]) === String(jenis);
      if (String(values[i][cI]) === String(kodeUnik) && Number(values[i][cT]) === th && cocokJenis) {
        sheet.deleteRow(i + 1);
        dihapus++;
      }
    }
    invalidasiCacheSheet('PeriodeClosing');
    if (!dihapus) return createResponse(false, null, 'Tidak ada data closing yang cocok untuk dibuka.');
    return createResponse(true, null, 'Kunci data tahun ' + th + ' berhasil dibuka. Data dapat diubah kembali.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

/** Ubah periode (tahun) aktif aplikasi — hanya Admin. */
function setPeriodeAktif(tahun) {
  try {
    const th = Number(tahun);
    if (!th || th < 2020 || th > 2100) throw new Error('Tahun periode tidak masuk akal.');
    setConfig('tahunAktif', th);
    return createResponse(true, { tahunAktif: th },
      'Periode aktif aplikasi berhasil diubah ke tahun ' + th + '. ' +
      'Seluruh data tahun sebelumnya tetap tersimpan dan dapat dilihat lewat filter tahun.');
  } catch (error) { return createResponse(false, null, error.message); }
}

/**
 * Ambil SELURUH isi basis data untuk keperluan cadangan (backup).
 * Sengaja TIDAK menyertakan kolom kredensial (PasswordHash, Salt,
 * KodeUnik pada UserCredentials) maupun sheet Sesi — berkas cadangan
 * sering tersimpan di komputer pribadi, jadi tidak boleh membawa
 * data yang dapat dipakai masuk ke sistem.
 */
function getBackupData() {
  try {
    const ss = getSpreadsheet();
    const hasil = {};
    const dilewati = ['Sesi'];
    const kolomRahasia = ['PasswordHash', 'Salt', 'KodeUnik'];

    ss.getSheets().forEach(function (sheet) {
      const nama = sheet.getName();
      if (dilewati.indexOf(nama) > -1) return;

      const values = sheet.getDataRange().getValues();
      if (!values.length) { hasil[nama] = { headers: [], rows: [] }; return; }

      let headers = values[0].map(String);
      let indeksBuang = [];
      if (nama === 'UserCredentials') {
        headers.forEach(function (h, i) {
          if (kolomRahasia.indexOf(h) > -1) indeksBuang.push(i);
        });
        headers = headers.filter(function (h, i) { return indeksBuang.indexOf(i) === -1; });
      }

      const rows = values.slice(1).map(function (r) {
        const bersih = r.filter(function (v, i) { return indeksBuang.indexOf(i) === -1; });
        return bersih.map(function (v) {
          return (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd') : v;
        });
      });
      hasil[nama] = { headers: headers, rows: rows };
    });

    return createResponse(true, {
      namaAplikasi: getConfig('namaAplikasi') || APP_NAME,
      waktuBackup: new Date().toISOString(),
      jumlahSheet: Object.keys(hasil).length,
      sheets: hasil
    }, 'Data cadangan berhasil disiapkan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * Ganti username akun Stakeholder (peran UT) langsung dari kode.
 * Username akun sistem sengaja dikunci di aplikasi; penggantian dilakukan
 * sekali lewat fungsi ini agar terkendali.
 *
 * Ubah nilai NAMA_BARU di bawah bila sewaktu-waktu perlu diganti lagi.
 */
function gantiUsernameStakeholder() {
  const NAMA_BARU = 'Tim CSR';

  const sheet = getSheet('UserCredentials');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const kUser = headers.indexOf('Username');
  const kRole = headers.indexOf('Role');

  const rowIdx = values.findIndex(function (r, i) {
    return i > 0 && String(r[kRole]) === 'UT';
  });
  if (rowIdx === -1) {
    Logger.log('❌ Akun dengan peran UT tidak ditemukan.');
    return;
  }

  const namaLama = String(values[rowIdx][kUser]);
  if (namaLama === NAMA_BARU) {
    Logger.log('ℹ️  Username sudah "' + NAMA_BARU + '", tidak ada yang diubah.');
    return;
  }

  // Pastikan nama baru belum dipakai akun lain
  const bentrok = values.some(function (r, i) {
    return i > 0 && i !== rowIdx && String(r[kUser]).toLowerCase() === NAMA_BARU.toLowerCase();
  });
  if (bentrok) {
    Logger.log('❌ Username "' + NAMA_BARU + '" sudah dipakai akun lain. Pilih nama lain.');
    return;
  }

  sheet.getRange(rowIdx + 1, kUser + 1).setValue(NAMA_BARU);
  invalidasiCacheSheet('UserCredentials');
  hapusSesiPengguna(namaLama);   // sesi lama menunjuk nama lama — akhiri

  Logger.log('✅ Username Stakeholder diubah: "' + namaLama + '" → "' + NAMA_BARU + '"');
  Logger.log('   Password TIDAK berubah — tetap yang terakhir Anda tetapkan.');
  Logger.log('   Sesi lama diakhiri; login ulang memakai username baru.');
}

/** Siapkan sheet PeriodeClosing bila belum ada. Aman diulang. */
function siapkanSheetClosing() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('PeriodeClosing');
  if (!sheet) {
    sheet = ss.insertSheet('PeriodeClosing');
    const h = SHEET_HEADERS.PeriodeClosing;
    sheet.appendRow(h);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, h.length).setFontWeight('bold').setBackground('#0284C7').setFontColor('#ffffff');
    Logger.log('✅ Sheet "PeriodeClosing" berhasil dibuat.');
  } else {
    Logger.log('ℹ️  Sheet "PeriodeClosing" sudah ada, tidak dibuat ulang.');
  }
  return sheet;
}

// ════════════════════════════════════════════════════════
// MODUL: LEGALITAS USAHA
// ════════════════════════════════════════════════════════

/**
 * Tentukan status sebuah legalitas berdasarkan masa berlakunya.
 *
 * Aturan yang disepakati:
 *  - Seumur hidup, ATAU sisa masa berlaku LEBIH dari 1 tahun  → "Aktif"
 *  - Sisa masa berlaku 1 tahun atau kurang (termasuk tepat di
 *    10 bulan menjelang kadaluarsa)                            → "Perlu Diperbarui"
 *  - Tanggal batas sudah terlewat                              → "Kadaluarsa"
 */
function hitungStatusLegalitas(row) {
  const seumurHidup = row.SeumurHidup === true ||
    String(row.SeumurHidup).toLowerCase() === 'true' ||
    String(row.SeumurHidup).toLowerCase() === 'ya';

  if (seumurHidup) {
    return { status: 'Aktif', sisaHari: null, seumurHidup: true };
  }
  if (!row.TanggalKadaluarsa) {
    // Tanpa tanggal kadaluarsa dan bukan seumur hidup → datanya belum lengkap
    return { status: 'Perlu Diperbarui', sisaHari: null, seumurHidup: false };
  }

  const kini = new Date(); kini.setHours(0, 0, 0, 0);
  const batas = new Date(row.TanggalKadaluarsa); batas.setHours(0, 0, 0, 0);
  const sisaHari = Math.round((batas - kini) / (1000 * 60 * 60 * 24));

  if (sisaHari < 0)    return { status: 'Kadaluarsa',       sisaHari: sisaHari, seumurHidup: false };
  if (sisaHari <= 365) return { status: 'Perlu Diperbarui', sisaHari: sisaHari, seumurHidup: false };
  return { status: 'Aktif', sisaHari: sisaHari, seumurHidup: false };
}

/** Lengkapi setiap baris legalitas dengan status hasil perhitungan. */
function lengkapiStatusLegalitas(rows) {
  return rows.map(function (r) {
    const s = hitungStatusLegalitas(r);
    r.Status = s.status;
    r.SisaHari = s.sisaHari;
    r.IsSeumurHidup = s.seumurHidup;
    return r;
  });
}

/** Seluruh legalitas (Admin & CSR UT). */
function getAllLegalitas() {
  try {
    return createResponse(true, lengkapiStatusLegalitas(readSheetAsObjects('Legalitas')), 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

/** Legalitas milik satu UMKM saja. */
function getLegalitasUMKM(kodeUnik) {
  try {
    const rows = readSheetAsObjects('Legalitas').filter(function (r) {
      return String(r.IDUMKM) === String(kodeUnik);
    });
    return createResponse(true, lengkapiStatusLegalitas(rows), 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function addLegalitas(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (!record.IDUMKM || !record.JenisLegalitas) {
      throw new Error('UMKM dan jenis legalitas wajib diisi.');
    }
    const seumurHidup = record.SeumurHidup === true || String(record.SeumurHidup) === 'true';
    if (!seumurHidup && !record.TanggalKadaluarsa) {
      throw new Error('Isi tanggal kadaluarsa, atau centang "Berlaku seumur hidup".');
    }
    writeRow('Legalitas', [
      generateShortId(),
      record.IDUMKM,
      record.NamaUMKM || '',
      record.JenisLegalitas,
      record.NomorLegalitas || '',
      record.TanggalTerbit ? parseTanggalDariKlien(record.TanggalTerbit) : '',
      seumurHidup ? '' : parseTanggalDariKlien(record.TanggalKadaluarsa),
      seumurHidup ? 'Ya' : 'Tidak',
      record.Penerbit || '',
      record.Catatan || '',
      new Date()
    ]);
    return createResponse(true, record, 'Data legalitas berhasil disimpan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function updateLegalitas(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (!record.ID) throw new Error('ID legalitas tidak ditemukan.');
    const seumurHidup = record.SeumurHidup === true || String(record.SeumurHidup) === 'true';
    if (!seumurHidup && !record.TanggalKadaluarsa) {
      throw new Error('Isi tanggal kadaluarsa, atau centang "Berlaku seumur hidup".');
    }
    const sheet = getSheet('Legalitas');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex(function (r, i) {
      return i > 0 && String(r[headers.indexOf('ID')]) === String(record.ID);
    });
    if (rowIdx === -1) throw new Error('Data legalitas tidak ditemukan.');

    const baris = headers.map(function (h) {
      if (h === 'ID') return record.ID;
      if (h === 'TanggalDicatat') return values[rowIdx][headers.indexOf('TanggalDicatat')];
      if (h === 'SeumurHidup') return seumurHidup ? 'Ya' : 'Tidak';
      if (h === 'TanggalKadaluarsa') return seumurHidup ? '' : parseTanggalDariKlien(record.TanggalKadaluarsa);
      if (h === 'TanggalTerbit') return record.TanggalTerbit ? parseTanggalDariKlien(record.TanggalTerbit) : '';
      return (record[h] !== undefined && record[h] !== null) ? record[h] : values[rowIdx][headers.indexOf(h)];
    });
    sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([baris.map(amankanTeks)]);
    invalidasiCacheSheet('Legalitas');
    return createResponse(true, record, 'Data legalitas berhasil diperbarui.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function deleteLegalitas(id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('Legalitas');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex(function (r, i) {
      return i > 0 && String(r[headers.indexOf('ID')]) === String(id);
    });
    if (rowIdx === -1) throw new Error('Data legalitas tidak ditemukan.');
    sheet.deleteRow(rowIdx + 1);
    invalidasiCacheSheet('Legalitas');
    return createResponse(true, null, 'Data legalitas berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

/** Siapkan sheet Legalitas bila belum ada. Aman dijalankan berulang. */
function siapkanSheetLegalitas() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Legalitas');
  if (!sheet) {
    sheet = ss.insertSheet('Legalitas');
    const h = SHEET_HEADERS.Legalitas;
    sheet.appendRow(h);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, h.length).setFontWeight('bold').setBackground('#0284C7').setFontColor('#ffffff');
    Logger.log('✅ Sheet "Legalitas" berhasil dibuat.');
  } else {
    Logger.log('ℹ️  Sheet "Legalitas" sudah ada, tidak dibuat ulang.');
  }

  // PENTING: kunci kolom Nomor Legalitas sebagai TEKS.
  // Tanpa ini, Google Sheets bisa menafsirkan sendiri nomor tertentu —
  // misalnya "12/2024" berubah jadi tanggal, atau "0012" kehilangan nol
  // di depannya. Format "@" memaksa isinya disimpan apa adanya.
  const kolomNomor = SHEET_HEADERS.Legalitas.indexOf('NomorLegalitas') + 1;
  if (kolomNomor > 0) {
    sheet.getRange(2, kolomNomor, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    Logger.log('✅ Kolom NomorLegalitas dikunci sebagai teks (nomor tidak akan diubah otomatis).');
  }
  return sheet;
}

function umkmBerstatusAktif(u) {
  const v = u.StatusAktif;
  if (v === '' || v === null || v === undefined) return true;
  if (v === false) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === 'tidak aktif' || s === 'nonaktif' || s === 'no' || s === '0');
}

/**
 * Sederhanakan nama untuk pembandingan: huruf kecil, tanpa tanda baca,
 * tanpa spasi ganda, dan tanpa kata umum seperti "UMKM"/"Dapur".
 * Tujuannya menangkap penulisan yang sebenarnya merujuk usaha yang sama,
 * misalnya "D'Shafa" vs "D Shafa" vs "dshafa".
 */
function normalisasiNamaUMKM(nama) {
  return String(nama || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // buang tanda petik, titik, strip, dll
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jarak Levenshtein — mengukur seberapa mirip dua teks. */
function jarakTeks(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const kini = [i];
    for (let j = 1; j <= n; j++) {
      kini[j] = Math.min(
        prev[j] + 1,
        kini[j - 1] + 1,
        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
      );
    }
    prev = kini;
  }
  return prev[n];
}

/**
 * Cari UMKM yang namanya SAMA atau SANGAT MIRIP dengan nama baru.
 * Mengembalikan objek UMKM yang bentrok, atau null bila aman.
 */
function cariUMKMSerupa(namaBaru, daftarUMKM, kecualiKode) {
  const baru = normalisasiNamaUMKM(namaBaru);
  if (!baru) return null;

  for (let i = 0; i < daftarUMKM.length; i++) {
    const u = daftarUMKM[i];
    if (kecualiKode && String(u.KodeUnik) === String(kecualiKode)) continue;
    const ada = normalisasiNamaUMKM(u.NamaUMKM);
    if (!ada) continue;

    if (ada === baru) return u;                       // persis sama
    // Beda ≤ 2 huruf pada nama yang cukup panjang → kemungkinan salah ketik
    const batas = baru.length >= 10 ? 2 : 1;
    if (Math.abs(ada.length - baru.length) <= batas && jarakTeks(ada, baru) <= batas) return u;
    // Salah satu nama termuat penuh di dalam yang lain
    if (baru.length >= 5 && (ada.indexOf(baru) > -1 || baru.indexOf(ada) > -1)) return u;
  }
  return null;
}

/** Aktifkan / nonaktifkan sebuah UMKM (tanpa menghapus datanya). */
function setStatusAktifUMKM(kodeUnik, aktif) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('DataMasterUMKM');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];

    let kolom = headers.indexOf('StatusAktif');
    if (kolom === -1) {   // kolom belum ada di sheet lama → tambahkan
      sheet.getRange(1, headers.length + 1).setValue('StatusAktif');
      kolom = headers.length;
    }
    const rowIdx = values.findIndex(function (r, i) {
      return i > 0 && String(r[headers.indexOf('KodeUnik')]) === String(kodeUnik);
    });
    if (rowIdx === -1) throw new Error('Data UMKM tidak ditemukan.');

    sheet.getRange(rowIdx + 1, kolom + 1).setValue(aktif ? 'Aktif' : 'Tidak Aktif');
    invalidasiCacheSheet('DataMasterUMKM');
    return createResponse(true, { kodeUnik: kodeUnik, aktif: !!aktif },
      'UMKM berhasil ditandai ' + (aktif ? 'AKTIF' : 'TIDAK AKTIF') + '.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function addUMKM(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const existing = readSheetAsObjects('DataMasterUMKM');
    if (!data.NamaUMKM || !data.SektorUsaha) throw new Error('Nama UMKM dan Sektor Usaha wajib diisi.');
    // Tolak nama yang sama ATAU sangat mirip dengan UMKM yang sudah ada,
    // supaya tidak muncul data ganda akibat beda penulisan/salah ketik.
    const bentrok = cariUMKMSerupa(data.NamaUMKM, existing, null);
    if (bentrok) {
      throw new Error('Nama UMKM ini terlalu mirip dengan yang sudah terdaftar: "' +
        bentrok.NamaUMKM + '" (' + bentrok.KodeUnik + '). ' +
        'Bila ini memang usaha yang BERBEDA, bedakan namanya lebih jelas — ' +
        'misalnya dengan menambahkan lokasi atau nama pemilik.');
    }
    const kodeUnik = generateKodeUnik(data.SektorUsaha);
    const id = generateShortId();
    const now = new Date();
    const tglBinaan = parseTanggalDariKlien(data.TanggalBinaan, now);
    writeRow('DataMasterUMKM', [id, data.NamaUMKM, kodeUnik, data.SektorUsaha, data.Spesialisasi || '', tglBinaan, data.AlamatUsaha || '', '', now]);

    // Buat akun login otomatis untuk UMKM baru
    writeRow('UserCredentials', [data.NamaUMKM, kodeUnik, 'UMKM', kodeUnik, 'Allowed', '', true, now, now, 'Dibuat otomatis saat pendaftaran UMKM', '', data.AlamatUsaha || '']);

    return createResponse(true, { id, kodeUnik }, 'UMKM "' + data.NamaUMKM + '" berhasil ditambahkan dengan Kode Unik ' + kodeUnik + '.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function updateUMKM(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('DataMasterUMKM');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('KodeUnik')] === data.KodeUnik);
    if (rowIdx === -1) throw new Error('Data UMKM tidak ditemukan.');

    // Saat mengganti nama, pastikan tidak bentrok dengan UMKM LAIN
    // (dirinya sendiri dikecualikan lewat parameter kodeUnik).
    if (data.NamaUMKM) {
      const bentrok = cariUMKMSerupa(data.NamaUMKM, readSheetAsObjects('DataMasterUMKM'), data.KodeUnik);
      if (bentrok) {
        throw new Error('Nama UMKM ini terlalu mirip dengan yang sudah terdaftar: "' +
          bentrok.NamaUMKM + '" (' + bentrok.KodeUnik + '). Gunakan nama yang lebih jelas bedanya.');
      }
    }

    // PENTING: TanggalBinaan dari klien sekarang berupa TEKS ('YYYY-MM-DD'),
    // ubah dulu jadi objek Date yang benar sebelum ditulis ke sheet.
    if (data.TanggalBinaan) data.TanggalBinaan = parseTanggalDariKlien(data.TanggalBinaan, values[rowIdx][headers.indexOf('TanggalBinaan')]);

    const updated = headers.map(h => {
      if (h === 'TerakhirUpdate') return new Date();
      if (h === 'KodeUnik') return data.KodeUnik; // tidak berubah
      return (data[h] !== undefined && data[h] !== null && data[h] !== '') ? data[h] : values[rowIdx][headers.indexOf(h)];
    });
    sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updated.map(amankanTeks)]);
    invalidasiCacheSheet('DataMasterUMKM');
    return createResponse(true, data, 'Profil UMKM berhasil diperbarui.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

/**
 * Hapus SEMUA baris di sebuah sheet yang kolom IDUMKM-nya cocok dengan
 * kodeUnik tertentu. Dipakai saat UMKM dihapus dari Data Master, supaya
 * seluruh riwayat terkait (Omset, Tenaga Kerja, Kemandirian, Fasilitasi,
 * Prestasi) ikut terhapus bersih — tidak tersisa sebagai data "yatim" yang
 * tetap muncul di tabel rekap/daftar gabungan (walau sudah tidak terlihat
 * lewat dropdown pemilihan UMKM, karena dropdown itu hanya menyaring dari
 * daftar UMKM aktif, BUKAN berarti data lamanya ikut terhapus).
 */
function hapusSemuaBarisIDUMKM(sheetName, kodeUnik) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('IDUMKM');
  if (idCol === -1) return; // sheet ini tidak punya kolom IDUMKM, lewati
  // Hapus dari baris PALING BAWAH ke ATAS supaya nomor baris yang belum
  // diproses tidak ikut bergeser saat baris di atasnya dihapus.
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i][idCol] === kodeUnik) sheet.deleteRow(i + 1);
  }
  invalidasiCacheSheet(sheetName);
}

function deleteUMKM(kodeUnik) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('DataMasterUMKM');
    const values = sheet.getDataRange().getValues();
    const kodeCol = values[0].indexOf('KodeUnik');
    const rowIdx = values.findIndex((r, i) => i > 0 && r[kodeCol] === kodeUnik);
    if (rowIdx === -1) throw new Error('Data UMKM tidak ditemukan.');
    sheet.deleteRow(rowIdx + 1);
    invalidasiCacheSheet('DataMasterUMKM');

    // Hapus juga akun login terkait
    const userSheet = getSheet('UserCredentials');
    const uValues = userSheet.getDataRange().getValues();
    const uKodeCol = uValues[0].indexOf('IDUMKM');
    const uRowIdx = uValues.findIndex((r, i) => i > 0 && r[uKodeCol] === kodeUnik && r[uValues[0].indexOf('Role')] === 'UMKM');
    if (uRowIdx > -1) { userSheet.deleteRow(uRowIdx + 1); invalidasiCacheSheet('UserCredentials'); }

    // Hapus SEMUA riwayat terkait di sheet lain — supaya tidak ada data
    // "yatim" yang tersisa (tetap muncul di tabel rekap gabungan walau
    // UMKM-nya sendiri sudah tidak ada di Data Master).
    hapusSemuaBarisIDUMKM('OmsetBulanan', kodeUnik);
    hapusSemuaBarisIDUMKM('TenagaKerja', kodeUnik);
    hapusSemuaBarisIDUMKM('KelasKemandirian', kodeUnik);
    hapusSemuaBarisIDUMKM('FasilitasiPemasaran', kodeUnik);
    hapusSemuaBarisIDUMKM('CatatanPrestasi', kodeUnik);

    return createResponse(true, null, 'Data UMKM beserta seluruh riwayat terkait berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function updateProfilUMKM(kodeUnik, alamat, fotoURL) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    // Update alamat di DataMasterUMKM
    const sheet = getSheet('DataMasterUMKM');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('KodeUnik')] === kodeUnik);
    if (rowIdx > -1) {
      if (alamat !== undefined && alamat !== null) sheet.getRange(rowIdx + 1, headers.indexOf('AlamatUsaha') + 1).setValue(amankanTeks(alamat));
      // '__KOSONG__' = penanda khusus untuk MENGHAPUS foto. Tanpa ini,
      // string kosong akan dikira "tidak ada perubahan".
      if (fotoURL === '__KOSONG__') sheet.getRange(rowIdx + 1, headers.indexOf('FotoURL') + 1).setValue('');
      else if (fotoURL) sheet.getRange(rowIdx + 1, headers.indexOf('FotoURL') + 1).setValue(fotoURL);
      sheet.getRange(rowIdx + 1, headers.indexOf('TerakhirUpdate') + 1).setValue(new Date());
    }
    // Sinkronkan ke UserCredentials
    const userSheet = getSheet('UserCredentials');
    const uValues = userSheet.getDataRange().getValues();
    const uHeaders = uValues[0];
    const uRowIdx = uValues.findIndex((r, i) => i > 0 && r[uHeaders.indexOf('IDUMKM')] === kodeUnik);
    if (uRowIdx > -1) {
      if (alamat !== undefined && alamat !== null) userSheet.getRange(uRowIdx + 1, uHeaders.indexOf('Alamat') + 1).setValue(amankanTeks(alamat));
      if (fotoURL) userSheet.getRange(uRowIdx + 1, uHeaders.indexOf('FotoURL') + 1).setValue(fotoURL);
    }
    invalidasiCacheSheet('DataMasterUMKM');
    invalidasiCacheSheet('UserCredentials');
    return createResponse(true, null, 'Profil berhasil diupdate.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function updateProfilCSRorAdmin(username, alamat, fotoURL) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('UserCredentials');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('Username')] === username);
    if (rowIdx === -1) throw new Error('Akun tidak ditemukan.');
    if (alamat !== undefined && alamat !== null) sheet.getRange(rowIdx + 1, headers.indexOf('Alamat') + 1).setValue(amankanTeks(alamat));
    // '__KOSONG__' = penanda khusus untuk MENGHAPUS foto. Tanpa ini,
    // string kosong akan dikira "tidak ada perubahan".
    if (fotoURL === '__KOSONG__') sheet.getRange(rowIdx + 1, headers.indexOf('FotoURL') + 1).setValue('');
    else if (fotoURL) sheet.getRange(rowIdx + 1, headers.indexOf('FotoURL') + 1).setValue(fotoURL);
    sheet.getRange(rowIdx + 1, headers.indexOf('TanggalPerubahanAkses') + 1).setValue(new Date());
    invalidasiCacheSheet('UserCredentials');
    return createResponse(true, null, 'Profil berhasil diupdate.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

// ════════════════════════════════════════════════════════
// MODUL: OMSET BULANAN
// ════════════════════════════════════════════════════════
function getOmsetUMKM(kodeUnik, tahun) {
  try {
    const rows = readSheetAsObjects('OmsetBulanan').filter(r => r.IDUMKM === kodeUnik && Number(r.Tahun) === Number(tahun));
    return createResponse(true, rows[0] || null, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function saveOmset(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    // Penguncian ditegakkan DI SERVER, bukan sekadar menyembunyikan tombol —
    // sehingga tetap berlaku walau permintaan dikirim langsung.
    if (apakahSudahClosing(record.IDUMKM, record.Tahun, 'Omset')) {
      throw new Error('Data omset tahun ' + record.Tahun + ' sudah dikunci (closing) dan tidak dapat diubah. ' +
        'Hubungi Admin bila perlu dibuka kembali.');
    }
    if (!record.IDUMKM || !record.Tahun) throw new Error('UMKM dan Tahun wajib diisi.');
    const sheet = getSheet('OmsetBulanan');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];

    let total = 0;
    BULAN_LIST.forEach(b => { total += Number(record[b]) || 0; });
    const target = Number(record.TargetOmsetTahunan) || 0;
    record.TotalRealisasi = total;
    record.StatusTarget = (target > 0 && total >= target) ? 'Tercapai' : 'Belum Tercapai';

    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('IDUMKM')] === record.IDUMKM && Number(r[headers.indexOf('Tahun')]) === Number(record.Tahun));

    const rowArray = headers.map(h => {
      if (h === 'ID') return rowIdx > -1 ? values[rowIdx][headers.indexOf('ID')] : generateShortId();
      return record[h] !== undefined ? record[h] : (rowIdx > -1 ? values[rowIdx][headers.indexOf(h)] : '');
    });

    if (rowIdx > -1) sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([rowArray.map(amankanTeks)]);
    else sheet.appendRow(rowArray.map(amankanTeks));
    invalidasiCacheSheet('OmsetBulanan');

    return createResponse(true, record, 'Omset berhasil disimpan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

/**
 * Riwayat omset SELURUH TAHUN milik SATU UMKM saja.
 * Dibuat terpisah dari getAllOmset() secara sengaja: getAllOmset memuat
 * data seluruh UMKM dan hanya boleh diakses Admin/CSR UT. Pengguna UMKM
 * memakai fungsi ini supaya tetap bisa melihat riwayatnya sendiri tanpa
 * pernah menyentuh data usaha milik orang lain.
 */
function getRiwayatOmsetUMKM(kodeUnik) {
  try {
    const rows = readSheetAsObjects('OmsetBulanan').filter(function (r) {
      return String(r.IDUMKM) === String(kodeUnik);
    });
    return createResponse(true, rows, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function getAllOmset() {
  // Lihat catatan di getDaftarUMKM() — pola yang sama diterapkan di sini
  // sebagai pencegahan (fungsi ini biasanya jarang benar-benar dipanggil
  // via RPC karena ada data tertanam, tapi kalau jalur cadangan ini
  // pernah aktif, ini menghindari bug serialisasi Date yang sama).
  try {
    const data = readSheetAsObjects('OmsetBulanan');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

/**
 * Hapus satu baris riwayat omset tahunan (satu UMKM, satu tahun tertentu).
 * Dipakai UMKM sendiri untuk menghapus riwayat tahun yang mereka mau dari
 * tabel Riwayat Tahunan Omset di dashboard mereka.
 */
function deleteOmset(kodeUmkm, tahun) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (apakahSudahClosing(kodeUmkm, tahun, 'Omset')) {
      throw new Error('Data omset tahun ' + tahun + ' sudah dikunci (closing) dan tidak dapat dihapus.');
    }
    const sheet = getSheet('OmsetBulanan');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('IDUMKM')] === kodeUmkm && Number(r[headers.indexOf('Tahun')]) === Number(tahun));
    if (rowIdx === -1) throw new Error('Data omset tahun tersebut tidak ditemukan.');
    sheet.deleteRow(rowIdx + 1);
    invalidasiCacheSheet('OmsetBulanan');
    return createResponse(true, null, 'Riwayat omset tahun ' + tahun + ' berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

// ════════════════════════════════════════════════════════
// MODUL: TENAGA KERJA
// ════════════════════════════════════════════════════════
function getTenagaKerjaUMKM(kodeUnik, tahun) {
  try {
    const rows = readSheetAsObjects('TenagaKerja').filter(r => r.IDUMKM === kodeUnik && Number(r.Tahun) === Number(tahun));
    return createResponse(true, rows, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function saveTenagaKerja(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (apakahSudahClosing(record.IDUMKM, record.Tahun, 'TenagaKerja')) {
      throw new Error('Data tenaga kerja tahun ' + record.Tahun + ' sudah dikunci (closing) dan tidak dapat diubah. ' +
        'Hubungi Admin bila perlu dibuka kembali.');
    }
    if (!record.IDUMKM || !record.Bulan || !record.Tahun) throw new Error('UMKM, Bulan, dan Tahun wajib diisi.');
    const sheet = getSheet('TenagaKerja');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 &&
      r[headers.indexOf('IDUMKM')] === record.IDUMKM &&
      r[headers.indexOf('Bulan')] === record.Bulan &&
      Number(r[headers.indexOf('Tahun')]) === Number(record.Tahun));

    const rowArray = headers.map(h => {
      if (h === 'ID') return rowIdx > -1 ? values[rowIdx][headers.indexOf('ID')] : generateShortId();
      return record[h] !== undefined ? record[h] : (rowIdx > -1 ? values[rowIdx][headers.indexOf(h)] : '');
    });

    if (rowIdx > -1) sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([rowArray.map(amankanTeks)]);
    else sheet.appendRow(rowArray.map(amankanTeks));
    invalidasiCacheSheet('TenagaKerja');

    return createResponse(true, record, 'Data tenaga kerja berhasil disimpan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function getAllTenagaKerja() {
  try {
    const data = readSheetAsObjects('TenagaKerja');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

// ════════════════════════════════════════════════════════
// MODUL: KELAS KEMANDIRIAN
// ════════════════════════════════════════════════════════
function hitungKelas(rataRata) {
  if (rataRata < 25) return 'Pemula';
  if (rataRata < 50) return 'Madya';
  if (rataRata < 75) return 'Pra Mandiri';
  return 'Mandiri';
}

function getKelasKemandirianUMKM(kodeUnik) {
  try {
    const row = readSheetAsObjects('KelasKemandirian').find(r => r.IDUMKM === kodeUnik);
    // PENTING: kirim sebagai STRING JSON — row bisa mengandung field
    // TanggalAsesmen (Date), dan terbukti google.script.run punya masalah
    // mengirim objek dengan field Date secara langsung (lihat catatan di
    // getDaftarUMKM). Ini berlaku juga untuk OBJEK TUNGGAL, bukan cuma array.
    return createResponse(true, row || null, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function saveKelasKemandirian(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const p = Number(record.SkorProduksi) || 0;
    const pm = Number(record.SkorPemasaran) || 0;
    const k = Number(record.SkorKeuangan) || 0;
    if ([p, pm, k].some(v => v < 0 || v > 100)) throw new Error('Skor harus di antara 0-100.');
    const rata = Math.round(((p + pm + k) / 3) * 10) / 10;
    record.RataRata = rata;
    record.Kelas = hitungKelas(rata);
    // PENTING: TanggalAsesmen dari klien berupa TEKS ('YYYY-MM') — ubah
    // jadi objek Date yang benar sebelum ditulis ke sheet (lihat catatan
    // di parseTanggalDariKlien soal kenapa tidak boleh kirim objek Date
    // langsung dari klien).
    record.TanggalAsesmen = parseTanggalDariKlien(record.TanggalAsesmen, new Date());

    const sheet = getSheet('KelasKemandirian');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('IDUMKM')] === record.IDUMKM);

    const rowArray = headers.map(h => {
      if (h === 'ID') return rowIdx > -1 ? values[rowIdx][headers.indexOf('ID')] : generateShortId();
      return record[h] !== undefined ? record[h] : (rowIdx > -1 ? values[rowIdx][headers.indexOf(h)] : '');
    });

    if (rowIdx > -1) sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([rowArray.map(amankanTeks)]);
    else sheet.appendRow(rowArray.map(amankanTeks));
    invalidasiCacheSheet('KelasKemandirian');

    return createResponse(true, record, 'Kelas kemandirian berhasil disimpan: ' + record.Kelas + ' (skor ' + rata + ').');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function getAllKelasKemandirian() {
  try {
    const data = readSheetAsObjects('KelasKemandirian');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

// ════════════════════════════════════════════════════════
// MODUL: FASILITASI PEMASARAN
// ════════════════════════════════════════════════════════
function addFasilitasi(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (!record.IDUMKM || !record.NominalRupiah) throw new Error('UMKM dan Nominal wajib diisi.');
    if (Number(record.NominalRupiah) <= 0) throw new Error('Nominal harus lebih dari 0.');
    writeRow('FasilitasiPemasaran', [generateShortId(), record.NamaCustomer || '', record.IDUMKM, record.NamaUMKM || '', record.DeskripsiKegiatan || '', Number(record.NominalRupiah), parseTanggalDariKlien(record.TanggalFasilitasi), record.Catatan || '']);
    return createResponse(true, record, 'Fasilitasi pemasaran berhasil dicatat.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function getAllFasilitasi() {
  try {
    const data = readSheetAsObjects('FasilitasiPemasaran');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

// ════════════════════════════════════════════════════════
// MODUL: CATATAN PRESTASI UMKM
// ════════════════════════════════════════════════════════
function addPrestasi(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (!record.IDUMKM || !record.DeskripsiPrestasi) throw new Error('UMKM dan deskripsi prestasi wajib diisi.');
    writeRow('CatatanPrestasi', [generateShortId(), record.IDUMKM, record.NamaUMKM || '', record.Bulan || '', record.Tahun || new Date().getFullYear(), record.DeskripsiPrestasi, record.KategoriPrestasi || 'Lainnya', new Date(), record.CatatanTambahan || '']);
    return createResponse(true, record, 'Catatan prestasi berhasil dicatat.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function updatePrestasi(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (!record.ID) throw new Error('ID catatan prestasi tidak ditemukan.');
    if (!record.DeskripsiPrestasi) throw new Error('Deskripsi prestasi wajib diisi.');
    const sheet = getSheet('CatatanPrestasi');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    // PENTING: bandingkan sebagai STRING — lihat catatan yang sama di
    // deleteLaporanCSR soal ID yang bisa kebetulan berupa digit murni.
    const rowIdx = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf('ID')]) === String(record.ID));
    if (rowIdx === -1) throw new Error('Catatan prestasi tidak ditemukan.');
    const updated = headers.map(h => {
      if (h === 'ID') return record.ID;
      if (h === 'TanggalPencatatan') return values[rowIdx][headers.indexOf('TanggalPencatatan')]; // tidak diubah
      return (record[h] !== undefined && record[h] !== null) ? record[h] : values[rowIdx][headers.indexOf(h)];
    });
    sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updated.map(amankanTeks)]);
    invalidasiCacheSheet('CatatanPrestasi');
    return createResponse(true, record, 'Catatan prestasi berhasil diperbarui.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function deletePrestasi(id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('CatatanPrestasi');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf('ID')]) === String(id));
    if (rowIdx === -1) throw new Error('Catatan prestasi tidak ditemukan.');
    sheet.deleteRow(rowIdx + 1);
    invalidasiCacheSheet('CatatanPrestasi');
    return createResponse(true, null, 'Catatan prestasi berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function getAllPrestasi() {
  try {
    const data = readSheetAsObjects('CatatanPrestasi');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function getPerformaTerbaik(filterBulan, filterKategori) {
  try {
    let rows = readSheetAsObjects('CatatanPrestasi');
    if (filterBulan) rows = rows.filter(r => r.Bulan === filterBulan);
    if (filterKategori) rows = rows.filter(r => r.KategoriPrestasi === filterKategori);
    rows.sort((a, b) => new Date(b.TanggalPencatatan) - new Date(a.TanggalPencatatan));
    return createResponse(true, rows, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

// ════════════════════════════════════════════════════════
// MODUL: FILE LAPORAN CSR (PDF)
// ════════════════════════════════════════════════════════
function uploadLaporanCSR(fileData, fileName, mimeType, meta) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (mimeType !== 'application/pdf') throw new Error('Hanya file PDF yang diterima.');
    const folderId = getConfig('laporanFolderId');
    const folder = DriveApp.getFolderById(folderId);
    const decoded = Utilities.base64Decode(fileData);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const idBaris = generateShortId();
    writeRow('LaporanCSR', [idBaris, meta.Bulan, meta.Tahun, fileName, file.getUrl(), file.getId(), meta.DeskripsiLaporan || '', new Date(), meta.DiuploadOleh || 'Admin', meta.Status || 'Final', meta.Catatan || '']);

    // PENTING: kembalikan idBaris (ID unik baris di sheet) — BUKAN hanya
    // fileId (ID file di Google Drive, yang BEDA dan dipakai untuk hal
    // lain). Sebelumnya ID baris ini tidak pernah dikirim balik ke klien,
    // menyebabkan klien salah memakai fileId sebagai pengganti ID baris
    // saat mau menghapus laporan — akibatnya "Laporan tidak ditemukan".
    return createResponse(true, { id: idBaris, fileId: file.getId(), fileUrl: file.getUrl() }, 'File laporan CSR berhasil diupload.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function getAllLaporanCSR() {
  try {
    const data = readSheetAsObjects('LaporanCSR');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function deleteLaporanCSR(id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('LaporanCSR');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    // PENTING: bandingkan sebagai STRING (bukan ===) — ID yang dihasilkan
    // (potongan UUID) kadang kebetulan berupa digit angka murni saja
    // (misal "12345678"), dan Google Sheets otomatis menyimpannya sebagai
    // TIPE ANGKA, bukan teks. Perbandingan === akan selalu gagal antara
    // angka dan teks walau nilainya terlihat identik.
    const rowIdx = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf('ID')]) === String(id));
    if (rowIdx === -1) throw new Error('Laporan tidak ditemukan.');
    const fileId = values[rowIdx][headers.indexOf('FileID')];
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    sheet.deleteRow(rowIdx + 1);
    invalidasiCacheSheet('LaporanCSR');
    return createResponse(true, null, 'Laporan CSR berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function updateStatusLaporanCSR(id, status) {
  try {
    const sheet = getSheet('LaporanCSR');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf('ID')]) === String(id));
    if (rowIdx === -1) throw new Error('Laporan tidak ditemukan.');
    sheet.getRange(rowIdx + 1, headers.indexOf('Status') + 1).setValue(status);
    invalidasiCacheSheet('LaporanCSR');
    return createResponse(true, null, 'Status laporan diperbarui.');
  } catch (error) { return createResponse(false, null, error.message); }
}

// ════════════════════════════════════════════════════════
// MODUL: MANAJEMEN USER & AKSES (Admin)
// ════════════════════════════════════════════════════════
function getAllUsers() {
  try {
    const data = readSheetAsObjects('UserCredentials');
    return createResponse(true, data, 'OK');
  } catch (error) { return createResponse(false, null, error.message); }
}

function updateUserCredential(record) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('UserCredentials');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('Username')] === record.originalUsername);
    if (rowIdx === -1) throw new Error('User tidak ditemukan.');

    const role = values[rowIdx][headers.indexOf('Role')];
    const rowArray = headers.map((h, c) => {
      if (h === 'Username' && (role === 'Admin' || role === 'UT')) return values[rowIdx][c]; // fixed username
      if (h === 'KodeUnik' && role === 'UMKM') return values[rowIdx][c]; // kode unik tidak bisa diubah
      if (h === 'TanggalPerubahanAkses') return new Date();
      return record[h] !== undefined && record[h] !== '' ? record[h] : values[rowIdx][c];
    });
    sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([rowArray.map(amankanTeks)]);
    invalidasiCacheSheet('UserCredentials');

    // Username akun sistem (Admin & Stakeholder) SENGAJA dikunci di server.
    // Karena itu jangan pernah melaporkan "username berubah" bila yang
    // tersimpan sebenarnya tetap nama lama — laporan keliru seperti itu
    // membuat pengguna mengira sudah berganti, lalu gagal login.
    const usernameTersimpan = rowArray[headers.indexOf('Username')];
    const benarBerubah = String(usernameTersimpan) !== String(record.originalUsername);
    if (benarBerubah) hapusSesiPengguna(record.originalUsername);

    const dimintaGanti = record.Username &&
                         String(record.Username) !== String(record.originalUsername);

    return createResponse(true, record,
      benarBerubah
        ? 'Data user berhasil diperbarui. Username berubah menjadi "' + usernameTersimpan +
          '" — yang bersangkutan perlu login ulang dengan username baru ini.'
        : (dimintaGanti
            ? 'Data user diperbarui, tetapi USERNAME TIDAK DIUBAH karena akun sistem ' +
              '(Admin/Stakeholder) namanya dikunci. Perubahan lain tetap tersimpan.'
            : 'Data user berhasil diperbarui.'));
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function setStatusAksesLogin(username, status, alasan) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet('UserCredentials');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rowIdx = values.findIndex((r, i) => i > 0 && r[headers.indexOf('Username')] === username);
    if (rowIdx === -1) throw new Error('User tidak ditemukan.');
    sheet.getRange(rowIdx + 1, headers.indexOf('StatusAksesLogin') + 1).setValue(status);
    sheet.getRange(rowIdx + 1, headers.indexOf('AlasanPemblokiran') + 1).setValue(amankanTeks(alasan || ''));
    sheet.getRange(rowIdx + 1, headers.indexOf('TanggalPerubahanAkses') + 1).setValue(new Date());
    invalidasiCacheSheet('UserCredentials');
    return createResponse(true, null, 'Status akses "' + username + '" diubah menjadi ' + status + '.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

function deleteUser(username) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    if (username === 'Admin' || username === 'Tim CSR UT') throw new Error('Akun ini tidak dapat dihapus.');
    const sheet = getSheet('UserCredentials');
    const values = sheet.getDataRange().getValues();
    const rowIdx = values.findIndex((r, i) => i > 0 && r[0] === username);
    if (rowIdx === -1) throw new Error('User tidak ditemukan.');
    sheet.deleteRow(rowIdx + 1);
    invalidasiCacheSheet('UserCredentials');
    return createResponse(true, null, 'User berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  } finally { lock.releaseLock(); }
}

// ════════════════════════════════════════════════════════
// UPLOAD FILE / FOTO KE DRIVE (generik)
// ════════════════════════════════════════════════════════
/**
 * Ambil ID berkas Drive dari berbagai bentuk tautan (/thumbnail?id=,
 * /uc?id=, /file/d/<id>/view, dll). Dipakai untuk menghapus foto lama.
 */
function ambilIdDariUrlDrive(url) {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/[?&]id=([-\w]{25,})/);
  if (m) return m[1];
  m = s.match(/\/d\/([-\w]{25,})/);
  if (m) return m[1];
  m = s.match(/([-\w]{25,})/);
  return m ? m[1] : null;
}

/**
 * Hapus berkas foto lama dari Drive agar tidak menumpuk setiap kali
 * pengguna mengganti foto. Kegagalan di sini SENGAJA tidak dianggap
 * error fatal — foto baru tetap boleh dipakai walau yang lama gagal
 * dihapus (misal sudah terlanjur dihapus manual).
 */
function hapusBerkasDriveDariUrl(url) {
  const id = ambilIdDariUrlDrive(url);
  if (!id) return false;
  try {
    DriveApp.getFileById(id).setTrashed(true);
    return true;
  } catch (e) {
    Logger.log('Foto lama tidak dapat dihapus (' + id + '): ' + e.message);
    return false;
  }
}

/** Hapus foto profil pengguna yang sedang login (berkas + catatan). */
function hapusFotoProfil(sesi) {
  try {
    const users = readSheetAsObjects('UserCredentials');
    const user = users.find(function (u) { return String(u.Username) === String(sesi.username); });
    if (user && user.FotoURL) hapusBerkasDriveDariUrl(user.FotoURL);

    // Kosongkan catatan foto di sheet yang sesuai dengan peran
    if (sesi.role === 'UMKM') updateProfilUMKM(sesi.idUmkm, undefined, '__KOSONG__');
    else updateProfilCSRorAdmin(sesi.username, undefined, '__KOSONG__');

    return createResponse(true, null, 'Foto profil berhasil dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

function uploadFotoProfil(base64Data, fileName, mimeType, urlFotoLama) {
  try {
    const folderId = getConfig('fotoFolderId');
    const folder = DriveApp.getFolderById(folderId);
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Bersihkan foto lama supaya Drive tidak dipenuhi berkas tak terpakai
    if (urlFotoLama) hapusBerkasDriveDariUrl(urlFotoLama);
    // PENTING: pakai endpoint /thumbnail (BUKAN /uc?id=...). Format /uc
    // aslinya untuk DOWNLOAD, bukan untuk ditampilkan langsung sebagai
    // gambar — Google kadang menampilkan halaman konfirmasi/peringatan
    // alih-alih file aslinya, sehingga <img> gagal menampilkan apa pun.
    // /thumbnail adalah endpoint resmi Google Drive yang memang dirancang
    // untuk kebutuhan ini dan jauh lebih andal.
    const url = 'https://drive.google.com/thumbnail?sz=w500&id=' + file.getId();
    // Sertakan "fotoURL" DAN "fileUrl": nama pertama dipakai frontend baru,
    // nama kedua dipertahankan agar kode lama tidak ikut rusak.
    return createResponse(true, { fotoURL: url, fileUrl: url, fileId: file.getId() }, 'Foto berhasil diupload.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

// ════════════════════════════════════════════════════════
// DASHBOARD — AGREGASI DATA (server-side, cepat & ringan)
// ════════════════════════════════════════════════════════

/** Kumpulkan seluruh tahun yang punya data, urut dari terbaru. */
function kumpulkanTahunTersedia(omsetRows, tkRows, tahunSekarang) {
  const set = {};
  (omsetRows || []).forEach(function (r) { if (r.Tahun) set[Number(r.Tahun)] = true; });
  (tkRows || []).forEach(function (r) { if (r.Tahun) set[Number(r.Tahun)] = true; });
  set[Number(tahunSekarang)] = true;
  return Object.keys(set).map(Number).filter(function (t) { return t > 2000; })
    .sort(function (a, b) { return b - a; });
}

/**
 * PERBAIKAN AKSES DRIVE.
 * Saat siapkanKeamananAPI() dijalankan, Google hanya meminta izin untuk
 * layanan yang BENAR-BENAR tersentuh saat itu. Karena ID spreadsheet sudah
 * diisi manual di Script Properties, DriveApp tidak pernah dipanggil —
 * sehingga izin Drive tidak ikut diberikan. Akibatnya unggah foto/PDF
 * gagal dengan pesan "Akses ditolak: DriveApp".
 *
 * Jalankan fungsi ini SEKALI dari editor, lalu setujui permintaan izin
 * yang muncul. Setelah itu unggah berkas akan berfungsi normal.
 */
function otorisasiDrive() {
  // Sentuh DriveApp secara nyata supaya Google meminta izin Drive.
  const idFoto = getConfig('fotoFolderId');
  const idLaporan = getConfig('laporanFolderId');
  Logger.log('✅ Izin Drive berhasil diberikan.');

  [['Foto profil', idFoto], ['Laporan CSR', idLaporan]].forEach(function (p) {
    if (!p[1]) { Logger.log('   ⚠️ ' + p[0] + ': folder belum terdaftar di AppConfig.'); return; }
    try {
      const f = DriveApp.getFolderById(p[1]);
      Logger.log('   ' + p[0] + ': ' + f.getName() + ' — dapat diakses ✓');
    } catch (e) {
      Logger.log('   ❌ ' + p[0] + ': folder tidak dapat diakses — ' + e.message);
    }
  });
  Logger.log('');
  Logger.log('⚠️  PENTING: setelah ini, lakukan Deploy ulang');
  Logger.log('   (Manage Deployments → Edit → New Version → Deploy)');
  Logger.log('   agar izin baru ikut terpakai oleh Web App.');
  return true;
}

function hitungDistribusiKelas(kelasRows) {
  const dist = { 'Pemula': 0, 'Madya': 0, 'Pra Mandiri': 0, 'Mandiri': 0 };
  kelasRows.forEach(r => { if (dist[r.Kelas] !== undefined) dist[r.Kelas]++; });
  return dist;
}

function hitungTotalOmsetPerBulan(omsetRows, tahun) {
  const totals = BULAN_LIST.map(() => 0);
  omsetRows.filter(r => Number(r.Tahun) === Number(tahun)).forEach(r => {
    BULAN_LIST.forEach((b, i) => { totals[i] += Number(r[b]) || 0; });
  });
  return totals;
}

function hitungTotalTenagaKerjaPerBulan(tkRows, tahun) {
  const totals = {};
  BULAN_LIST.forEach(b => totals[b] = 0);
  tkRows.filter(r => Number(r.Tahun) === Number(tahun)).forEach(r => {
    if (totals[r.Bulan] !== undefined) totals[r.Bulan] += Number(r.JumlahTenagaKerja) || 0;
  });
  return BULAN_LIST.map(b => totals[b]);
}

/** Dashboard untuk Admin & CSR UT (struktur data sama, akses beda di frontend) */
function getDashboardOrganisasi(tahunDiminta) {
  try {
    // Tahun bisa dipilih Admin lewat filter di dashboard. Bila tidak
    // dikirim, pakai tahun aktif dari konfigurasi.
    const tahun = Number(tahunDiminta) || Number(getConfig('tahunAktif')) || new Date().getFullYear();
    const umkmRows = readSheetAsObjects('DataMasterUMKM');
    const omsetRows = readSheetAsObjects('OmsetBulanan');
    const tkRows = readSheetAsObjects('TenagaKerja');
    const kelasRows = readSheetAsObjects('KelasKemandirian');
    const fasilitasiRows = readSheetAsObjects('FasilitasiPemasaran');
    const prestasiRows = readSheetAsObjects('CatatanPrestasi');
    const laporanRows = readSheetAsObjects('LaporanCSR').filter(r => r.Status === 'Final');
    const userRows = readSheetAsObjects('UserCredentials');

    // Hanya UMKM berstatus AKTIF yang dihitung di dashboard. UMKM yang
    // dinonaktifkan tetap tersimpan datanya, tapi tidak lagi masuk
    // ringkasan program supaya angkanya mencerminkan binaan berjalan.
    const umkmAktif = umkmRows.filter(umkmBerstatusAktif);
    const perSektor = { Kuliner: 0, Kerajinan: 0, Pertanian: 0, Manufaktur: 0 };
    umkmAktif.forEach(u => { if (perSektor[u.SektorUsaha] !== undefined) perSektor[u.SektorUsaha]++; });

    const totalOmset = omsetRows.filter(r => Number(r.Tahun) === tahun).reduce((s, r) => s + (Number(r.TotalRealisasi) || 0), 0);
    const omsetPerBulan = hitungTotalOmsetPerBulan(omsetRows, tahun);
    const tenagaKerjaPerBulan = hitungTotalTenagaKerjaPerBulan(tkRows, tahun);
    const totalTenagaKerja = tenagaKerjaPerBulan[tenagaKerjaPerBulan.length - 1] || tenagaKerjaPerBulan.reduce((a,b)=>Math.max(a,b),0);

    const totalFasilitasi = fasilitasiRows.reduce((s, r) => s + (Number(r.NominalRupiah) || 0), 0);
    const targetFasilitasi = Number(getConfig('targetFasilitasiTahunan')) || 0;

    const distribusiKelas = hitungDistribusiKelas(kelasRows);
    const totalUMKMDenganKelas = kelasRows.length || 1;

    // Hitung jumlah CATATAN PRESTASI per UMKM (bukan cuma entri terbaru),
    // lalu ambil 5 UMKM dengan jumlah prestasi TERBANYAK, diurutkan dari
    // yang paling banyak ke paling sedikit.
    const jumlahPrestasiPerUmkm = {};
    prestasiRows.forEach(r => {
      const nama = r.NamaUMKM || '(Tidak diketahui)';
      jumlahPrestasiPerUmkm[nama] = (jumlahPrestasiPerUmkm[nama] || 0) + 1;
    });
    const prestasiTerbaru = Object.keys(jumlahPrestasiPerUmkm)
      .map(nama => ({ NamaUMKM: nama, jumlah: jumlahPrestasiPerUmkm[nama] }))
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 5);

    const statusAkses = { Allowed: 0, Blocked: 0 };
    userRows.filter(u => u.Role === 'UMKM').forEach(u => {
      if (u.StatusAksesLogin === 'Blocked') statusAkses.Blocked++; else statusAkses.Allowed++;
    });

    return createResponse(true, ({
      tahun,
      totalUMKM: umkmAktif.length,
      perSektor,
      totalOmset,
      omsetPerBulan,
      tenagaKerjaPerBulan,
      totalTenagaKerja,
      totalFasilitasi,
      targetFasilitasi,
      distribusiKelas,
      totalUMKMDenganKelas,
      prestasiTerbaru,
      laporanTerbaru: laporanRows.sort((a,b)=>new Date(b.TanggalUpload)-new Date(a.TanggalUpload)).slice(0,5),
      statusAkses,
      bulanLabel: BULAN_LIST,
      // Daftar tahun yang benar-benar punya data omset/tenaga kerja —
      // dipakai mengisi pilihan filter tahun di dashboard.
      daftarTahun: kumpulkanTahunTersedia(omsetRows, tkRows, tahun)
    }), 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Dashboard pribadi UMKM */
function getDashboardUMKM(kodeUnik, tahunDiminta) {
  try {
    // Tahun bisa dipilih lewat filter di dashboard; bila tidak dikirim,
    // pakai periode aktif dari konfigurasi.
    const tahun = Number(tahunDiminta) || Number(getConfig('tahunAktif')) || new Date().getFullYear();
    const profil = readSheetAsObjects('DataMasterUMKM').find(u => u.KodeUnik === kodeUnik);
    if (!profil) throw new Error('Profil UMKM tidak ditemukan.');

    const omset = readSheetAsObjects('OmsetBulanan').find(r => r.IDUMKM === kodeUnik && Number(r.Tahun) === tahun);
    const tkRows = readSheetAsObjects('TenagaKerja').filter(r => r.IDUMKM === kodeUnik && Number(r.Tahun) === tahun);
    const kelas = readSheetAsObjects('KelasKemandirian').find(r => r.IDUMKM === kodeUnik);
    const prestasi = readSheetAsObjects('CatatanPrestasi').filter(r => r.IDUMKM === kodeUnik)
      .sort((a,b)=>new Date(b.TanggalPencatatan)-new Date(a.TanggalPencatatan));
    const fasilitasi = readSheetAsObjects('FasilitasiPemasaran').filter(r => r.IDUMKM === kodeUnik);

    const omsetBulanan = BULAN_LIST.map(b => omset ? (Number(omset[b]) || 0) : 0);
    const tkPerBulan = BULAN_LIST.map(b => {
      const row = tkRows.find(r => r.Bulan === b);
      return row ? Number(row.JumlahTenagaKerja) || 0 : 0;
    });
    const tkTerbaru = [...tkRows].reverse()[0];

    return createResponse(true, ({
      tahun,
      profil,
      omset: omset || null,
      omsetBulanan,
      target: omset ? Number(omset.TargetOmsetTahunan) || 0 : 0,
      totalRealisasi: omset ? Number(omset.TotalRealisasi) || 0 : 0,
      statusTarget: omset ? omset.StatusTarget : 'Belum Ada Data',
      tkPerBulan,
      tenagaKerjaTerbaru: tkTerbaru ? Number(tkTerbaru.JumlahTenagaKerja) : 0,
      kelas: kelas || null,
      prestasi,
      fasilitasi,
      daftarTahun: kumpulkanTahunTersedia(
        readSheetAsObjects('OmsetBulanan').filter(function (r) { return String(r.IDUMKM) === String(kodeUnik); }),
        readSheetAsObjects('TenagaKerja').filter(function (r) { return String(r.IDUMKM) === String(kodeUnik); }),
        tahun),
      // Ringkasan legalitas untuk widget Status Legalitas di dashboard UMKM
      legalitas: lengkapiStatusLegalitas(
        readSheetAsObjects('Legalitas').filter(function (r) {
          return String(r.IDUMKM) === String(kodeUnik);
        })
      ),
      bulanLabel: BULAN_LIST
    }), 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}
