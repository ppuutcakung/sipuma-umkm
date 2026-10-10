// ════════════════════════════════════════════════════════
// MODUL FIREBASE — Penerbit Token & Jembatan Firestore
// ════════════════════════════════════════════════════════
// Berkas ini membuat GAS bisa:
//   1. Menerbitkan Firebase Custom Token setelah login diverifikasi
//   2. Membaca & menulis Firestore lewat REST API (untuk pemindahan data
//      dan pencadangan harian)
//
// ⚠️ KREDENSIAL TIDAK DITULIS DI SINI.
// Service account disimpan di Script Properties agar tidak ikut tersalin
// saat berkas ini dibagikan. Jalankan siapkanKredensialFirebase() sekali
// untuk mengisinya (lihat petunjuk di fungsi tersebut).

const FB_PROJECT_ID = 'sipuma-ppu';

// Cakupan izin yang diminta saat GAS berbicara dengan Firestore
const FB_SCOPE_FIRESTORE = 'https://www.googleapis.com/auth/datastore';
const FB_AUD_IDENTITY =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

// ════════════════════════════════════════════════════════
// KREDENSIAL
// ════════════════════════════════════════════════════════

/**
 * Isi kredensial service account SEKALI SAJA.
 *
 * CARA PAKAI:
 *   1. Buka berkas JSON service account dari Firebase
 *   2. Tempel nilai client_email dan private_key di bawah ini
 *   3. Jalankan fungsi ini satu kali
 *   4. HAPUS KEMBALI kedua nilai itu dari kode ini, lalu Simpan
 *
 * Setelah tersimpan di Script Properties, kredensial tidak lagi
 * perlu ada di dalam kode.
 */
function siapkanKredensialFirebase() {
  const CLIENT_EMAIL = 'ISI_DISINI@sipuma-ppu.iam.gserviceaccount.com';
  const PRIVATE_KEY  = '-----BEGIN PRIVATE KEY-----\nISI_DISINI\n-----END PRIVATE KEY-----\n';

  if (CLIENT_EMAIL.indexOf('ISI_DISINI') > -1 || PRIVATE_KEY.indexOf('ISI_DISINI') > -1) {
    Logger.log('❌ Kredensial belum diisi.');
    Logger.log('   Buka fungsi siapkanKredensialFirebase(), isi CLIENT_EMAIL dan');
    Logger.log('   PRIVATE_KEY dari berkas JSON service account, lalu jalankan lagi.');
    return;
  }

  PropertiesService.getScriptProperties().setProperties({
    'FB_CLIENT_EMAIL': CLIENT_EMAIL,
    'FB_PRIVATE_KEY': PRIVATE_KEY
  });
  Logger.log('✅ Kredensial Firebase tersimpan di Script Properties.');
  Logger.log('⚠️  Sekarang HAPUS kembali kedua nilai itu dari kode, lalu Simpan.');
  Logger.log('   Berikutnya jalankan tesKoneksiFirebase() untuk memastikan berfungsi.');
}

function fbKredensial() {
  const p = PropertiesService.getScriptProperties();
  const email = p.getProperty('FB_CLIENT_EMAIL');
  const key = p.getProperty('FB_PRIVATE_KEY');
  if (!email || !key) {
    throw new Error('Kredensial Firebase belum disiapkan. Jalankan siapkanKredensialFirebase() terlebih dahulu.');
  }
  return { email: email, key: key.replace(/\\n/g, '\n') };
}

// ════════════════════════════════════════════════════════
// PENANDATANGANAN JWT
// ════════════════════════════════════════════════════════

function fbBase64Url(teksAtauBytes) {
  const b = (typeof teksAtauBytes === 'string')
    ? Utilities.base64EncodeWebSafe(teksAtauBytes, Utilities.Charset.UTF_8)
    : Utilities.base64EncodeWebSafe(teksAtauBytes);
  return b.replace(/=+$/, '');
}

/** Bangun JWT bertanda tangan RS256 memakai kunci service account. */
function fbBuatJWT(payload) {
  const k = fbKredensial();
  const header = { alg: 'RS256', typ: 'JWT' };
  const isi = fbBase64Url(JSON.stringify(header)) + '.' + fbBase64Url(JSON.stringify(payload));
  const tandaTangan = Utilities.computeRsaSha256Signature(isi, k.key);
  return isi + '.' + fbBase64Url(tandaTangan);
}

/**
 * Terbitkan Custom Token untuk seorang pengguna.
 * Peran & cabang ditanam sebagai custom claims — inilah yang nanti
 * dibaca Firestore Security Rules. Pengguna tidak dapat memalsukannya
 * karena token ditandatangani kunci rahasia di server.
 */
function fbBuatCustomToken(uid, claims) {
  const k = fbKredensial();
  const now = Math.floor(Date.now() / 1000);
  return fbBuatJWT({
    iss: k.email,
    sub: k.email,
    aud: FB_AUD_IDENTITY,
    iat: now,
    exp: now + 3600,          // token login berlaku 1 jam; sesi diperpanjang di sisi klien
    uid: String(uid),
    claims: claims || {}
  });
}

/** Ambil access token OAuth untuk berbicara dengan Firestore REST API. */
function fbAccessToken() {
  const cache = CacheService.getScriptCache();
  const tersimpan = cache.get('fb_access_token');
  if (tersimpan) return tersimpan;

  const k = fbKredensial();
  const now = Math.floor(Date.now() / 1000);
  const jwt = fbBuatJWT({
    iss: k.email,
    scope: FB_SCOPE_FIRESTORE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  if (!data.access_token) {
    throw new Error('Gagal mendapatkan access token Firebase: ' + res.getContentText());
  }
  cache.put('fb_access_token', data.access_token, 3300);   // simpan 55 menit
  return data.access_token;
}

// ════════════════════════════════════════════════════════
// PENERJEMAH NILAI FIRESTORE
// ════════════════════════════════════════════════════════
// Firestore REST memakai bentuk bertipe: {stringValue}, {integerValue}, dst.

function fbKeNilai(v) {
  if (v === null || v === undefined || v === '') return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(fbKeNilai) } };
  }
  if (typeof v === 'object') {
    const f = {};
    Object.keys(v).forEach(function (kk) { f[kk] = fbKeNilai(v[kk]); });
    return { mapValue: { fields: f } };
  }
  return { stringValue: String(v) };
}

function fbDariNilai(v) {
  if (!v) return null;
  if (v.nullValue !== undefined) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.timestampValue !== undefined) return new Date(v.timestampValue);
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fbDariNilai);
  if (v.mapValue !== undefined) {
    const o = {};
    const f = v.mapValue.fields || {};
    Object.keys(f).forEach(function (kk) { o[kk] = fbDariNilai(f[kk]); });
    return o;
  }
  return null;
}

function fbKeDokumen(obj) {
  const fields = {};
  Object.keys(obj).forEach(function (k) { fields[k] = fbKeNilai(obj[k]); });
  return { fields: fields };
}

// ════════════════════════════════════════════════════════
// OPERASI FIRESTORE
// ════════════════════════════════════════════════════════

function fbUrlDasar() {
  return 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT_ID +
         '/databases/(default)/documents';
}

/** Tulis satu dokumen (menimpa bila sudah ada). */
function fbTulis(koleksi, docId, data) {
  const url = fbUrlDasar() + '/' + koleksi + '/' + encodeURIComponent(docId);
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + fbAccessToken() },
    payload: JSON.stringify(fbKeDokumen(data)),
    muteHttpExceptions: true
  });
  const kode = res.getResponseCode();
  if (kode < 200 || kode >= 300) {
    throw new Error('Gagal menulis ' + koleksi + '/' + docId + ': ' + res.getContentText());
  }
  return true;
}

/**
 * Perbarui SEBAGIAN field sebuah dokumen, tanpa menyentuh field lainnya.
 *
 * ⚠️ PENTING — bedanya dengan fbTulis():
 * PATCH Firestore TANPA updateMask akan MENGGANTI SELURUH dokumen dengan
 * field yang dikirim; field lain ikut terhapus. Untuk memperbarui
 * sebagian, updateMask WAJIB disertakan agar hanya field yang disebut
 * yang tersentuh.
 */
function fbPerbarui(koleksi, docId, data) {
  const kunci = Object.keys(data);
  if (!kunci.length) return true;
  const mask = kunci.map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  const url = fbUrlDasar() + '/' + koleksi + '/' + encodeURIComponent(docId) + '?' + mask;
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + fbAccessToken() },
    payload: JSON.stringify(fbKeDokumen(data)),
    muteHttpExceptions: true
  });
  const kode = res.getResponseCode();
  if (kode < 200 || kode >= 300) {
    throw new Error('Gagal memperbarui ' + koleksi + '/' + docId + ': ' + res.getContentText());
  }
  return true;
}

/**
 * Tulis banyak dokumen sekaligus.
 * Firestore membatasi 500 operasi per batch, jadi dipecah otomatis.
 */
function fbTulisBanyak(koleksi, daftar) {
  if (!daftar.length) return 0;
  const url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT_ID +
              '/databases/(default)/documents:commit';
  const token = fbAccessToken();
  let total = 0;

  for (let i = 0; i < daftar.length; i += 400) {
    const potongan = daftar.slice(i, i + 400);
    const writes = potongan.map(function (d) {
      const dok = fbKeDokumen(d.data);
      dok.name = 'projects/' + FB_PROJECT_ID + '/databases/(default)/documents/' +
                 koleksi + '/' + d.id;
      return { update: dok };
    });
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ writes: writes }),
      muteHttpExceptions: true
    });
    const kode = res.getResponseCode();
    if (kode < 200 || kode >= 300) {
      throw new Error('Gagal menulis batch ke ' + koleksi + ': ' + res.getContentText());
    }
    total += potongan.length;
    Logger.log('   ' + koleksi + ': ' + total + '/' + daftar.length);
  }
  return total;
}

/** Ambil seluruh dokumen sebuah koleksi (dipakai untuk pencadangan). */
function fbBacaKoleksi(koleksi) {
  const hasil = [];
  let pageToken = '';
  do {
    const url = fbUrlDasar() + '/' + koleksi + '?pageSize=300' +
                (pageToken ? '&pageToken=' + pageToken : '');
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + fbAccessToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Gagal membaca ' + koleksi + ': ' + res.getContentText());
    }
    const data = JSON.parse(res.getContentText());
    (data.documents || []).forEach(function (d) {
      const obj = { _id: d.name.split('/').pop() };
      const f = d.fields || {};
      Object.keys(f).forEach(function (k) { obj[k] = fbDariNilai(f[k]); });
      hasil.push(obj);
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return hasil;
}

// ════════════════════════════════════════════════════════
// UJI KONEKSI
// ════════════════════════════════════════════════════════

/** Jalankan setelah kredensial diisi, untuk memastikan semuanya berfungsi. */
function tesKoneksiFirebase() {
  Logger.log('🔍 Menguji koneksi Firebase...');
  try {
    Logger.log('1️⃣  Mengambil access token...');
    const t = fbAccessToken();
    Logger.log('   ✅ Berhasil (' + t.substring(0, 18) + '...)');

    Logger.log('2️⃣  Menulis dokumen uji...');
    fbTulis('_uji', 'koneksi', {
      pesan: 'Koneksi Firebase berhasil',
      waktu: new Date(),
      angka: 123,
      pecahan: 45.6,
      benar: true
    });
    Logger.log('   ✅ Berhasil menulis');

    Logger.log('3️⃣  Membaca kembali...');
    const isi = fbBacaKoleksi('_uji');
    Logger.log('   ✅ Terbaca: ' + JSON.stringify(isi));

    Logger.log('4️⃣  Menerbitkan custom token...');
    const ct = fbBuatCustomToken('uji-user', { role: 'admin', cabang: 'CAKUNG' });
    Logger.log('   ✅ Token terbit (' + ct.length + ' karakter)');

    Logger.log('');
    Logger.log('✅ SEMUA BERHASIL. Firebase siap dipakai.');
    Logger.log('   Koleksi "_uji" boleh dihapus manual dari konsol Firestore.');
  } catch (e) {
    Logger.log('');
    Logger.log('❌ GAGAL: ' + e.message);
    Logger.log('   Periksa kembali kredensial di Script Properties.');
  }
}

// ════════════════════════════════════════════════════════
// LOGIN VERSI FIREBASE — Verifikasi lalu Terbitkan Token
// ════════════════════════════════════════════════════════
// Alur:
//   1. Frontend kirim username + password ke sini
//   2. GAS cocokkan dengan hash di koleksi "kredensial"
//      (koleksi itu tertutup bagi frontend — hanya GAS yang boleh membaca)
//   3. GAS terbitkan Custom Token berisi peran, cabang, dan idUmkm
//   4. Frontend masuk ke Firestore memakai token itu
//
// Sejak titik ini, hak akses ditegakkan Firestore Security Rules —
// bukan lagi oleh kode kita.

/** Ambil satu dokumen Firestore berdasarkan id. */
function fbAmbilDokumen(koleksi, docId) {
  const url = fbUrlDasar() + '/' + koleksi + '/' + encodeURIComponent(docId);
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + fbAccessToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) {
    throw new Error('Gagal membaca ' + koleksi + '/' + docId + ': ' + res.getContentText());
  }
  const d = JSON.parse(res.getContentText());
  const obj = { _id: docId };
  const f = d.fields || {};
  Object.keys(f).forEach(function (k) { obj[k] = fbDariNilai(f[k]); });
  return obj;
}

/**
 * Login versi Firebase. Dipanggil frontend lewat action 'loginFirebase'.
 * Mengembalikan Custom Token bila berhasil.
 */
function apiLoginFirebase(payload) {
  try {
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');
    const roleDiminta = String(payload.role || '').trim();

    if (!username || !password) {
      return createResponse(false, null, 'Username dan password wajib diisi.');
    }
    if (cekKuncianLogin(username)) {
      return createResponse(false, null,
        'Terlalu banyak percobaan login gagal. Silakan tunggu ' + KUNCI_LOGIN_MENIT + ' menit.');
    }

    const user = fbAmbilDokumen('users', username);
    const kred = fbAmbilDokumen('kredensial', username);

    // Pesan kegagalan SENGAJA disamakan agar tidak membocorkan
    // username mana yang benar-benar terdaftar.
    if (!user || !kred) {
      catatGagalLogin(username);
      return createResponse(false, null, 'Username atau password salah.');
    }

    // Peran yang dipilih di halaman login harus cocok dengan yang terdaftar
    const petaRole = { 'UMKM': 'umkm', 'Admin': 'admin', 'UT': 'stakeholder' };
    const roleHarapan = petaRole[roleDiminta] || roleDiminta.toLowerCase();
    const roleAsli = String(user.role || '').toLowerCase();
    const cocokRole = (roleAsli === roleHarapan) ||
                      (roleHarapan === 'admin' && roleAsli === 'superadmin');
    if (!cocokRole) {
      catatGagalLogin(username);
      return createResponse(false, null, 'Username atau password salah.');
    }

    if (!bandinganAman(kred.hash, buatHashPassword(password, kred.salt))) {
      const n = catatGagalLogin(username);
      const sisa = MAKS_GAGAL_LOGIN - n;
      return createResponse(false, null,
        'Username atau password salah.' + (sisa > 0 && sisa <= 2 ? ' Sisa ' + sisa + ' percobaan.' : ''));
    }
    if (String(user.statusAkses) !== 'Allowed') {
      return createResponse(false, null, 'Akses Anda sedang diblokir. Hubungi admin.');
    }

    resetGagalLogin(username);

    // Peran & cabang ditanam di token — inilah yang dibaca Security Rules.
    // Pengguna tidak dapat memalsukannya: token ditandatangani kunci server.
    const token = fbBuatCustomToken(username, {
      role: roleAsli,
      cabang: String(user.cabang || ''),
      idUmkm: String(user.idUmkm || '')
    });

    // Sebagian operasi tetap harus lewat GAS: unggah berkas ke Drive dan
    // penulisan koleksi `kredensial` yang tertutup bagi browser. GAS perlu
    // cara mengenali pemanggilnya, jadi sesi GAS diterbitkan sekalian di
    // sini — tanpa ini, permintaan ke GAS akan selalu ditolak.
    // ── Perpindahan bertahap ke jalur cepat ──
    // Password aslinya hanya ADA di tangan kita pada detik ini — sesudahnya
    // yang tersimpan cuma hash yang tidak bisa dibalik. Jadi inilah satu-
    // satunya saat akun Firebase Auth bisa dibuatkan tanpa meminta siapa
    // pun mengganti passwordnya.
    //
    // Setelah ini, login berikutnya milik orang tersebut langsung lewat
    // Firebase Auth — tidak lagi melalui GAS.
    //
    // Kegagalannya SENGAJA diabaikan: login yang sedang berjalan tidak
    // boleh gagal hanya karena pembuatan akun jalur cepat bermasalah.
    let galatJalurCepat = '';
    try {
      authBuatAkun(username, password, {
        role: roleAsli,
        cabang: String(user.cabang || ''),
        idUmkm: String(user.idUmkm || '')
      });
    } catch (e) {
      // Kegagalannya DISERTAKAN dalam jawaban, bukan hanya dicatat di Log.
      // Sebelumnya hanya masuk Logger — tidak terlihat siapa pun, sehingga
      // satu-satunya gejala adalah "login kok masih lambat" tanpa petunjuk
      // apa pun tentang sebabnya.
      galatJalurCepat = e.message;
      Logger.log('Jalur cepat belum terbentuk untuk "' + username + '": ' + e.message);
    }

    const tokenGas = buatTokenAcak();
    simpanSesi(tokenGas, {
      Username: username,
      Role: (roleAsli === 'stakeholder') ? 'UT' : (roleAsli === 'umkm' ? 'UMKM' : 'Admin'),
      IDUMKM: user.idUmkm || ''
    });

    return createResponse(true, {
      customToken: token,
      tokenGas: tokenGas,
      // Kosong bila akun jalur cepat berhasil dibuat. Berisi sebab
      // kegagalannya bila tidak — ditampilkan di Console browser.
      galatJalurCepat: galatJalurCepat,
      profil: {
        username: user.username || username,
        role: roleAsli,
        cabang: user.cabang || '',
        idUmkm: user.idUmkm || '',
        fotoURL: user.fotoURL || '',
        alamat: user.alamat || '',
        passwordDiubah: user.passwordDiubah === true
      }
    }, 'Login berhasil. Selamat datang, ' + (user.username || username) + '!');
  } catch (error) {
    return createResponse(false, null, 'Kesalahan server: ' + error.message);
  }
}

/**
 * Perbarui password di Firestore (dipakai Admin lewat Reset Password).
 * Sengaja tetap lewat GAS: koleksi "kredensial" tertutup bagi frontend.
 */
function apiResetPasswordFirebase(username, passwordBaru) {
  try {
    if (!username) throw new Error('Username wajib diisi.');
    if (!passwordBaru || String(passwordBaru).length < 6) {
      throw new Error('Password baru minimal 6 karakter.');
    }
    const salt = buatSaltAcak();
    fbTulis('kredensial', username, {
      username: username,
      hash: buatHashPassword(String(passwordBaru), salt),
      salt: salt
    });
    // Kembalikan status jadi "belum diganti" — password ini dibuat Admin
    // dan diketahui orang lain, jadi pemiliknya perlu diminta menggantinya.
    try { fbPerbarui('users', username, { passwordDiubah: false }); } catch (e) {}

    // WAJIB: akun jalur cepat ikut diubah passwordnya. Tanpa ini, pengguna
    // masih bisa masuk memakai password LAMA lewat Firebase Auth — reset
    // tampak berhasil padahal tidak berlaku.
    try {
      const u = fbAmbilDokumen('users', username);
      authBuatAkun(username, passwordBaru, u ? authKlaimDariUser(u) : null);
    } catch (e) {
      return createResponse(false, null,
        'Password di basis data berhasil diubah, TETAPI akun login cepat gagal ' +
        'diperbarui: ' + e.message + ' — mohon coba sekali lagi.');
    }

    return createResponse(true, null,
      'Password "' + username + '" berhasil diubah. Sampaikan kepada yang bersangkutan, ' +
      'dan minta ia segera menggantinya sendiri lewat Pengaturan Akun.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Uji login Firebase tanpa lewat browser. Ganti nilainya lalu jalankan. */
function tesLoginFirebase() {
  const hasil = apiLoginFirebase({ role: 'Admin', username: 'Admin', password: 'GANTI_PASSWORD' });
  Logger.log(JSON.stringify({
    success: hasil.success,
    message: hasil.message,
    profil: hasil.data ? hasil.data.profil : null,
    panjangToken: hasil.data ? hasil.data.customToken.length : 0
  }, null, 2));
}


// ════════════════════════════════════════════════════════
// KREDENSIAL UMKM BARU
// ════════════════════════════════════════════════════════

/**
 * Buat kredensial login untuk UMKM yang baru didaftarkan.
 *
 * Dijalankan lewat GAS karena koleksi `kredensial` sengaja tertutup bagi
 * browser — hash password tidak boleh pernah bisa ditulis dari sisi klien.
 *
 * Password awalnya adalah Kode Unik UMKM, sama seperti perilaku lama.
 */
function apiBuatKredensialUMKM(username, passwordAwal, klaim) {
  try {
    if (!username || !passwordAwal) throw new Error('Username dan password awal wajib diisi.');
    const salt = buatSaltAcak();
    fbTulis('kredensial', username, {
      username: username,
      hash: buatHashPassword(String(passwordAwal), salt),
      salt: salt
    });

    // Sekalian buatkan akun jalur cepat, supaya UMKM baru tidak perlu
    // melewati jalur lama sama sekali — login pertamanya sudah kencang.
    //
    // Peran diambil dari yang DIKIRIM pemanggil lebih dulu. Dulu peran ini
    // selalu dibaca ulang dari koleksi `users`; bila pembacaan itu meleset
    // walau sekejap, akunnya terbentuk TANPA peran — dan akun tanpa peran
    // selalu ditolak jalur cepat, sehingga login pertama UMKM baru tetap
    // lambat. Pembacaan `users` kini hanya dipakai sebagai cadangan.
    let k = klaim;
    if (!k || !k.role) {
      const u = fbAmbilDokumen('users', username);
      k = u ? authKlaimDariUser(u) : null;
    }
    // Bila perannya tetap tidak diketahui, akun jalur cepat SENGAJA tidak
    // dibuat — akun tanpa peran justru lebih berbahaya daripada tidak ada.
    // UMKM-nya tetap bisa masuk lewat jalur lama, dan akun cepatnya akan
    // terbentuk sendiri pada login pertamanya. Jadi ini bukan kegagalan.
    if (!k || !k.role) {
      Logger.log('Peran "' + username + '" tidak diketahui — akun jalur cepat dilewati.');
      return createResponse(true, null,
        'Kredensial login berhasil dibuat (login pertamanya akan sedikit lebih lama).');
    }
    authBuatAkun(username, passwordAwal, k);

    return createResponse(true, null, 'Kredensial login berhasil dibuat.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Hapus kredensial saat UMKM atau user dihapus. */
function apiHapusKredensial(username) {
  try {
    UrlFetchApp.fetch(fbUrlDasar() + '/kredensial/' + encodeURIComponent(username), {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + fbAccessToken() },
      muteHttpExceptions: true
    });
    // Akun jalur cepat ikut dihapus. Tanpa ini, orang yang sudah dihapus
    // masih bisa masuk lewat Firebase Auth.
    try { authHapusAkun(username); } catch (e) {}
    return createResponse(true, null, 'Kredensial dihapus.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/**
 * Pindahkan kredensial login ke username baru — dipakai saat nama UMKM
 * diubah di Data Master.
 *
 * Nama UMKM sekaligus menjadi username loginnya. Dulu mengganti nama di
 * Data Master tidak ikut mengganti akun loginnya, sehingga UMKM tetap harus
 * masuk memakai nama LAMA — membingungkan, dan tidak ada petunjuk apa pun
 * di layar tentang nama mana yang berlaku.
 *
 * Password-nya TIDAK berubah: yang dipindahkan hanya sidik password (hash)
 * beserta garamnya, jadi UMKM tetap masuk dengan password yang sama.
 *
 * Akun jalur cepat atas nama LAMA dihapus — kalau dibiarkan, nama lama
 * masih bisa dipakai masuk. Akun jalur cepat atas nama BARU tidak dapat
 * dibuat di sini karena passwordnya hanya tersimpan sebagai sidik yang
 * tidak bisa dibalik; akun itu terbentuk sendiri pada login pertamanya.
 */
function apiPindahKredensial(namaLama, namaBaru) {
  try {
    const lama = String(namaLama || '').trim();
    const baru = String(namaBaru || '').trim();
    if (!lama || !baru) throw new Error('Nama lama dan nama baru wajib diisi.');
    if (lama === baru) return createResponse(true, null, 'Nama tidak berubah.');

    const kred = fbAmbilDokumen('kredensial', lama);
    if (!kred) {
      // Tidak ada yang perlu dipindahkan. Akun jalur cepat lama tetap
      // dibersihkan supaya nama lama benar-benar tidak bisa dipakai lagi.
      try { authHapusAkun(lama); } catch (e) {}
      return createResponse(true, null, 'Tidak ada kredensial lama yang perlu dipindahkan.');
    }

    fbTulis('kredensial', baru, {
      username: baru,
      hash: kred.hash,
      salt: kred.salt
    });

    UrlFetchApp.fetch(fbUrlDasar() + '/kredensial/' + encodeURIComponent(lama), {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + fbAccessToken() },
      muteHttpExceptions: true
    });

    try { authHapusAkun(lama); } catch (e) {}

    return createResponse(true, null,
      'Akun login dipindahkan ke nama baru. Password tetap sama.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/** Hapus berkas foto dari Drive berdasarkan tautannya. */
function apiHapusBerkasFoto(url) {
  try {
    hapusBerkasDriveDariUrl(url);
    return createResponse(true, null, 'Berkas foto dihapus.');
  } catch (error) {
    // Kegagalan di sini tidak dianggap fatal — catatan fotonya tetap
    // dikosongkan di Firestore oleh pemanggil.
    return createResponse(true, null, 'Berkas tidak ditemukan, dilewati.');
  }
}

// ════════════════════════════════════════════════════════
// DIAGNOSIS UNGGAH FOTO
// ════════════════════════════════════════════════════════
/**
 * Menguji jalur unggah foto langkah demi langkah dan melaporkan persis
 * di mana kegagalannya. Jalankan dari editor Apps Script.
 *
 * Pesan "Akses ditolak: DriveApp" bisa berasal dari beberapa sebab yang
 * berbeda — fungsi ini memisahkannya supaya tidak perlu menebak.
 */
function diagnosaUnggahFoto() {
  Logger.log('🔍 Memeriksa jalur unggah foto...');
  Logger.log('');

  // 1 — Identitas yang menjalankan skrip
  try {
    Logger.log('1️⃣  Identitas penjalan skrip');
    Logger.log('    Effective user : ' + Session.getEffectiveUser().getEmail());
    try {
      Logger.log('    Active user    : ' + Session.getActiveUser().getEmail());
    } catch (e) {
      Logger.log('    Active user    : (tidak terbaca — wajar pada Web App anonim)');
    }
  } catch (e) {
    Logger.log('    ❌ ' + e.message);
  }
  Logger.log('');

  // 2 — Izin Drive paling dasar
  Logger.log('2️⃣  Izin dasar DriveApp');
  try {
    const rootNama = DriveApp.getRootFolder().getName();
    Logger.log('    ✅ DriveApp dapat diakses (root: ' + rootNama + ')');
  } catch (e) {
    Logger.log('    ❌ GAGAL DI SINI: ' + e.message);
    Logger.log('');
    Logger.log('    Artinya izin Drive memang belum diberikan ke skrip ini.');
    Logger.log('    Langkah pemulihan ada di bagian bawah log.');
    tampilkanCaraPulihkanDrive();
    return;
  }
  Logger.log('');

  // 3 — Konfigurasi folder
  Logger.log('3️⃣  Konfigurasi folder');
  let idFoto = '', idLaporan = '';
  try {
    idFoto = getConfig('fotoFolderId');
    idLaporan = getConfig('laporanFolderId');
    Logger.log('    fotoFolderId    : ' + (idFoto || '(KOSONG)'));
    Logger.log('    laporanFolderId : ' + (idLaporan || '(KOSONG)'));
    if (!idFoto) {
      Logger.log('    ❌ fotoFolderId kosong — unggah foto tidak akan pernah berhasil.');
      Logger.log('       Periksa sheet AppConfig di DB_SIPUMA.');
      return;
    }
  } catch (e) {
    Logger.log('    ❌ Gagal membaca konfigurasi: ' + e.message);
    return;
  }
  Logger.log('');

  // 4 — Akses ke folder tujuan
  Logger.log('4️⃣  Akses folder foto');
  let folder = null;
  try {
    folder = DriveApp.getFolderById(idFoto);
    Logger.log('    ✅ Folder terbaca: ' + folder.getName());
  } catch (e) {
    Logger.log('    ❌ GAGAL DI SINI: ' + e.message);
    Logger.log('');
    Logger.log('    Kemungkinan: folder sudah terhapus/dipindah, atau ID-nya keliru,');
    Logger.log('    atau folder itu milik akun lain yang tidak dibagikan.');
    Logger.log('    Jalankan buatUlangFolderFoto() untuk membuat folder baru.');
    return;
  }
  Logger.log('');

  // 5 — Uji tulis sungguhan
  Logger.log('5️⃣  Uji membuat berkas di folder itu');
  try {
    const blob = Utilities.newBlob('uji', 'text/plain', 'uji-sipuma.txt');
    const f = folder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('    ✅ Berhasil membuat berkas uji');
    f.setTrashed(true);
    Logger.log('    ✅ Berkas uji dihapus kembali');
  } catch (e) {
    Logger.log('    ❌ GAGAL DI SINI: ' + e.message);
    Logger.log('       Folder terbaca tetapi tidak bisa ditulisi.');
    return;
  }
  Logger.log('');
  Logger.log('═══════════════════════════════');
  Logger.log('✅ SELURUH JALUR DRIVE NORMAL.');
  Logger.log('');
  Logger.log('Bila aplikasi masih menolak, berarti masalahnya BUKAN di Drive');
  Logger.log('melainkan di DEPLOYMENT: versi yang dipakai aplikasi belum');
  Logger.log('memuat izin terbaru. Lakukan Deploy > Manage deployments >');
  Logger.log('Edit > Version: New version > Deploy.');
}

function tampilkanCaraPulihkanDrive() {
  Logger.log('    ── Cara memulihkan izin Drive ──');
  Logger.log('    a. Buka https://myaccount.google.com/permissions');
  Logger.log('    b. Cari "SIPUMA API" lalu HAPUS aksesnya');
  Logger.log('    c. Kembali ke Apps Script, jalankan lagi fungsi ini');
  Logger.log('    d. Setujui SELURUH izin yang diminta');
  Logger.log('    e. Deploy ulang (Manage deployments > Edit > New version)');
}

/** Benarkah folder ini bisa DITULISI, bukan sekadar terbaca? */
function folderBisaDitulisi(folder) {
  try {
    const f = folder.createFile(Utilities.newBlob('uji', 'text/plain', '.uji-sipuma'));
    f.setTrashed(true);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Siapkan satu folder yang BENAR-BENAR bisa ditulisi, lalu catat ID-nya.
 *
 * Penting: folder yang sudah ada TIDAK langsung dipakai — diuji tulis
 * dulu. Folder bermasalah biasanya tetap bernama sama (milik akun lain,
 * atau dibagikan hanya untuk dibaca), jadi mencarinya berdasarkan nama
 * saja justru akan mengembalikan folder yang sama dan masalahnya tidak
 * pernah selesai.
 */
function siapkanFolderTulis(namaDasar, kunciConfig) {
  Logger.log('📁 Menyiapkan folder: ' + namaDasar);

  const cari = DriveApp.getFoldersByName(namaDasar);
  while (cari.hasNext()) {
    const kandidat = cari.next();
    if (folderBisaDitulisi(kandidat)) {
      setConfig(kunciConfig, kandidat.getId());
      Logger.log('   ✅ Memakai folder yang sudah ada dan bisa ditulisi');
      Logger.log('      ID: ' + kandidat.getId());
      return kandidat;
    }
    Logger.log('   ⚠️  Folder bernama sama ditemukan tetapi TIDAK bisa ditulisi');
    Logger.log('      (kemungkinan milik akun lain) — dilewati');
  }

  // Tidak ada yang layak → buat baru atas nama akun ini, dengan penanda
  // waktu supaya tidak tertukar dengan folder lama yang bermasalah.
  const namaBaru = namaDasar + ' ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');
  const baru = DriveApp.createFolder(namaBaru);
  setConfig(kunciConfig, baru.getId());
  Logger.log('   ✅ Folder BARU dibuat: ' + namaBaru);
  Logger.log('      ID: ' + baru.getId());
  return baru;
}

/**
 * Perbaiki KEDUA folder sekaligus (foto profil & laporan CSR).
 * Keduanya dibuat dengan cara yang sama, jadi bila satu bermasalah
 * biasanya yang lain pun begitu.
 */
function perbaikiFolderDrive() {
  Logger.log('🔧 Memperbaiki folder penyimpanan Drive...');
  Logger.log('');
  try {
    siapkanFolderTulis('SIPUMA_FotoProfil', 'fotoFolderId');
    Logger.log('');
    siapkanFolderTulis('SIPUMA_LaporanCSR', 'laporanFolderId');
    Logger.log('');
    Logger.log('═══════════════════════════════');
    Logger.log('✅ Selesai. Jalankan diagnosaUnggahFoto() untuk memastikan.');
    Logger.log('');
    Logger.log('⚠️  Foto & PDF yang sudah terunggah SEBELUMNYA tetap ada di');
    Logger.log('    folder lama dan tautannya masih berfungsi — hanya unggahan');
    Logger.log('    BARU yang masuk ke folder ini.');
  } catch (e) {
    Logger.log('❌ Gagal: ' + e.message);
  }
}

/** Nama lama, dipertahankan agar tetap bisa dipanggil. */
function buatUlangFolderFoto() {
  return perbaikiFolderDrive();
}

/**
 * Unggah BERKAS laporan ke Drive — tanpa menulis catatan apa pun.
 *
 * Pemisahan ini disengaja: GAS hanya mengurus berkas, sedangkan catatan
 * laporannya ditulis aplikasi langsung ke Firestore. Sebelumnya GAS ikut
 * menulis ke Google Sheets, sehingga berkas berhasil terunggah tetapi
 * tidak pernah muncul di aplikasi — karena aplikasi membaca Firestore.
 */
function apiUnggahBerkasLaporan(base64Data, namaBerkas, mimeType, kunciUnggah) {
  try {
    const folderId = getConfig('laporanFolderId');
    if (!folderId) throw new Error('Folder laporan belum terdaftar. Jalankan perbaikiFolderDrive().');
    const folder = DriveApp.getFolderById(folderId);
    const penanda = kunciUnggah ? ('sipuma-unggah:' + String(kunciUnggah)) : '';

    // ── Penjagaan terhadap unggahan ganda ──
    //
    // Permintaan unggah kadang sampai ke sini dengan selamat, berkasnya
    // dibuat, tetapi JAWABANNYA tersesat di jalan pulang (Apps Script
    // sesekali membalas 404 pada pengalihan internalnya). Aplikasi tidak
    // bisa membedakan "tidak sampai" dari "sampai tapi jawabannya hilang",
    // jadi ia mengirim ulang — dan tanpa penjagaan ini, setiap pengiriman
    // ulang membuat SALINAN BARU di Drive. Yang tercatat hanya salinan
    // terakhir; sisanya jadi berkas yatim yang menumpuk tanpa ketahuan.
    //
    // Setiap unggahan membawa penanda yang sama di semua percobaannya.
    // Kalau penandanya sudah ada di Drive, berkas itulah yang dikembalikan,
    // bukan dibuatkan yang baru.
    if (penanda) {
      const sama = folder.getFilesByName(namaBerkas);
      while (sama.hasNext()) {
        const f = sama.next();
        if (f.getDescription() === penanda) {
          return createResponse(true, {
            fileId: f.getId(),
            fileURL: 'https://drive.google.com/file/d/' + f.getId() + '/view',
            namaFile: namaBerkas
          }, 'Berkas sudah terunggah pada percobaan sebelumnya.');
        }
      }
    }

    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, namaBerkas);
    const file = folder.createFile(blob);
    if (penanda) file.setDescription(penanda);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return createResponse(true, {
      fileId: file.getId(),
      fileURL: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      namaFile: namaBerkas
    }, 'Berkas berhasil diunggah.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Hapus berkas laporan dari Drive. */
function apiHapusBerkasLaporan(fileId) {
  try {
    if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
    return createResponse(true, null, 'Berkas dihapus.');
  } catch (error) {
    return createResponse(true, null, 'Berkas tidak ditemukan, dilewati.');
  }
}

// ════════════════════════════════════════════════════════
// PEMBUATAN AKUN ADMIN CABANG
// ════════════════════════════════════════════════════════
/**
 * Buat akun Admin untuk sebuah cabang.
 *
 * Dijalankan dari editor Apps Script, bukan dari aplikasi — pembuatan
 * akun Admin sengaja tidak disediakan lewat tampilan, supaya tidak ada
 * yang bisa menaikkan dirinya sendiri jadi Admin.
 *
 * Ubah ketiga nilai di bawah, lalu jalankan fungsi ini.
 */
function buatAdminCabang() {
  const USERNAME = 'Admin Tanjung';        // nama untuk login
  const PASSWORD = 'GANTI_PASSWORD_INI';   // minimal 6 karakter
  const CABANG   = 'TANJUNG';              // CAKUNG atau TANJUNG

  if (PASSWORD === 'GANTI_PASSWORD_INI' || PASSWORD.length < 6) {
    Logger.log('❌ Password belum diisi atau kurang dari 6 karakter.');
    Logger.log('   Buka fungsi buatAdminCabang(), isi PASSWORD, lalu jalankan lagi.');
    return;
  }

  try {
    // Pastikan cabangnya memang terdaftar — salah ketik di sini membuat
    // akunnya "mengambang": bisa login tetapi tidak melihat data apa pun.
    const cab = fbAmbilDokumen('cabang', CABANG);
    if (!cab) {
      Logger.log('❌ Cabang "' + CABANG + '" tidak ditemukan di Firestore.');
      Logger.log('   Periksa koleksi "cabang" — isinya harus CAKUNG dan TANJUNG.');
      return;
    }

    // Jangan timpa akun yang sudah ada tanpa disadari
    const adaUser = fbAmbilDokumen('users', USERNAME);
    if (adaUser) {
      Logger.log('❌ Username "' + USERNAME + '" sudah dipakai.');
      Logger.log('   Peran: ' + adaUser.role + ', cabang: ' + (adaUser.cabang || '(kosong)'));
      Logger.log('   Pilih username lain, atau ganti passwordnya lewat Manajemen User.');
      return;
    }

    fbTulis('users', USERNAME, {
      username: USERNAME,
      role: 'admin',
      cabang: CABANG,
      idUmkm: '',
      statusAkses: 'Allowed',
      statusAktif: true,
      fotoURL: '',
      alamat: '',
      catatan: 'Admin cabang ' + cab.nama,
      tanggalDibuat: new Date()
    });

    const salt = buatSaltAcak();
    fbTulis('kredensial', USERNAME, {
      username: USERNAME,
      hash: buatHashPassword(PASSWORD, salt),
      salt: salt
    });

    Logger.log('✅ Akun Admin cabang berhasil dibuat.');
    Logger.log('');
    Logger.log('   Username : ' + USERNAME);
    Logger.log('   Password : ' + PASSWORD);
    Logger.log('   Cabang   : ' + CABANG + ' (' + cab.nama + ')');
    Logger.log('   Login    : tab "Admin/PIC"');
    Logger.log('');
    Logger.log('⚠️  Catat passwordnya sekarang — setelah ini tidak bisa dibaca lagi.');
    Logger.log('⚠️  HAPUS nilai PASSWORD dari kode ini, lalu Simpan.');
  } catch (error) {
    Logger.log('❌ Gagal: ' + error.message);
  }
}

/** Lihat daftar akun pengelola beserta cabangnya. */
function lihatAkunPengelola() {
  try {
    const users = fbBacaKoleksi('users').filter(function (u) {
      return u.role === 'admin' || u.role === 'superadmin' || u.role === 'stakeholder';
    });
    if (!users.length) { Logger.log('Belum ada akun pengelola.'); return; }
    Logger.log('Akun pengelola:');
    users.forEach(function (u) {
      Logger.log('  • ' + u.username + '  |  ' + u.role +
                 '  |  cabang: ' + (u.cabang || '(semua)') +
                 '  |  ' + u.statusAkses);
    });
  } catch (e) { Logger.log('❌ ' + e.message); }
}

// ════════════════════════════════════════════════════════
// GANTI PASSWORD SENDIRI
// ════════════════════════════════════════════════════════
/**
 * Pengguna mengganti passwordnya sendiri.
 *
 * Password lama WAJIB diverifikasi lebih dulu — tanpa itu, siapa pun yang
 * sempat memakai perangkat yang masih login bisa mengambil alih akun.
 */
function apiGantiPasswordSendiri(username, passwordLama, passwordBaru) {
  try {
    if (!passwordBaru || String(passwordBaru).length < 6) {
      throw new Error('Password baru minimal 6 karakter.');
    }
    if (String(passwordLama) === String(passwordBaru)) {
      throw new Error('Password baru harus berbeda dari yang lama.');
    }

    const kred = fbAmbilDokumen('kredensial', username);
    if (!kred) throw new Error('Data kredensial tidak ditemukan.');

    if (!bandinganAman(kred.hash, buatHashPassword(String(passwordLama), kred.salt))) {
      return createResponse(false, null, 'Password lama tidak sesuai.');
    }

    const salt = buatSaltAcak();
    fbTulis('kredensial', username, {
      username: username,
      hash: buatHashPassword(String(passwordBaru), salt),
      salt: salt
    });

    // Tandai sudah pernah diganti — dipakai untuk peringatan di dashboard
    // dan untuk memberi tahu Admin siapa yang masih memakai password awal.
    // Yang dicatat hanya STATUS-nya, bukan passwordnya.
    fbPerbarui('users', username, {
      passwordDiubah: true,
      tanggalGantiPassword: new Date()
    });

    // Akun jalur cepat ikut diubah, kalau tidak pengguna masih bisa masuk
    // memakai password lama.
    const uu = fbAmbilDokumen('users', username);
    authBuatAkun(username, passwordBaru, uu ? authKlaimDariUser(uu) : null);

    return createResponse(true, null, 'Password berhasil diganti. Gunakan password baru pada login berikutnya.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

// ════════════════════════════════════════════════════════
// PEMULIHAN AKUN YANG RUSAK
// ════════════════════════════════════════════════════════
/**
 * Bangun ulang dokumen pengguna yang isinya terhapus.
 *
 * Penyebabnya: penulisan sebagian yang keliru memakai PATCH tanpa
 * updateMask, sehingga seluruh isi dokumen tergantikan. Akibatnya
 * `role`, `cabang`, dan `idUmkm` hilang — pemiliknya tidak bisa login,
 * dan Admin tidak bisa menyuntingnya.
 *
 * Sumber pemulihan: sheet UserCredentials pada DB_SIPUMA, yang masih
 * menyimpan Username, Role, dan IDUMKM (hanya kolom passwordnya yang
 * dulu dikosongkan).
 *
 * AMAN dijalankan berulang — akun yang masih utuh tidak disentuh.
 */
function perbaikiUserRusak() {
  Logger.log('🔧 Memeriksa akun pengguna yang rusak...');
  Logger.log('');

  const petaRole = { 'Admin': 'admin', 'UT': 'stakeholder', 'UMKM': 'umkm' };
  let sheetRows = [];
  try {
    sheetRows = readSheetAsObjects('UserCredentials');
  } catch (e) {
    Logger.log('❌ Sheet UserCredentials tidak terbaca: ' + e.message);
    return;
  }

  const semua = fbBacaKoleksi('users');
  let rusak = 0, pulih = 0, gagal = 0;

  semua.forEach(function (u) {
    // Dokumen dianggap rusak bila kehilangan penanda pokoknya
    if (u.role && u.username) return;
    rusak++;
    const nama = u._id;
    Logger.log('⚠️  Rusak: ' + nama);

    const asal = sheetRows.find(function (r) { return String(r.Username) === String(nama); });
    if (!asal) {
      gagal++;
      Logger.log('    ❌ Tidak ditemukan di sheet UserCredentials — perlu dibuat manual.');
      return;
    }

    const role = petaRole[String(asal.Role)] || 'umkm';
    try {
      fbTulis('users', nama, {
        username: nama,
        role: role,
        // Stakeholder sengaja tidak terikat cabang
        cabang: (role === 'stakeholder') ? '' : (u.cabang || CABANG_DEFAULT),
        idUmkm: String(asal.IDUMKM || ''),
        statusAkses: String(asal.StatusAksesLogin || 'Allowed'),
        alasanPemblokiran: String(asal.AlasanPemblokiran || ''),
        statusAktif: true,
        fotoURL: String(asal.FotoURL || ''),
        alamat: String(asal.Alamat || ''),
        catatan: String(asal.Catatan || ''),
        tanggalDibuat: asal.TanggalDibuat || new Date()
      });
      pulih++;
      Logger.log('    ✅ Dipulihkan — peran: ' + role + ', kode UMKM: ' + (asal.IDUMKM || '-'));
    } catch (e) {
      gagal++;
      Logger.log('    ❌ Gagal: ' + e.message);
    }
  });

  Logger.log('');
  Logger.log('═══════════════════════════════');
  if (!rusak) {
    Logger.log('✅ Tidak ada akun yang rusak. Semuanya utuh.');
  } else {
    Logger.log('Ditemukan rusak : ' + rusak);
    Logger.log('Berhasil pulih  : ' + pulih);
    Logger.log('Belum pulih     : ' + gagal);
    Logger.log('');
    Logger.log('⚠️  Password TIDAK terpengaruh — yang rusak hanya data akunnya.');
    Logger.log('    Bila ada yang tetap tidak bisa login, reset passwordnya');
    Logger.log('    lewat Manajemen User di aplikasi.');
  }
  if (gagal) {
    Logger.log('');
    Logger.log('Untuk yang belum pulih, kirimkan log ini ke saya.');
  }
}


// ════════════════════════════════════════════════════════
// PERBAIKAN KELAS KEMANDIRIAN
// ════════════════════════════════════════════════════════
/**
 * Hitung ulang kelas kemandirian seluruh UMKM dari skornya.
 *
 * Diperlukan karena versi frontend sempat memakai ambang batas yang
 * berbeda dari hitungKelas() di sini, sehingga sebagian asesmen tersimpan
 * dengan kelas yang keliru. Skornya sendiri tidak pernah salah — hanya
 * penggolongan kelasnya.
 *
 * AMAN dijalankan berulang: yang sudah benar tidak disentuh.
 */
function perbaikiKelasKemandirian() {
  Logger.log('🔧 Memeriksa kelas kemandirian...');
  Logger.log('');

  let rows;
  try {
    rows = fbBacaKoleksi('kemandirian');
  } catch (e) {
    Logger.log('❌ Gagal membaca data: ' + e.message);
    return;
  }
  if (!rows.length) { Logger.log('Belum ada data asesmen.'); return; }

  let benar = 0, diperbaiki = 0, gagal = 0;

  rows.forEach(function (r) {
    // Hitung ulang rata-rata juga, supaya pembulatannya seragam
    const p = Number(r.skorProduksi) || 0;
    const pm = Number(r.skorPemasaran) || 0;
    const k = Number(r.skorKeuangan) || 0;
    const rata = Math.round(((p + pm + k) / 3) * 10) / 10;
    const kelasSeharusnya = hitungKelas(rata);

    if (String(r.kelas) === kelasSeharusnya && Number(r.rataRata) === rata) {
      benar++;
      return;
    }
    try {
      fbPerbarui('kemandirian', r._id, { rataRata: rata, kelas: kelasSeharusnya });
      diperbaiki++;
      Logger.log('  ✅ ' + (r.namaUMKM || r._id) +
                 '  skor ' + rata +
                 '  |  "' + (r.kelas || '-') + '" → "' + kelasSeharusnya + '"');
    } catch (e) {
      gagal++;
      Logger.log('  ❌ ' + (r.namaUMKM || r._id) + ': ' + e.message);
    }
  });

  Logger.log('');
  Logger.log('═══════════════════════════════');
  Logger.log('Sudah benar  : ' + benar);
  Logger.log('Diperbaiki   : ' + diperbaiki);
  if (gagal) Logger.log('Gagal        : ' + gagal);
  Logger.log('');
  Logger.log('Ambang batas yang dipakai:');
  Logger.log('  < 25        → Pemula');
  Logger.log('  25 – 49,9   → Madya');
  Logger.log('  50 – 74,9   → Pra Mandiri');
  Logger.log('  75 ke atas  → Mandiri');
}
