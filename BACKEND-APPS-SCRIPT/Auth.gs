// ════════════════════════════════════════════════════════
// MODUL AUTH — Jembatan ke Firebase Authentication
// ════════════════════════════════════════════════════════
// Berkas ini membuat akun Firebase Authentication untuk setiap pengguna,
// sehingga LOGIN tidak perlu lagi melewati Apps Script.
//
// Setelah akun terbentuk, aplikasi masuk langsung ke Firebase:
//   browser → Firebase Auth   (0,3 detik)
// bukan lagi:
//   browser → GAS → Firestore → token → Firebase   (2–5 detik)
//
// GAS tetap dipakai untuk tiga hal yang memang butuh kunci rahasia:
// unggah berkas ke Drive, reset password oleh Admin, dan cadangan harian.

// Firebase Auth mewajibkan email. SIPUMA memakai nama UMKM, bukan email,
// jadi dibuatkan email bayangan yang TIDAK pernah dikirimi apa pun.
// Domain .local sengaja dipilih karena tidak mungkin jadi domain nyata —
// tidak ada risiko surat nyasar ke orang lain.
const AUTH_DOMAIN_BAYANGAN = 'sipuma.local';

// ════════════════════════════════════════════════════════
// EMAIL BAYANGAN
// ════════════════════════════════════════════════════════

/** SHA-256 sebuah teks, dalam bentuk heksadesimal. */
function authSha256Hex(teks) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(teks), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Ubah username jadi email bayangan yang tetap dan unik.
 *
 * ⚠️ RUMUS INI HARUS SAMA PERSIS dengan emailDariUsername() di
 *    js/firebase-init.js. Browser menghitungnya sendiri saat login —
 *    bila kedua rumus berbeda satu huruf pun, tidak ada yang bisa masuk.
 *
 * Bentuknya: <slug>.<12 huruf sidik username>@sipuma.local
 *
 * Sidik SHA-256 disertakan supaya dua nama yang slug-nya kebetulan sama
 * (misal "D'Shafa" dan "D Shafa") tetap mendapat email berbeda.
 */
function authEmailDariUsername(username) {
  const u = String(username || '').trim();
  let slug = u.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 32)
    .replace(/-+$/g, '');
  if (!slug) slug = 'pengguna';
  return slug + '.' + authSha256Hex(u).substring(0, 12) + '@' + AUTH_DOMAIN_BAYANGAN;
}

// ════════════════════════════════════════════════════════
// AKSES KE FIREBASE AUTH
// ════════════════════════════════════════════════════════

/** Access token dengan izin mengelola akun (bukan hanya Firestore). */
function authAccessToken() {
  const cache = CacheService.getScriptCache();
  const tersimpan = cache.get('fb_token_auth');
  if (tersimpan) return tersimpan;

  const k = fbKredensial();
  const now = Math.floor(Date.now() / 1000);
  const jwt = fbBuatJWT({
    iss: k.email,
    scope: 'https://www.googleapis.com/auth/identitytoolkit ' +
           'https://www.googleapis.com/auth/firebase',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  if (!data.access_token) {
    throw new Error('Gagal mendapatkan izin pengelolaan akun. ' +
      'Jalankan otorisasiDrive() lalu setujui izin baru. Rincian: ' + res.getContentText());
  }
  cache.put('fb_token_auth', data.access_token, 3300);
  return data.access_token;
}

/** Panggil Identity Toolkit sebagai pengelola. */
function authPanggil(jalur, isi) {
  const url = 'https://identitytoolkit.googleapis.com/v1/projects/' +
              FB_PROJECT_ID + (jalur ? jalur : '');
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + authAccessToken() },
    payload: JSON.stringify(isi),
    muteHttpExceptions: true
  });
  const kode = res.getResponseCode();
  const teks = res.getContentText();
  return { kode: kode, ok: (kode >= 200 && kode < 300), data: JSON.parse(teks || '{}'), teks: teks };
}

// ════════════════════════════════════════════════════════
// KELOLA AKUN
// ════════════════════════════════════════════════════════

/** Apakah akun Firebase Auth untuk username ini sudah ada? */
function authAdaAkun(username) {
  const r = authPanggil('/accounts:lookup', { localId: [String(username)] });
  return !!(r.ok && r.data.users && r.data.users.length);
}

/**
 * Buat akun Firebase Auth untuk seorang pengguna.
 *
 * localId sengaja disamakan dengan username. Dengan begitu UID di Firebase
 * tetap sama seperti sebelumnya, dan SELURUH Security Rules yang sudah ada
 * tidak perlu diubah sama sekali.
 *
 * Aman dipanggil berulang: bila akunnya sudah ada, passwordnya diperbarui.
 */
function authBuatAkun(username, password, klaim) {
  const nama = String(username);
  const isi = {
    localId: nama,
    email: authEmailDariUsername(nama),
    password: String(password),
    emailVerified: false,
    displayName: nama
  };
  const r = authPanggil('/accounts', isi);
  if (r.ok) {
    // Peran DITANAM TERPISAH, sesudah akunnya jadi.
    //
    // Ini bukan gaya penulisan, melainkan keharusan: perintah pembuatan
    // akun di Firebase TIDAK mengenal kolom peran sama sekali, dan kolom
    // yang tidak dikenal dibuang diam-diam tanpa pesan galat apa pun.
    // Dulu peran dititipkan di perintah pembuatan itu — akibatnya setiap
    // akun yang BENAR-BENAR baru lahir tanpa peran, dan akun tanpa peran
    // selalu ditolak jalur cepat.
    //
    // Gejalanya menyesatkan: pengguna lama tetap kencang (akunnya sudah
    // ada lebih dulu, jadi lewat perintah perubahan yang memang mengenal
    // peran), sedangkan UMKM yang baru didaftarkan selalu lambat pada
    // login pertamanya.
    if (klaim) authSetKlaim(nama, klaim);
    return { dibuat: true };
  }

  // Sudah ada → perbarui saja passwordnya
  if (r.teks.indexOf('DUPLICATE_LOCAL_ID') > -1 || r.teks.indexOf('EMAIL_EXISTS') > -1) {
    authUbahPassword(nama, password, klaim);
    return { dibuat: false, diperbarui: true };
  }
  throw new Error('Gagal membuat akun login: ' + r.teks);
}

/** Ubah password dan/atau klaim sebuah akun. */
function authUbahPassword(username, passwordBaru, klaim) {
  const isi = { localId: String(username) };
  if (passwordBaru) isi.password = String(passwordBaru);
  if (klaim) isi.customAttributes = JSON.stringify(klaim);
  // Pastikan emailnya ikut benar bila akun lama belum punya
  isi.email = authEmailDariUsername(username);

  const r = authPanggil('/accounts:update', isi);
  if (!r.ok) throw new Error('Gagal memperbarui akun login: ' + r.teks);
  return true;
}

/** Perbarui klaim peran & cabang tanpa menyentuh password. */
function authSetKlaim(username, klaim) {
  const r = authPanggil('/accounts:update', {
    localId: String(username),
    customAttributes: JSON.stringify(klaim || {})
  });
  if (!r.ok) throw new Error('Gagal memperbarui peran akun: ' + r.teks);
  return true;
}

/** Hapus akun Firebase Auth. Tidak dianggap gagal bila memang tidak ada. */
function authHapusAkun(username) {
  const r = authPanggil('/accounts:delete', { localId: String(username) });
  return r.ok || r.teks.indexOf('USER_NOT_FOUND') > -1;
}

/** Susun klaim dari dokumen pengguna di Firestore. */
function authKlaimDariUser(user) {
  return {
    role: String(user.role || ''),
    cabang: String(user.cabang || ''),
    idUmkm: String(user.idUmkm || '')
  };
}

// ════════════════════════════════════════════════════════
// PEMERIKSAAN & PENYIAPAN
// ════════════════════════════════════════════════════════

/**
 * Uji seluruh jalur Firebase Auth memakai akun percobaan.
 * Jalankan SEKALI setelah memasang modul ini.
 */
function tesKoneksiAuth() {
  const NAMA_UJI = '__uji_auth_sipuma__';
  Logger.log('🔍 Menguji jalur Firebase Authentication...');
  Logger.log('');

  try {
    Logger.log('1️⃣  Mengambil izin pengelolaan akun...');
    authAccessToken();
    Logger.log('    ✅ Berhasil');

    Logger.log('2️⃣  Menghitung email bayangan...');
    Logger.log('    "Admin" → ' + authEmailDariUsername('Admin'));
    Logger.log('    "D\'Shafa Catering" → ' + authEmailDariUsername("D'Shafa Catering"));

    Logger.log('3️⃣  Membuat akun percobaan...');
    authBuatAkun(NAMA_UJI, 'RahasiaUji#2026', { role: 'umkm', cabang: 'CAKUNG', idUmkm: 'UJI0001' });
    Logger.log('    ✅ Berhasil');

    Logger.log('4️⃣  Memastikan akunnya ada...');
    Logger.log('    ' + (authAdaAkun(NAMA_UJI) ? '✅ Ditemukan' : '❌ Tidak ditemukan'));

    Logger.log('5️⃣  Mengubah password akun percobaan...');
    authUbahPassword(NAMA_UJI, 'RahasiaBaru#2026');
    Logger.log('    ✅ Berhasil');

    Logger.log('6️⃣  Menghapus akun percobaan...');
    Logger.log('    ' + (authHapusAkun(NAMA_UJI) ? '✅ Terhapus' : '⚠️  Gagal — hapus manual di Console'));

    Logger.log('');
    Logger.log('═══════════════════════════════');
    Logger.log('✅ SELURUH JALUR AUTH NORMAL.');
    Logger.log('');
    Logger.log('Langkah berikutnya: pastikan metode "Email/Password" sudah');
    Logger.log('diaktifkan di Firebase Console → Authentication → Sign-in method.');
  } catch (e) {
    Logger.log('');
    Logger.log('❌ GAGAL: ' + e.message);
    Logger.log('');
    Logger.log('Bila pesannya soal izin: jalankan otorisasiDrive(), setujui');
    Logger.log('SELURUH izin yang diminta, lalu jalankan fungsi ini lagi.');
    try { authHapusAkun(NAMA_UJI); } catch (x) {}
  }
}

/**
 * Lihat berapa banyak pengguna yang sudah punya akun jalur cepat.
 * Berguna untuk memantau perpindahan bertahap.
 */
function lihatKemajuanPerpindahan() {
  Logger.log('📊 Memeriksa kemajuan perpindahan ke jalur cepat...');
  Logger.log('');
  let sudah = 0, belum = 0;
  const belumDaftar = [];

  try {
    const users = fbBacaKoleksi('users');
    users.forEach(function (u) {
      const nama = u.username || u._id;
      if (authAdaAkun(nama)) sudah++;
      else { belum++; if (belumDaftar.length < 25) belumDaftar.push(nama); }
    });
  } catch (e) {
    Logger.log('❌ Gagal membaca daftar pengguna: ' + e.message);
    return;
  }

  Logger.log('Sudah di jalur cepat : ' + sudah);
  Logger.log('Masih jalur lama     : ' + belum);
  Logger.log('');
  if (belum) {
    Logger.log('Belum pindah (akan pindah sendiri setelah login sekali):');
    belumDaftar.forEach(function (n) { Logger.log('  • ' + n); });
    if (belum > belumDaftar.length) Logger.log('  … dan ' + (belum - belumDaftar.length) + ' lainnya');
  } else {
    Logger.log('✅ Semua pengguna sudah di jalur cepat.');
    Logger.log('   Jalur lama boleh dimatikan bila Anda mau.');
  }
}

// ════════════════════════════════════════════════════════
// SESI GAS DARI TOKEN FIREBASE
// ════════════════════════════════════════════════════════
/**
 * Terbitkan sesi GAS berdasarkan token Firebase yang sedang berlaku.
 *
 * Diperlukan karena pengguna yang masuk lewat jalur cepat tidak pernah
 * menyentuh GAS, sehingga tidak punya sesi GAS. Padahal sesi itu masih
 * dibutuhkan untuk tiga hal: unggah berkas ke Drive, reset password, dan
 * penulisan kredensial.
 *
 * Tokennya diperiksa ke Firebase lebih dulu — jadi tidak ada yang bisa
 * menerbitkan sesi hanya dengan menebak nama pengguna.
 *
 * Dipanggil hanya SAAT DIBUTUHKAN, bukan saat login. Dengan begitu login
 * tetap tidak menyentuh GAS sama sekali.
 */
function apiSesiDariToken(idToken) {
  try {
    if (!idToken) throw new Error('Token tidak disertakan.');

    const r = authPanggil('/accounts:lookup', { idToken: String(idToken) });
    if (!r.ok || !r.data.users || !r.data.users.length) {
      return createResponse(false, null, 'Sesi tidak sah. Silakan login ulang.');
    }

    const akun = r.data.users[0];
    const username = akun.localId;

    // Peran diambil dari Firestore, BUKAN dari klaim di token.
    // Klaim bisa tertinggal bila peran baru saja diubah; Firestore selalu
    // yang terbaru.
    const user = fbAmbilDokumen('users', username);
    if (!user) return createResponse(false, null, 'Data pengguna tidak ditemukan.');
    if (String(user.statusAkses) !== 'Allowed') {
      return createResponse(false, null, 'Akses Anda sedang diblokir.');
    }

    const role = String(user.role || '');
    const tokenGas = buatTokenAcak();
    simpanSesi(tokenGas, {
      Username: username,
      Role: (role === 'stakeholder') ? 'UT' : (role === 'umkm' ? 'UMKM' : 'Admin'),
      IDUMKM: user.idUmkm || ''
    });

    return createResponse(true, { tokenGas: tokenGas }, 'Sesi berkas disiapkan.');
  } catch (error) {
    return createResponse(false, null, 'Gagal menyiapkan sesi: ' + error.message);
  }
}

// ════════════════════════════════════════════════════════
// DIAGNOSIS JALUR CEPAT
// ════════════════════════════════════════════════════════
/**
 * Periksa keadaan akun jalur cepat seorang pengguna.
 *
 * Ganti NAMA di bawah dengan username yang ingin diperiksa, lalu jalankan.
 */
function diagnosaJalurCepat() {
  const NAMA = 'Admin';

  Logger.log('🔍 Memeriksa jalur cepat untuk "' + NAMA + '"...');
  Logger.log('');

  Logger.log('Email bayangan yang dihitung server:');
  Logger.log('   ' + authEmailDariUsername(NAMA));
  Logger.log('');
  Logger.log('   Bandingkan dengan yang dihitung browser — buka aplikasi,');
  Logger.log('   tekan F12 → Console, lalu ketik:');
  Logger.log('      await emailDariUsername("' + NAMA + '")');
  Logger.log('   Keduanya HARUS sama persis.');
  Logger.log('');

  try {
    const r = authPanggil('/accounts:lookup', { localId: [NAMA] });
    if (!r.ok) {
      Logger.log('❌ Gagal memeriksa akun: ' + r.teks);
      return;
    }
    if (!r.data.users || !r.data.users.length) {
      Logger.log('❌ AKUN JALUR CEPAT BELUM ADA.');
      Logger.log('');
      Logger.log('   Artinya pembuatan akun saat login gagal, atau GAS belum');
      Logger.log('   di-deploy ulang sehingga kode barunya belum berjalan.');
      Logger.log('');
      Logger.log('   Coba buat sekarang untuk melihat sebab kegagalannya:');
      Logger.log('      jalankan buatAkunUjiSekarang()');
      return;
    }

    const u = r.data.users[0];
    Logger.log('✅ Akun jalur cepat ADA.');
    Logger.log('   localId (UID) : ' + u.localId);
    Logger.log('   email         : ' + u.email);
    Logger.log('   punya password: ' + (u.passwordHash ? 'ya' : 'TIDAK'));
    Logger.log('   klaim         : ' + (u.customAttributes || '(kosong)'));
    Logger.log('');

    if (u.email !== authEmailDariUsername(NAMA)) {
      Logger.log('⚠️  EMAIL TIDAK COCOK dengan rumus yang berlaku sekarang.');
      Logger.log('    Akunnya ada tetapi tidak akan pernah ditemukan saat login.');
    }
    if (!u.customAttributes || u.customAttributes === '{}') {
      Logger.log('⚠️  KLAIM KOSONG — peran tidak tertanam, login cepat akan');
      Logger.log('    jatuh kembali ke jalur lama.');
    }
  } catch (e) {
    Logger.log('❌ ' + e.message);
  }
}

/**
 * Coba buat satu akun jalur cepat dan tampilkan sebab kegagalannya
 * secara utuh. Dipakai bila diagnosaJalurCepat() bilang akunnya belum ada.
 */
function buatAkunUjiSekarang() {
  const NAMA = '__uji_buat_akun__';
  try {
    Logger.log('Mencoba membuat akun percobaan...');
    const hasil = authBuatAkun(NAMA, 'UjiCoba#2026', { role: 'umkm', cabang: 'CAKUNG', idUmkm: 'UJI' });
    Logger.log('✅ BERHASIL: ' + JSON.stringify(hasil));
    Logger.log('');
    Logger.log('Berarti jalur pembuatan akun normal. Bila login tetap tidak');
    Logger.log('membuat akun, kemungkinan besar GAS BELUM DI-DEPLOY ULANG —');
    Logger.log('aplikasi masih memanggil versi lama.');
    Logger.log('');
    Logger.log('Perbaikan: Deploy → Manage deployments → pensil →');
    Logger.log('           Version: New version → Deploy');
    authHapusAkun(NAMA);
    Logger.log('(akun percobaan sudah dihapus)');
  } catch (e) {
    Logger.log('❌ GAGAL: ' + e.message);
    Logger.log('');
    Logger.log('Inilah sebab akun jalur cepat tidak pernah terbentuk.');
    Logger.log('Kirimkan pesan di atas apa adanya.');
  }
}
