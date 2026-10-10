// ════════════════════════════════════════════════════════
// LAPISAN PENYESUAI FIRESTORE
// ════════════════════════════════════════════════════════
// Berkas ini MENGGANTI isi panggilAPI() agar berbicara langsung ke
// Firestore, bukan lagi ke GAS. Seluruh kode halaman (Data Master, Omset,
// Legalitas, dan lainnya) TIDAK perlu diubah sama sekali — bentuk jawaban
// yang dikembalikan dibuat sama persis seperti sebelumnya:
//     { success, data, message }
//
// Pola ini sama dengan compat.js yang dulu dipakai saat pindah ke REST API,
// dan alasannya sama: kode halaman sudah teruji berbulan-bulan; menulis
// ulang 21 halaman jauh lebih berisiko daripada mengganti jalur datanya.
//
// ⚠️ WAJIB dimuat SETELAH firebase-init.js dan api.js, tetapi SEBELUM
//    compat.js — agar definisi di sini yang berlaku.

// Sebagian operasi tetap lewat GAS karena memang tidak bisa (atau tidak
// boleh) dikerjakan langsung dari browser.
const AKSI_LEWAT_GAS = [
  'login', 'loginFirebase',
  'buatKredensialUMKM', 'hapusKredensial', 'pindahKredensial',
  'resetPassword',
  'uploadFoto',                          // foto → Google Drive
  'unggahBerkasLaporan', 'hapusBerkasLaporan',
  'resetPasswordFirebase'
];

function suksesFS(data, pesan) { return { success: true, data: data, message: pesan || 'OK' }; }
function gagalFS(pesan)        { return { success: false, data: null, message: pesan }; }

/** Ubah dokumen Firestore jadi objek biasa beserta id-nya. */
function dokKeObjek(d) {
  const o = d.data() || {};
  o._id = d.id;
  // Timestamp Firestore → Date, supaya kode halaman lama tetap cocok
  Object.keys(o).forEach(function (k) {
    if (o[k] && typeof o[k].toDate === 'function') o[k] = o[k].toDate();
  });
  return o;
}

/**
 * Lengkapi query per-UMKM dengan saringan yang dibutuhkan Security Rules.
 *
 * Query yang sudah menyaring idUmkm tetap DITOLAK untuk peran pengelola,
 * karena aturan mereka memeriksa `cabang` — dan Firestore hanya bisa
 * memastikan aturan bila field itu ikut disaring di query.
 *
 *   • umkm      : cukup idUmkm (sudah disaring pemanggil) → biarkan
 *   • admin     : tambahkan saringan cabang
 *   • lintas    : tanpa saringan; aturan meloloskan mereka apa adanya
 */
function saringPeran(q) {
  const sesi = AppState.session || {};
  if (sesi.roleFS === 'umkm') return q;
  if (!bolehLintasCabang()) return q.where('cabang', '==', cabangAktif());
  if (AppState.cabangDipilih) return q.where('cabang', '==', AppState.cabangDipilih);
  return q;
}

/** Ambil seluruh dokumen sebuah koleksi, tersaring cabang aktif. */
// Cache sederhana di memori. Tanpa ini, setiap kali berpindah tab dan
// kembali, seluruh koleksi dibaca ulang dari Firestore — boros kuota dan
// tidak ada gunanya karena datanya belum tentu berubah.
const _cacheFS = {};

// Umur cache dinaikkan dari 90 detik menjadi 5 menit.
//
// Pada paket gratis Firebase, jatah pembacaan per harilah yang paling cepat
// habis — bukan penulisan. Cache 90 detik terlalu pendek: berpindah tab
// bolak-balik selama beberapa menit saja sudah membaca ulang seluruh
// koleksi berkali-kali, padahal datanya tidak berubah sama sekali.
//
// Risikonya kecil dan terkendali: setiap perubahan data MEMBATALKAN cache
// koleksi terkait saat itu juga, jadi orang yang mengubah data selalu
// melihat hasilnya seketika. Yang mungkin tertunda hanya perubahan yang
// dibuat orang LAIN di perangkat lain — paling lama 5 menit.
const CACHE_UMUR_MS = 5 * 60 * 1000;

function kunciCacheFS(nama, extra) {
  return nama + '|' + cabangAktif() + '|' + (extra || '');
}
function ambilDariCacheFS(kunci) {
  const c = _cacheFS[kunci];
  if (c && (Date.now() - c.waktu) < CACHE_UMUR_MS) return c.data;
  return null;
}
function simpanKeCacheFS(kunci, data) {
  _cacheFS[kunci] = { waktu: Date.now(), data: data };
}
/** Kosongkan cache sebuah koleksi setelah datanya diubah. */
function hapusCacheFS(nama) {
  Object.keys(_cacheFS).forEach(function (k) {
    if (!nama || k.indexOf(nama + '|') === 0) delete _cacheFS[k];
  });
}

async function ambilKoleksi(nama, saringTambahan, kunciExtra) {
  const kunci = kunciCacheFS(nama, kunciExtra);
  const tersimpan = ambilDariCacheFS(kunci);
  if (tersimpan) return tersimpan;

  let q = db.collection(nama);
  const sesi = AppState.session || {};

  // PENTING — saringan di sini HARUS sejalan dengan Security Rules.
  // Firestore memeriksa aturan tanpa membaca dokumen, jadi bila aturan
  // menyebut sebuah field, query wajib menyaring field yang sama.
  //   • umkm      : disaring idUmkm  (aturan memeriksa idUmkm)
  //   • pengelola : disaring cabang  (aturan memeriksa cabang)
  if (sesi.roleFS === 'umkm') {
    q = q.where('idUmkm', '==', sesi.idUmkm);
  } else if (!bolehLintasCabang()) {
    q = q.where('cabang', '==', cabangAktif());
  } else if (AppState.cabangDipilih) {
    q = q.where('cabang', '==', AppState.cabangDipilih);
  }

  if (saringTambahan) q = saringTambahan(q);
  const snap = await q.get();
  const hasil = snap.docs.map(dokKeObjek);
  simpanKeCacheFS(kunci, hasil);
  return hasil;
}

// ════════════════════════════════════════════════════════
// PEMETAAN BENTUK DATA
// ════════════════════════════════════════════════════════
// Firestore memakai penamaan baru (camelCase); kode halaman lama memakai
// penamaan sheet (PascalCase). Kedua fungsi di bawah menjembatani keduanya
// agar halaman tidak perlu disentuh.

function umkmKeLama(u) {
  return {
    ID: u._id, KodeUnik: u.kodeUnik || u._id, NamaUMKM: u.namaUMKM,
    SektorUsaha: u.sektor, Spesialisasi: u.spesialisasi, AlamatUsaha: u.alamat,
    NoHP: u.noHP || '',
    // Titik lokasi untuk Peta Sebaran. Boleh kosong: UMKM tanpa titik tetap
    // tampil normal di seluruh halaman lain, hanya belum muncul di peta.
    Lat: angkaAtauNull(u.lat),
    Lng: angkaAtauNull(u.lng),
    TanggalBinaan: u.tanggalBinaan, FotoURL: u.fotoURL,
    StatusAktif: u.statusAktif === false ? 'Tidak Aktif' : 'Aktif',
    TerakhirUpdate: u.terakhirUpdate
  };
}

/**
 * Angka yang sah, atau null.
 *
 * Firestore MENOLAK nilai `undefined` dan menggagalkan seluruh penyimpanan
 * bila ada satu saja. Karena titik lokasi bersifat opsional, nilainya
 * disamakan jadi null — bukan dibiarkan undefined.
 */
function angkaAtauNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function umkmKeBaru(d) {
  return {
    cabang: cabangAktif(),
    kodeUnik: d.KodeUnik, namaUMKM: d.NamaUMKM, sektor: d.SektorUsaha,
    spesialisasi: d.Spesialisasi || '', alamat: d.AlamatUsaha || '',
    noHP: d.NoHP || '',
    lat: angkaAtauNull(d.Lat),
    lng: angkaAtauNull(d.Lng),
    tanggalBinaan: d.TanggalBinaan ? new Date(d.TanggalBinaan + (String(d.TanggalBinaan).length === 7 ? '-01' : '')) : new Date(),
    terakhirUpdate: new Date()
  };
}

function omsetKeLama(o) {
  const r = {
    ID: o._id, IDUMKM: o.idUmkm, NamaUMKM: o.namaUMKM, Tahun: o.tahun,
    TargetOmsetTahunan: o.target, TotalRealisasi: o.totalRealisasi,
    StatusTarget: o.statusTarget
  };
  BULAN_LIST.forEach(function (b) { r[b] = (o.bulanan || {})[b] || 0; });
  return r;
}

function tkKeLama(t) {
  return {
    ID: t._id, IDUMKM: t.idUmkm, NamaUMKM: t.namaUMKM, Tahun: t.tahun,
    Bulan: t.bulan, JumlahTenagaKerja: t.jumlah, Catatan: t.catatan
  };
}

function kemandirianKeLama(k) {
  return {
    ID: k._id, IDUMKM: k.idUmkm, NamaUMKM: k.namaUMKM,
    SkorProduksi: k.skorProduksi, SkorPemasaran: k.skorPemasaran, SkorKeuangan: k.skorKeuangan,
    RataRata: k.rataRata, Kelas: k.kelas,
    CatatanProduksi: k.catatanProduksi, CatatanPemasaran: k.catatanPemasaran,
    CatatanKeuangan: k.catatanKeuangan, SaranProgram: k.saranProgram,
    Asesor: k.asesor, TanggalAsesmen: k.tanggalAsesmen
  };
}

function fasilitasiKeLama(f) {
  return {
    ID: f._id, IDUMKM: f.idUmkm, NamaUMKM: f.namaUMKM, NamaCustomer: f.namaCustomer,
    DeskripsiKegiatan: f.kegiatan, NominalRupiah: f.nominal,
    TanggalFasilitasi: f.tanggal, Catatan: f.catatan
  };
}

function prestasiKeLama(p) {
  return {
    ID: p._id, IDUMKM: p.idUmkm, NamaUMKM: p.namaUMKM, Bulan: p.bulan, Tahun: p.tahun,
    DeskripsiPrestasi: p.deskripsi, KategoriPrestasi: p.kategori,
    CatatanTambahan: p.catatanTambahan, TanggalPencatatan: p.tanggalPencatatan
  };
}

function legalitasKeLama(l) {
  return {
    ID: l._id, IDUMKM: l.idUmkm, NamaUMKM: l.namaUMKM, JenisLegalitas: l.jenis,
    NomorLegalitas: l.nomor, TanggalTerbit: l.terbit, TanggalKadaluarsa: l.kadaluarsa,
    SeumurHidup: l.seumurHidup ? 'Ya' : 'Tidak', Penerbit: l.penerbit, Catatan: l.catatan
  };
}

function laporanKeLama(l) {
  return {
    ID: l._id, Bulan: l.bulan, Tahun: l.tahun, NamaFile: l.namaFile,
    Kategori: l.kategori || 'Lainnya',
    FileURL: l.fileURL, FileID: l.fileID, DeskripsiLaporan: l.deskripsi,
    Status: l.status, DiuploadOleh: l.diuploadOleh, TanggalUpload: l.tanggalUpload
  };
}

function userKeLama(u) {
  const petaRole = { admin: 'Admin', superadmin: 'Admin', stakeholder: 'UT', umkm: 'UMKM' };
  return {
    Username: u.username || u._id, Role: petaRole[u.role] || u.role,
    IDUMKM: u.idUmkm, StatusAksesLogin: u.statusAkses,
    AlasanPemblokiran: u.alasanPemblokiran, StatusAktif: u.statusAktif !== false,
    FotoURL: u.fotoURL, Alamat: u.alamat, Catatan: u.catatan,
    PasswordDiubah: u.passwordDiubah === true,
    TanggalDibuat: u.tanggalDibuat
  };
}

// ════════════════════════════════════════════════════════
// STATUS LEGALITAS (dulu dihitung server, kini di browser)
// ════════════════════════════════════════════════════════
function hitungStatusLegalitasFS(l) {
  if (l.seumurHidup) return { Status: 'Aktif', SisaHari: null, IsSeumurHidup: true };
  if (!l.kadaluarsa)  return { Status: 'Perlu Diperbarui', SisaHari: null, IsSeumurHidup: false };
  const kini = new Date(); kini.setHours(0, 0, 0, 0);
  const batas = new Date(l.kadaluarsa); batas.setHours(0, 0, 0, 0);
  const sisa = Math.round((batas - kini) / 86400000);
  if (sisa < 0)    return { Status: 'Kadaluarsa',       SisaHari: sisa, IsSeumurHidup: false };
  if (sisa <= 365) return { Status: 'Perlu Diperbarui', SisaHari: sisa, IsSeumurHidup: false };
  return { Status: 'Aktif', SisaHari: sisa, IsSeumurHidup: false };
}

// ════════════════════════════════════════════════════════
// CLOSING
// ════════════════════════════════════════════════════════
const PENANDA_GLOBAL_FS = '__SEMUA_UMKM__';

async function cekClosing(kodeUmkm, tahun, jenis) {
  const c = cabangAktif();
  const ids = [
    c + '_' + kodeUmkm + '_' + tahun + '_' + jenis,
    c + '_' + PENANDA_GLOBAL_FS + '_' + tahun + '_' + jenis
  ];
  const hasil = await Promise.all(ids.map(function (id) {
    return db.collection('closing').doc(id).get();
  }));
  return { sendiri: hasil[0].exists, global: hasil[1].exists };
}

// ════════════════════════════════════════════════════════
// PENGGANTI panggilAPI
// ════════════════════════════════════════════════════════
async function panggilAPI(action, args, opsi) {
  args = args || [];
  opsi = opsi || {};

  // Sebagian operasi tetap dilayani GAS
  if (AKSI_LEWAT_GAS.indexOf(action) > -1) {
    const lewatGas = await panggilGAS(action, args, opsi);
    if (lewatGas && lewatGas.success && AKSI_GAS_MENGUBAH[action]) {
      segarkanSetelahUbah(action);
    }
    return lewatGas;
  }
  if (!db) return gagalFS('Firebase belum siap. Muat ulang halaman.');

  try {
    const hasil = await jalankanAksiFirestore(action, args);
    // Setiap perubahan data langsung terlihat di layar, tanpa perlu pindah
    // tab atau memuat ulang halaman — berlaku untuk seluruh peran.
    if (hasil && hasil.success && (AKSI_MENGUBAH[action] || action === 'deleteUMKM')) {
      segarkanSetelahUbah(action);
    }
    return hasil;
  } catch (e) {
    console.error('SIPUMA Firestore (' + action + '):', e);
    if (e.code === 'permission-denied') {
      return gagalFS('Anda tidak memiliki hak akses untuk tindakan ini.');
    }
    if (e.code === 'unavailable') {
      return { success: false, data: null, gagalKoneksi: true,
               message: 'Tidak dapat terhubung. Periksa koneksi internet Anda.' };
    }
    // Jatah harian Firebase habis. Perlu dijelaskan apa adanya: ini bukan
    // kerusakan dan bukan kesalahan pengguna, dan mencoba berulang kali
    // justru tidak menolong.
    if (e.code === 'resource-exhausted') {
      return gagalFS('Kuota harian Firebase sudah habis untuk hari ini, jadi data ' +
                     'tidak dapat dibaca atau disimpan sementara waktu. Jatahnya ' +
                     'dihitung ulang setiap hari; coba lagi nanti.');
    }
    return gagalFS(e.message || 'Terjadi kesalahan.');
  }
}

// Action yang MENGUBAH data → cache koleksi terkait wajib dikosongkan,
// kalau tidak tampilan akan memperlihatkan data lama sampai 90 detik.
const AKSI_MENGUBAH = {
  addUMKM: 'umkm', updateUMKM: 'umkm', deleteUMKM: 'umkm', setStatusAktifUMKM: 'umkm',
  saveOmset: 'omset', deleteOmset: 'omset',
  saveTenagaKerja: 'tenagaKerja',
  saveKemandirian: 'kemandirian',
  addFasilitasi: 'fasilitasi',
  addPrestasi: 'prestasi', updatePrestasi: 'prestasi', deletePrestasi: 'prestasi',
  addLegalitas: 'legalitas', updateLegalitas: 'legalitas', deleteLegalitas: 'legalitas',
  uploadLaporanCSR: 'laporanCsr', updateLaporanCSR: 'laporanCsr', deleteLaporanCSR: 'laporanCsr',
  updateUser: 'users', setStatusAkses: 'users', deleteUser: 'users', updateProfil: 'users',
  setClosing: 'closing', bukaClosing: 'closing',
  setConfig: 'config', setPeriodeAktif: 'config', setKantorPeta: 'config'
};

// Action lewat GAS yang juga MENGUBAH data. Daftarnya terpisah karena
// jalurnya berbeda, tetapi akibatnya sama: tampilan wajib disegarkan.
const AKSI_GAS_MENGUBAH = {
  uploadFoto: 'users', buatKredensialUMKM: 'users', hapusKredensial: 'users',
  resetPassword: 'users', resetPasswordFirebase: 'users',
  unggahBerkasLaporan: 'laporanCsr', hapusBerkasLaporan: 'laporanCsr'
};

// ════════════════════════════════════════════════════════
// PENYEGARAN TAMPILAN SETELAH DATA BERUBAH
// ════════════════════════════════════════════════════════
// Dulu setiap halaman mengurus penyegarannya sendiri-sendiri. Pola itu
// rapuh: ada halaman yang lupa mengosongkan cache, ada yang lupa menggambar
// ulang, dan ada yang memeriksa nama tab yang keliru. Gejalanya selalu sama
// dan selalu membingungkan — "sudah berhasil tapi tidak berubah di layar,
// baru muncul setelah pindah tab".
//
// Sekarang penyegaran dijamin di SATU tempat: setiap kali ada data yang
// berubah, cache halaman dikosongkan dan tab yang sedang terbuka digambar
// ulang. Berlaku untuk semua peran dan semua halaman, tanpa kecuali.

let _timerGambarUlang = null;
let _tundaGambarUlang = 0;

/** Gambar ulang tab yang sedang terbuka. Panggilan beruntun digabung jadi satu. */
function jadwalkanGambarUlang(jeda, koleksi) {
  if (_timerGambarUlang) clearTimeout(_timerGambarUlang);
  _timerGambarUlang = setTimeout(function () {
    _timerGambarUlang = null;
    const seksi = (typeof AppState !== 'undefined') ? AppState.currentSection : null;
    if (!seksi || typeof navigateTo !== 'function') return;

    // Dua keadaan yang membuat penyegaran DITUNDA, bukan dibatalkan:
    // formulir yang masih terbuka, dan kursor yang masih berada di salah
    // satu isian. Menggambar ulang di tengah pengetikan akan menghapus apa
    // yang belum sempat disimpan. Begitu keduanya selesai, penyegaran yang
    // tertunda akan menyusul sendiri.
    const form = document.getElementById('modalGeneric');
    const fokus = document.activeElement;
    const wadah = document.getElementById('app-container');
    const sedangMengetik = fokus && /^(INPUT|SELECT|TEXTAREA)$/.test(fokus.tagName) &&
                           wadah && wadah.contains(fokus);

    if ((form && form.classList.contains('show')) || sedangMengetik) {
      if (_tundaGambarUlang < 20) { _tundaGambarUlang++; jadwalkanGambarUlang(1500, koleksi); }
      return;
    }
    _tundaGambarUlang = 0;

    // Cache halaman dikosongkan DI SINI, tepat sebelum digambar ulang —
    // bukan segera setelah data berubah.
    //
    // Ini bukan soal rapi-rapian, melainkan keharusan. Sejumlah halaman
    // menambahkan baris baru ke cache yang sudah ada ("ambil daftar lama,
    // tambahkan yang baru"). Kalau cache-nya sudah dikosongkan lebih dulu,
    // daftar lamanya dianggap kosong — dan tabel berakhir hanya berisi SATU
    // baris, yaitu yang baru saja dimasukkan. Seluruh data lain seolah
    // lenyap, padahal di server tidak ada yang hilang sama sekali.
    kosongkanCacheHalaman(koleksi);

    try { navigateTo(seksi); }
    catch (e) { console.warn('SIPUMA: gagal menggambar ulang tab —', e); }
  }, jeda || 350);
}

// Koleksi mana membatalkan cache halaman yang mana.
//
// Dulu SELURUH cache dikosongkan setiap kali ada perubahan apa pun. Itu
// praktis, tetapi mahal: sekali menyimpan satu angka omset, seluruh koleksi
// ikut dibaca ulang dari server. Pada paket gratis Firebase yang jatahnya
// terbatas per hari, pemborosan seperti itu bisa menghabiskan kuota di
// tengah hari kerja — dan begitu kuotanya habis, SELURUH aplikasi berhenti
// dengan pesan yang membingungkan.
const CACHE_HALAMAN_PER_KOLEKSI = {
  umkm:        ['umkm', 'dashboardOrganisasi'],
  omset:       ['omsetAll', 'dashboardOrganisasi'],
  tenagaKerja: ['tenagaKerjaAll', 'tenagaKerjaPerUmkmTahun', 'dashboardOrganisasi'],
  kemandirian: ['kemandirianAll', 'kemandirianPerUmkm', 'dashboardOrganisasi'],
  fasilitasi:  ['fasilitasi', 'dashboardOrganisasi'],
  prestasi:    ['prestasi', 'dashboardOrganisasi'],
  legalitas:   ['legalitas', 'dashboardOrganisasi'],
  laporanCsr:  ['laporanCsr'],
  users:       ['users'],
  closing:     ['dashboardOrganisasi'],
  config:      ['dashboardOrganisasi']
};

// Kunci cache yang berisi peta (bukan daftar) dikosongkan jadi {}, bukan null.
const CACHE_BERBENTUK_PETA = ['kemandirianPerUmkm', 'tenagaKerjaPerUmkmTahun'];

/** Kosongkan cache halaman untuk satu koleksi saja. null = semuanya. */
function kosongkanCacheHalaman(koleksi) {
  if (!AppState || !AppState.cache) return;
  if (!koleksi) { if (typeof resetCache === 'function') resetCache(); return; }
  const kunci = CACHE_HALAMAN_PER_KOLEKSI[koleksi];
  if (!kunci) { if (typeof resetCache === 'function') resetCache(); return; }
  kunci.forEach(function (k) {
    AppState.cache[k] = (CACHE_BERBENTUK_PETA.indexOf(k) > -1) ? {} : null;
  });
}

/** Jadwalkan penyegaran tampilan setelah data berubah. */
function segarkanSetelahUbah(action) {
  // Penghapusan UMKM menyentuh hampir semua koleksi sekaligus, jadi di situ
  // saja seluruh cache dibersihkan.
  const koleksi = (action === 'deleteUMKM')
    ? null
    : (AKSI_MENGUBAH[action] || AKSI_GAS_MENGUBAH[action] || null);

  // Cache Firestore dikosongkan SESUDAH perubahannya benar-benar jadi.
  // Pengosongan sebelum perubahan saja tidak cukup: sejumlah operasi
  // membaca koleksinya dulu (misalnya memeriksa nama yang mirip saat
  // menambah UMKM), dan pembacaan itu mengisi ulang cache dengan keadaan
  // SEBELUM perubahan — yang lalu bertahan sampai 90 detik berikutnya.
  //
  // Aman dipanggil di sini: cache ini murni salinan data dari server,
  // tidak ada halaman yang menambahkan baris ke dalamnya.
  if (typeof hapusCacheFS === 'function') hapusCacheFS(koleksi);

  jadwalkanGambarUlang(null, koleksi);
}

// Pengisian data hanya untuk UMKM yang berstatus AKTIF.
const AKSI_WAJIB_UMKM_AKTIF = ['saveOmset', 'saveTenagaKerja', 'saveKemandirian',
                               'addFasilitasi', 'addPrestasi', 'addLegalitas'];

/** Pastikan UMKM sasaran masih aktif sebelum datanya diubah. */
async function pastikanUmkmAktif(kodeUmkm) {
  if (!kodeUmkm) return null;
  const d = await db.collection('umkm').doc(kodeUmkm).get();
  if (!d.exists) return 'Data UMKM tidak ditemukan.';
  if (d.data().statusAktif === false) {
    return 'UMKM "' + (d.data().namaUMKM || kodeUmkm) + '" berstatus TIDAK AKTIF, ' +
           'sehingga datanya tidak dapat diisi atau diubah. ' +
           'Aktifkan kembali lewat Data Master UMKM bila ingin melanjutkan.';
  }
  return null;
}

async function jalankanAksiFirestore(action, a) {
  const cab = cabangAktif();
  const sesi = AppState.session || {};

  // Menonaktifkan UMKM berarti seluruh pengisian datanya ikut berhenti —
  // bukan hanya disembunyikan dari ringkasan. Diperiksa di satu tempat
  // agar tidak ada jalur yang terlewat.
  if (AKSI_WAJIB_UMKM_AKTIF.indexOf(action) > -1) {
    const rec = a[0] || {};
    const kode = (typeof rec === 'string') ? rec : (rec.IDUMKM || '');
    const pesan = await pastikanUmkmAktif(kode);
    if (pesan) return gagalFS(pesan);
  }

  // Penghapusan UMKM menyentuh banyak koleksi sekaligus, jadi seluruh
  // cache dibersihkan — lebih aman daripada menebak mana saja yang ikut.
  if (action === 'deleteUMKM') hapusCacheFS(null);
  else if (AKSI_MENGUBAH[action]) hapusCacheFS(AKSI_MENGUBAH[action]);

  // Tandai bahwa ada data berubah hari ini. Pencadangan harian membaca
  // penanda ini lebih dulu: bila tidak ada perubahan sejak pencadangan
  // terakhir, ia berhenti setelah 1 bacaan saja.
  //
  // Sengaja tidak ditunggu (tanpa await) dan kegagalannya diabaikan —
  // mencatat penanda tidak boleh sampai menggagalkan penyimpanan data.
  // Bila penanda gagal tercatat, akibat terburuknya hanya pencadangan
  // berjalan padahal tidak perlu; arah kegagalan yang aman.
  if (AKSI_MENGUBAH[action] || action === 'deleteUMKM') {
    try {
      db.collection('meta').doc('perubahan').set({
        terakhirDiubah: firebase.firestore.FieldValue.serverTimestamp(),
        olehAksi: action,
        oleh: (AppState.session || {}).username || ''
      }, { merge: true });
    } catch (e) { /* diabaikan dengan sengaja */ }

  }

  switch (action) {

    // ── Sesi ──
    case 'ping':            return suksesFS({ waktu: new Date().toISOString() }, 'Terhubung');
    case 'hapusFotoProfil': return await hapusFotoProfilFS();
    case 'cekSesi': {
      const k = await klaimPengguna();
      if (!k) return { success: false, sesiHabis: true, message: 'Sesi berakhir. Silakan login kembali.' };
      return suksesFS({ profil: k }, 'Sesi masih aktif.');
    }
    case 'logout': await keluarFirebase(); return suksesFS(null, 'Anda telah keluar.');

    // ── Konfigurasi ──
    case 'getAllConfig': {
      const d = await db.collection('config').doc(cab).get();
      return suksesFS(d.exists ? d.data() : {}, 'OK');
    }
    case 'setConfig': {
      const patch = {}; patch[a[0]] = a[1];
      await db.collection('config').doc(cab).set(patch, { merge: true });
      return suksesFS(null, 'Konfigurasi disimpan.');
    }
    // Titik kantor PPU dan kantor Stakeholder untuk Peta Sebaran.
    //
    // Delapan kolom sekaligus dalam SATU penulisan, bukan delapan kali
    // setConfig. Selain hemat kuota, cara ini juga membuat penyimpanannya
    // utuh: tidak mungkin tersimpan separuh bila jaringan putus di tengah.
    case 'setKantorPeta': {
      const k = a[0] || {};
      await db.collection('config').doc(cab).set({
        kantorPpuNama: String(k.ppuNama || ''),
        kantorPpuLat:  angkaAtauNull(k.ppuLat),
        kantorPpuLng:  angkaAtauNull(k.ppuLng),
        kantorPpuFoto: String(k.ppuFoto || ''),
        kantorStkNama: String(k.stkNama || ''),
        kantorStkLat:  angkaAtauNull(k.stkLat),
        kantorStkLng:  angkaAtauNull(k.stkLng),
        kantorStkFoto: String(k.stkFoto || '')
      }, { merge: true });
      return suksesFS(null, 'Titik kantor berhasil disimpan.');
    }
    case 'setPeriodeAktif': {
      const th = Number(a[0]);
      if (!th || th < 2020 || th > 2100) return gagalFS('Tahun periode tidak masuk akal.');
      await db.collection('config').doc(cab).set({ tahunAktif: th }, { merge: true });
      return suksesFS({ tahunAktif: th },
        'Periode aktif diubah ke tahun ' + th + '. Data tahun sebelumnya tetap tersimpan.');
    }

    // ── Data Master UMKM ──
    case 'getDaftarUMKM': {
      const rows = await ambilKoleksi('umkm');
      return suksesFS(rows.map(umkmKeLama), 'OK');
    }
    case 'getUMKMByKode': {
      const d = await db.collection('umkm').doc(a[0]).get();
      return suksesFS(d.exists ? umkmKeLama(dokKeObjek(d)) : null, 'OK');
    }
    case 'addUMKM': {
      const d = a[0];
      const semua = await ambilKoleksi('umkm');
      const bentrok = cariUMKMSerupaFS(d.NamaUMKM, semua.map(umkmKeLama), null);
      if (bentrok) {
        return gagalFS('Nama UMKM ini terlalu mirip dengan yang sudah terdaftar: "' +
          bentrok.NamaUMKM + '" (' + bentrok.KodeUnik + '). Bedakan namanya lebih jelas.');
      }
      const kode = buatKodeUnikFS(d.SektorUsaha, semua);
      const baru = umkmKeBaru(d);
      baru.kodeUnik = kode; baru.fotoURL = ''; baru.statusAktif = true;
      await db.collection('umkm').doc(kode).set(baru);
      // Akun login UMKM dibuat sekaligus, seperti perilaku sebelumnya
      await db.collection('users').doc(d.NamaUMKM).set({
        username: d.NamaUMKM, role: 'umkm', cabang: cab, idUmkm: kode,
        statusAkses: 'Allowed', statusAktif: true, fotoURL: '',
        alamat: d.AlamatUsaha || '', catatan: 'Dibuat otomatis saat pendaftaran UMKM',
        tanggalDibuat: new Date()
      });
      // Kredensial login WAJIB dibuat lewat GAS — koleksi `kredensial`
      // tertutup bagi browser. Tanpa langkah ini, UMKM baru tidak akan
      // pernah bisa login meski akunnya sudah muncul di daftar user.
      // Peran, cabang, dan kode UMKM dikirim SEKALIAN. Sebelumnya GAS
      // membacanya sendiri dari koleksi `users` yang baru saja ditulis di
      // atas — bila pembacaan itu meleset, akun login cepatnya terbentuk
      // tanpa peran, dan login pertama UMKM baru jatuh kembali ke jalur
      // lama yang lambat. Dikirim langsung begini, peranannya pasti benar.
      const kred = await panggilGAS('buatKredensialUMKM',
        [d.NamaUMKM, kode, { role: 'umkm', cabang: cab, idUmkm: kode }]);
      if (!kred || !kred.success) {
        return suksesFS({ id: kode, kodeUnik: kode },
          'UMKM "' + d.NamaUMKM + '" ditambahkan dengan Kode Unik ' + kode + ', ' +
          'TETAPI akun loginnya gagal dibuat. Buka Manajemen User → Edit → Reset Password ' +
          'untuk membuatkannya secara manual.');
      }
      return suksesFS({ id: kode, kodeUnik: kode },
        'UMKM "' + d.NamaUMKM + '" berhasil ditambahkan dengan Kode Unik ' + kode +
        '. Login memakai nama UMKM dan Kode Unik tersebut.');
    }
    case 'updateUMKM': {
      const d = a[0];
      const semua = await ambilKoleksi('umkm');
      if (d.NamaUMKM) {
        const bentrok = cariUMKMSerupaFS(d.NamaUMKM, semua.map(umkmKeLama), d.KodeUnik);
        if (bentrok) return gagalFS('Nama terlalu mirip dengan "' + bentrok.NamaUMKM + '" (' + bentrok.KodeUnik + ').');
      }
      // Nama UMKM sekaligus menjadi username loginnya. Karena itu mengganti
      // nama di Data Master HARUS diikuti akun loginnya — kalau tidak, UMKM
      // tetap harus masuk memakai nama lama, dan tidak ada petunjuk apa pun
      // di layar tentang nama mana yang sebenarnya berlaku.
      const lamaDoc = await db.collection('umkm').doc(d.KodeUnik).get();
      const namaLama = lamaDoc.exists ? String(lamaDoc.data().namaUMKM || '') : '';
      const namaBaru = String(d.NamaUMKM || '').trim();

      const patch = umkmKeBaru(d);
      delete patch.cabang;                       // cabang tidak boleh berpindah lewat sini
      await db.collection('umkm').doc(d.KodeUnik).set(patch, { merge: true });

      let catatanAkun = '';
      if (namaLama && namaBaru && namaLama !== namaBaru) {
        try {
          const uLama = await db.collection('users').doc(namaLama).get();
          const dataUser = uLama.exists ? uLama.data() : {
            role: 'umkm', cabang: cab, statusAkses: 'Allowed',
            statusAktif: true, fotoURL: '', alamat: ''
          };
          dataUser.username = namaBaru;
          dataUser.idUmkm = dataUser.idUmkm || d.KodeUnik;
          await db.collection('users').doc(namaBaru).set(dataUser);
          if (uLama.exists) await db.collection('users').doc(namaLama).delete();

          // Sidik password dipindahkan oleh GAS — koleksi `kredensial`
          // tertutup bagi browser. Passwordnya sendiri tidak berubah.
          const pindah = await panggilGAS('pindahKredensial', [namaLama, namaBaru]);
          catatanAkun = (pindah && pindah.success)
            ? ' Akun loginnya ikut berganti menjadi "' + namaBaru + '", dengan password yang sama.'
            : ' TETAPI akun loginnya gagal dipindahkan. Buka Manajemen User → Edit → ' +
              'Reset Password untuk membereskannya.';
        } catch (e) {
          catatanAkun = ' TETAPI akun loginnya gagal dipindahkan (' +
            (e.message || e.code || 'sebab tidak diketahui') + '). Buka Manajemen User → ' +
            'Edit → Reset Password untuk membereskannya.';
        }
      }

      return suksesFS(d, 'Profil UMKM berhasil diperbarui.' + catatanAkun);
    }
    case 'deleteUMKM': {
      const kode = a[0];
      const umkmDoc = await db.collection('umkm').doc(kode).get();
      const nama = umkmDoc.exists ? (umkmDoc.data().namaUMKM || '') : '';
      // Hapus seluruh data terkait, seperti perilaku cascade sebelumnya
      const koleksiTerkait = ['omset', 'tenagaKerja', 'kemandirian', 'fasilitasi', 'prestasi', 'legalitas', 'closing'];
      for (const k of koleksiTerkait) {
        const snap = await saringPeran(db.collection(k).where('idUmkm', '==', kode)).get();
        const batch = db.batch();
        snap.docs.forEach(function (d) { batch.delete(d.ref); });
        if (snap.size) await batch.commit();
      }
      await db.collection('umkm').doc(kode).delete();
      if (nama) {
        try { await db.collection('users').doc(nama).delete(); } catch (e) {}
        try { await panggilGAS('hapusKredensial', [nama]); } catch (e) {}
      }

      // Sapuan terakhir: akun mana pun yang masih menunjuk ke kode UMKM ini
      // ikut dihapus, apa pun namanya.
      //
      // Menghapus berdasarkan NAMA saja tidak cukup. Bila nama UMKM-nya
      // pernah diubah, akun lamanya bisa tertinggal dengan nama yang sudah
      // tidak dikenal siapa pun — datanya hilang dari Data Master, tetapi
      // akunnya masih berdiri di Manajemen User tanpa penjelasan. Kode unik
      // tidak pernah berubah, jadi itulah penanda yang dipakai di sini.
      try {
        const sisa = await db.collection('users').where('cabang', '==', cab).get();
        for (const d of sisa.docs) {
          const u = d.data() || {};
          if (String(u.idUmkm || '') === String(kode)) {
            await d.ref.delete();
            try { await panggilGAS('hapusKredensial', [d.id]); } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('SIPUMA: sapuan akun yatim dilewati —', e.code || e.message);
      }

      return suksesFS(null, 'UMKM beserta seluruh riwayatnya berhasil dihapus.');
    }
    case 'setStatusAktifUMKM': {
      await db.collection('umkm').doc(a[0]).set({ statusAktif: !!a[1] }, { merge: true });
      return suksesFS({ kodeUnik: a[0], aktif: !!a[1] },
        'UMKM berhasil ditandai ' + (a[1] ? 'AKTIF' : 'TIDAK AKTIF') + '.');
    }

    // ── Omset ──
    case 'getOmsetUMKM': {
      const d = await db.collection('omset').doc(a[0] + '_' + a[1]).get();
      return suksesFS(d.exists ? omsetKeLama(dokKeObjek(d)) : null, 'OK');
    }
    case 'saveOmset': {
      const r = a[0];
      const st = await cekClosing(r.IDUMKM, r.Tahun, 'Omset');
      if (st.sendiri || st.global) {
        return gagalFS('Data omset tahun ' + r.Tahun + ' sudah dikunci (closing) dan tidak dapat diubah.');
      }
      const bulanan = {}; let total = 0;
      BULAN_LIST.forEach(function (b) { bulanan[b] = Number(r[b]) || 0; total += bulanan[b]; });
      const target = Number(r.TargetOmsetTahunan) || 0;
      await db.collection('omset').doc(r.IDUMKM + '_' + r.Tahun).set({
        cabang: cab, idUmkm: r.IDUMKM, namaUMKM: r.NamaUMKM || '', tahun: Number(r.Tahun),
        target: target, bulanan: bulanan, totalRealisasi: total,
        statusTarget: (target && total >= target) ? 'Tercapai' : 'Belum Tercapai'
      }, { merge: true });
      return suksesFS(r, 'Omset berhasil disimpan.');
    }
    case 'deleteOmset': {
      const st = await cekClosing(a[0], a[1], 'Omset');
      if (st.sendiri || st.global) return gagalFS('Data tahun ' + a[1] + ' sudah dikunci dan tidak dapat dihapus.');
      await db.collection('omset').doc(a[0] + '_' + a[1]).delete();
      return suksesFS(null, 'Riwayat omset tahun ' + a[1] + ' berhasil dihapus.');
    }
    case 'getAllOmset': {
      const rows = await ambilKoleksi('omset');
      return suksesFS(rows.map(omsetKeLama), 'OK');
    }
    case 'getRiwayatOmsetUMKM': {
      const snap = await saringPeran(db.collection('omset').where('idUmkm', '==', a[0] || sesi.idUmkm)).get();
      return suksesFS(snap.docs.map(dokKeObjek).map(omsetKeLama), 'OK');
    }

    // ── Tenaga Kerja ──
    case 'getTenagaKerjaUMKM': {
      const snap = await saringPeran(db.collection('tenagaKerja')
        .where('idUmkm', '==', a[0]).where('tahun', '==', Number(a[1]))).get();
      return suksesFS(snap.docs.map(dokKeObjek).map(tkKeLama), 'OK');
    }
    case 'saveTenagaKerja': {
      const r = a[0];
      const st = await cekClosing(r.IDUMKM, r.Tahun, 'TenagaKerja');
      if (st.sendiri || st.global) {
        return gagalFS('Data tenaga kerja tahun ' + r.Tahun + ' sudah dikunci (closing).');
      }
      await db.collection('tenagaKerja').doc(r.IDUMKM + '_' + r.Tahun + '_' + r.Bulan).set({
        cabang: cab, idUmkm: r.IDUMKM, namaUMKM: r.NamaUMKM || '',
        tahun: Number(r.Tahun), bulan: r.Bulan,
        jumlah: Number(r.JumlahTenagaKerja) || 0, catatan: r.Catatan || ''
      }, { merge: true });
      return suksesFS(r, 'Data tenaga kerja berhasil disimpan.');
    }
    case 'getAllTenagaKerja': {
      const rows = await ambilKoleksi('tenagaKerja');
      return suksesFS(rows.map(tkKeLama), 'OK');
    }

    // ── Kemandirian ──
    case 'getKelasKemandirianUMKM': {
      const d = await db.collection('kemandirian').doc(a[0]).get();
      return suksesFS(d.exists ? kemandirianKeLama(dokKeObjek(d)) : null, 'OK');
    }
    case 'saveKemandirian': {
      const r = a[0];
      const p = Number(r.SkorProduksi) || 0, pm = Number(r.SkorPemasaran) || 0, k = Number(r.SkorKeuangan) || 0;
      const rata = Math.round(((p + pm + k) / 3) * 10) / 10;
      const kelas = hitungKelasFS(rata);
      const isi = {
        cabang: cab, idUmkm: r.IDUMKM, namaUMKM: r.NamaUMKM || '',
        skorProduksi: p, skorPemasaran: pm, skorKeuangan: k, rataRata: rata, kelas: kelas,
        catatanProduksi: r.CatatanProduksi || '', catatanPemasaran: r.CatatanPemasaran || '',
        catatanKeuangan: r.CatatanKeuangan || '', saranProgram: r.SaranProgram || '',
        asesor: r.Asesor || '',
        tanggalAsesmen: r.TanggalAsesmen ? new Date(String(r.TanggalAsesmen).length === 7 ? r.TanggalAsesmen + '-01' : r.TanggalAsesmen) : new Date()
      };
      await db.collection('kemandirian').doc(r.IDUMKM).set(isi, { merge: true });
      return suksesFS(kemandirianKeLama(Object.assign({ _id: r.IDUMKM }, isi)),
        'Kelas kemandirian berhasil disimpan: ' + kelas + ' (skor ' + rata + ').');
    }
    case 'getAllKelasKemandirian': {
      const rows = await ambilKoleksi('kemandirian');
      return suksesFS(rows.map(kemandirianKeLama), 'OK');
    }

    // ── Fasilitasi ──
    case 'getAllFasilitasi': {
      const rows = await ambilKoleksi('fasilitasi');   // sudah tersaring per peran
      return suksesFS(rows.map(fasilitasiKeLama), 'OK');
    }
    case 'addFasilitasi': {
      const r = a[0];
      if (!r.IDUMKM || !Number(r.NominalRupiah)) return gagalFS('UMKM dan Nominal wajib diisi.');
      await db.collection('fasilitasi').add({
        cabang: cab, idUmkm: r.IDUMKM, namaUMKM: r.NamaUMKM || '',
        namaCustomer: r.NamaCustomer || '', kegiatan: r.DeskripsiKegiatan || '',
        nominal: Number(r.NominalRupiah), tanggal: new Date(r.TanggalFasilitasi),
        catatan: r.Catatan || ''
      });
      return suksesFS(r, 'Fasilitasi pemasaran berhasil dicatat.');
    }

    // ── Prestasi ──
    case 'getAllPrestasi': {
      const rows = await ambilKoleksi('prestasi');
      return suksesFS(rows.map(prestasiKeLama), 'OK');
    }
    case 'getPerformaTerbaik': {
      let rows = (await ambilKoleksi('prestasi')).map(prestasiKeLama);
      if (a[0]) rows = rows.filter(function (r) { return r.Bulan === a[0]; });
      if (a[1]) rows = rows.filter(function (r) { return r.KategoriPrestasi === a[1]; });
      rows.sort(function (x, y) { return new Date(y.TanggalPencatatan) - new Date(x.TanggalPencatatan); });
      return suksesFS(rows, 'OK');
    }
    case 'addPrestasi': {
      const r = a[0];
      await db.collection('prestasi').add({
        cabang: cab, idUmkm: r.IDUMKM, namaUMKM: r.NamaUMKM || '',
        bulan: r.Bulan || '', tahun: Number(r.Tahun) || new Date().getFullYear(),
        deskripsi: r.DeskripsiPrestasi, kategori: r.KategoriPrestasi || 'Lainnya',
        catatanTambahan: r.CatatanTambahan || '', tanggalPencatatan: new Date()
      });
      return suksesFS(r, 'Catatan prestasi berhasil dicatat.');
    }
    case 'updatePrestasi': {
      const r = a[0];
      await db.collection('prestasi').doc(r.ID).set({
        bulan: r.Bulan, tahun: Number(r.Tahun), deskripsi: r.DeskripsiPrestasi,
        kategori: r.KategoriPrestasi, catatanTambahan: r.CatatanTambahan || ''
      }, { merge: true });
      return suksesFS(r, 'Catatan prestasi berhasil diperbarui.');
    }
    case 'deletePrestasi':
      await db.collection('prestasi').doc(a[0]).delete();
      return suksesFS(null, 'Catatan prestasi berhasil dihapus.');

    // ── Legalitas ──
    case 'getAllLegalitas': {
      const rows = await ambilKoleksi('legalitas');
      return suksesFS(rows.map(function (l) {
        return Object.assign(legalitasKeLama(l), hitungStatusLegalitasFS(l));
      }), 'OK');
    }
    case 'getLegalitasUMKM': {
      const kode = a[0] || sesi.idUmkm;
      const snap = await saringPeran(db.collection('legalitas').where('idUmkm', '==', kode)).get();
      return suksesFS(snap.docs.map(dokKeObjek).map(function (l) {
        return Object.assign(legalitasKeLama(l), hitungStatusLegalitasFS(l));
      }), 'OK');
    }
    case 'addLegalitas': {
      const r = a[0];
      const sh = r.SeumurHidup === true || String(r.SeumurHidup) === 'true';
      if (!sh && !r.TanggalKadaluarsa) return gagalFS('Isi tanggal kadaluarsa, atau centang "Berlaku seumur hidup".');
      await db.collection('legalitas').add({
        cabang: cab, idUmkm: r.IDUMKM, namaUMKM: r.NamaUMKM || '',
        jenis: r.JenisLegalitas, nomor: r.NomorLegalitas || '',
        terbit: r.TanggalTerbit ? new Date(r.TanggalTerbit) : null,
        kadaluarsa: sh ? null : new Date(r.TanggalKadaluarsa),
        seumurHidup: sh, penerbit: r.Penerbit || '', catatan: r.Catatan || ''
      });
      return suksesFS(r, 'Data legalitas berhasil disimpan.');
    }
    case 'updateLegalitas': {
      const r = a[0];
      const sh = r.SeumurHidup === true || String(r.SeumurHidup) === 'true';
      if (!sh && !r.TanggalKadaluarsa) return gagalFS('Isi tanggal kadaluarsa, atau centang "Berlaku seumur hidup".');
      await db.collection('legalitas').doc(r.ID).set({
        jenis: r.JenisLegalitas, nomor: r.NomorLegalitas || '',
        terbit: r.TanggalTerbit ? new Date(r.TanggalTerbit) : null,
        kadaluarsa: sh ? null : new Date(r.TanggalKadaluarsa),
        seumurHidup: sh, penerbit: r.Penerbit || '', catatan: r.Catatan || ''
      }, { merge: true });
      return suksesFS(r, 'Data legalitas berhasil diperbarui.');
    }
    case 'deleteLegalitas':
      await db.collection('legalitas').doc(a[0]).delete();
      return suksesFS(null, 'Data legalitas berhasil dihapus.');

    // ── Laporan CSR ──
    case 'getAllLaporanCSR': {
      // Laporan CSR tidak terikat satu UMKM, jadi selalu disaring cabang
      let q = db.collection('laporanCsr').where('cabang', '==', cabangAktif());
      const rows = (await q.get()).docs.map(dokKeObjek);
      return suksesFS(rows.map(laporanKeLama), 'OK');
    }
    case 'uploadLaporanCSR': {
      // Dua langkah yang sengaja dipisah:
      //   1. GAS mengunggah BERKAS ke Drive
      //   2. Aplikasi menulis CATATANNYA ke Firestore
      // Sebelumnya GAS ikut menulis catatan — tetapi ke Google Sheets,
      // sehingga berkas terunggah namun tidak pernah muncul di aplikasi.
      const meta = a[3] || {};
      // Penanda unggahan — sengaja dihitung DARI ISI BERKASNYA, bukan acak.
      //
      // Berkas yang sama dengan nama yang sama selalu menghasilkan penanda
      // yang sama, berapa kali pun pengirimannya diulang. Itulah yang
      // membuat pengiriman ulang aman: server mengenali bahwa berkas itu
      // sudah pernah masuk, lalu mengembalikan yang lama alih-alih membuat
      // salinan baru. Penanda acak tidak bisa dipakai di sini, karena
      // percobaan ulang dari lapisan atas akan menghasilkan acak yang beda.
      //
      // Kode cabang ikut masuk ke dalam penanda. Folder Drive untuk laporan
      // CSR dipakai BERSAMA oleh semua cabang, jadi tanpa pembeda ini, dua
      // cabang yang kebetulan mengunggah berkas sama persis dengan nama
      // sama akan dianggap pengulangan — keduanya menunjuk ke satu berkas
      // yang sama. Bila salah satu cabang lalu menghapus catatannya,
      // berkas milik cabang lain ikut hilang.
      const isi = String(a[0] || '');
      const kunciUnggah = 'csr|' + cab + '|' + String(a[1] || '') + '|' + isi.length + '|' +
                          isi.substring(0, 64) + '|' + isi.substring(isi.length - 64);

      const up = await panggilGAS('unggahBerkasLaporan', [a[0], a[1], a[2], kunciUnggah]);
      // Tautan berkasnya ikut diperiksa, bukan hanya status berhasilnya.
      // Tanpa pemeriksaan itu, jawaban yang "berhasil" tetapi tanpa tautan
      // akan diteruskan apa adanya, dan catatannya tersimpan dengan tautan
      // kosong — berkasnya lalu tidak bisa dibuka siapa pun, padahal di
      // layar tertulis berhasil.
      if (!up || !up.success || !up.data || !up.data.fileURL) {
        return gagalFS((up && up.message) ||
          'Berkas gagal diunggah ke Drive. Tidak ada yang tersimpan, silakan coba lagi.');
      }
      await db.collection('laporanCsr').add({
        cabang: cab,
        bulan: meta.Bulan || '',
        tahun: Number(meta.Tahun) || new Date().getFullYear(),
        kategori: meta.Kategori || 'Lainnya',
        namaFile: up.data.namaFile || a[1],
        fileURL: up.data.fileURL,
        fileID: up.data.fileId,
        deskripsi: meta.DeskripsiLaporan || '',
        status: meta.Status || 'Final',
        diuploadOleh: sesi.username || '',
        tanggalUpload: new Date()
      });
      hapusCacheFS('laporanCsr');
      return suksesFS(null, 'Laporan CSR berhasil diunggah.');
    }

    case 'updateLaporanCSR': {
      // Hanya KETERANGAN yang diubah — berkas di Drive tidak disentuh,
      // sehingga fileURL dan fileID tetap menunjuk berkas yang sama.
      const r = a[0] || {};
      if (!r.ID) return gagalFS('ID laporan tidak ditemukan.');
      await db.collection('laporanCsr').doc(r.ID).set({
        bulan: r.Bulan || '',
        tahun: Number(r.Tahun) || new Date().getFullYear(),
        kategori: r.Kategori || 'Lainnya',
        namaFile: r.NamaFile || '',
        deskripsi: r.DeskripsiLaporan || '',
        status: r.Status || 'Final'
      }, { merge: true });
      return suksesFS(r, 'Keterangan laporan berhasil diperbarui.');
    }

    case 'deleteLaporanCSR': {
      // Hapus berkasnya di Drive juga, supaya tidak menumpuk
      const dok = await db.collection('laporanCsr').doc(a[0]).get();
      const fid = dok.exists ? dok.data().fileID : '';
      await db.collection('laporanCsr').doc(a[0]).delete();

      // Pembersihan berkas di Drive sengaja TIDAK ditunggu, dan hanya
      // dicoba sekali.
      //
      // Catatannya sudah terhapus pada baris di atas, jadi dari sisi
      // pengguna pekerjaannya memang sudah selesai. Dulu langkah ini
      // ditunggu dengan tiga kali percobaan; bila Drive sedang lambat,
      // penghapusan satu berkas bisa memakan hampir satu menit — cukup
      // lama untuk memicu percobaan ulang dari lapisan di atasnya, yang
      // lalu berakhir dengan pesan galat padahal berkasnya sudah hilang.
      if (fid) {
        panggilGAS('hapusBerkasLaporan', [fid], { percobaan: 1 })
          .catch(function () { /* berkas yatim di Drive, tidak mengganggu aplikasi */ });
      }
      return suksesFS(null, 'Laporan CSR berhasil dihapus.');
    }

    // ── Pengguna ──
    case 'getAllUsers': {
      if (bolehLintasCabang()) {
        const snap = await db.collection('users').get();
        return suksesFS(snap.docs.map(dokKeObjek).map(userKeLama), 'OK');
      }
      // Akun Stakeholder sengaja TIDAK diikat ke satu cabang (cabang kosong),
      // sehingga tidak ikut terambil saat disaring per cabang. Karena itu
      // diambil lewat query kedua, lalu digabung.
      const [milikCabang, stakeholder] = await Promise.all([
        db.collection('users').where('cabang', '==', cab).get(),
        db.collection('users').where('role', '==', 'stakeholder').get()
      ]);
      const gabung = {};
      milikCabang.docs.concat(stakeholder.docs).forEach(function (d) { gabung[d.id] = dokKeObjek(d); });
      return suksesFS(Object.keys(gabung).map(function (k) { return userKeLama(gabung[k]); }), 'OK');
    }
    case 'updateUser': {
      const r = a[0];
      await db.collection('users').doc(r.originalUsername).set({
        alasanPemblokiran: r.AlasanPemblokiran || ''
      }, { merge: true });
      return suksesFS(r, 'Data user berhasil diperbarui.');
    }
    case 'setStatusAkses': {
      await db.collection('users').doc(a[0]).set({
        statusAkses: a[1], alasanPemblokiran: a[2] || ''
      }, { merge: true });
      return suksesFS(null, 'Status akses "' + a[0] + '" diubah menjadi ' + a[1] + '.');
    }
    case 'deleteUser':
      await db.collection('users').doc(a[0]).delete();
      // Kredensial hanya dapat dihapus lewat GAS (koleksi tertutup bagi browser)
      try { await panggilGAS('hapusKredensial', [a[0]]); } catch (e) {}
      return suksesFS(null, 'User berhasil dihapus.');

    case 'updateProfil': {
      const patch = { alamat: a[0] || '' };
      if (a[1]) patch.fotoURL = a[1];
      if (a[1] === '__KOSONG__') patch.fotoURL = '';
      await db.collection('users').doc(sesi.username).set(patch, { merge: true });
      if (sesi.roleFS === 'umkm' && sesi.idUmkm) {
        // Titik lokasi hanya disimpan pada baris UMKM, bukan pada baris
        // pengguna — baris pengguna tidak ada hubungannya dengan peta.
        // Argumen ketiga sengaja dibedakan: TIDAK DIKIRIM berarti "jangan
        // sentuh titiknya", sedangkan null berarti "hapus titiknya".
        const patchUmkm = Object.assign({}, patch);
        if (a.length > 2) {
          const t = a[2];
          patchUmkm.lat = t ? angkaAtauNull(t.lat) : null;
          patchUmkm.lng = t ? angkaAtauNull(t.lng) : null;
        }
        await db.collection('umkm').doc(sesi.idUmkm).set(patchUmkm, { merge: true });
      }
      return suksesFS(null, 'Profil berhasil diupdate.');
    }

    // ── Closing ──
    case 'getStatusClosing': {
      const kode = (sesi.roleFS === 'umkm') ? sesi.idUmkm : a[0];
      const th = Number(a[1]) || Number(AppState.config.tahunAktif) || new Date().getFullYear();
      const o = await cekClosing(kode, th, 'Omset');
      const t = await cekClosing(kode, th, 'TenagaKerja');
      return suksesFS({
        tahun: th,
        omset: o.sendiri || o.global, tenagaKerja: t.sendiri || t.global,
        globalOmset: o.global, globalTenagaKerja: t.global
      }, 'OK');
    }
    case 'setClosing': {
      const kode = (sesi.roleFS === 'umkm') ? sesi.idUmkm : a[0];
      const th = Number(a[1]);
      const jenisList = (a[2] === 'Semua') ? ['Omset', 'TenagaKerja'] : [a[2]];
      const nama = kode === PENANDA_GLOBAL_FS ? '(SELURUH UMKM)' : '';
      for (const j of jenisList) {
        await db.collection('closing').doc(cab + '_' + kode + '_' + th + '_' + j).set({
          cabang: cab, idUmkm: kode, namaUMKM: nama, tahun: th, jenis: j,
          status: 'Closed', tanggalClosing: new Date(), oleh: sesi.username || ''
        });
      }
      return suksesFS({ kodeUnik: kode, tahun: th },
        kode === PENANDA_GLOBAL_FS
          ? 'Seluruh UMKM berhasil dikunci untuk tahun ' + th + '.'
          : 'Data tahun ' + th + ' berhasil dikunci (closing).');
    }
    case 'bukaClosing': {
      const th = Number(a[1]);
      const jenisList = (a[2] === 'Semua') ? ['Omset', 'TenagaKerja'] : [a[2]];
      for (const j of jenisList) {
        await db.collection('closing').doc(cab + '_' + a[0] + '_' + th + '_' + j).delete();
      }
      return suksesFS(null, 'Kunci data tahun ' + th + ' berhasil dibuka.');
    }
    case 'getAllClosing': {
      const rows = await ambilKoleksi('closing');
      return suksesFS(rows, 'OK');
    }

    // ── Dashboard (dihitung di browser dari data Firestore) ──
    case 'getDashboardOrganisasi': return await susunDashboardOrganisasi(a[0]);
    case 'getDashboardUMKM':       return await susunDashboardUMKM(a[0], a[1]);

    // ── Cadangan ──
    case 'getBackupData': return await susunCadangan();

    default:
      return gagalFS('Action "' + action + '" belum tersedia di versi Firebase.');
  }
}

// ════════════════════════════════════════════════════════
// PEMBANTU
// ════════════════════════════════════════════════════════

function normalisasiNamaFS(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function jarakTeksFS(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const kini = [i];
    for (let j = 1; j <= n; j++) {
      kini[j] = Math.min(prev[j] + 1, kini[j - 1] + 1,
        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    prev = kini;
  }
  return prev[n];
}
function cariUMKMSerupaFS(namaBaru, daftar, kecuali) {
  const baru = normalisasiNamaFS(namaBaru);
  if (!baru) return null;
  for (let i = 0; i < daftar.length; i++) {
    const u = daftar[i];
    if (kecuali && String(u.KodeUnik) === String(kecuali)) continue;
    const ada = normalisasiNamaFS(u.NamaUMKM);
    if (!ada) continue;
    if (ada === baru) return u;
    const batas = baru.length >= 10 ? 2 : 1;
    if (Math.abs(ada.length - baru.length) <= batas && jarakTeksFS(ada, baru) <= batas) return u;
    if (baru.length >= 5 && (ada.indexOf(baru) > -1 || baru.indexOf(ada) > -1)) return u;
  }
  return null;
}

// Singkatan cabang untuk awalan kode unik.
const SINGKATAN_CABANG = { 'CAKUNG': 'CKG', 'TANJUNG': 'TJG' };

function singkatanCabang(kode) {
  return SINGKATAN_CABANG[kode] || String(kode || 'XXX').substring(0, 3).toUpperCase();
}

/**
 * Buat kode unik UMKM baru.
 *
 * PENTING — kode WAJIB menyertakan awalan cabang.
 * Kode ini dipakai sebagai ID dokumen, sementara penomorannya dihitung
 * dari UMKM di cabang sendiri saja (Admin memang tidak boleh melihat
 * cabang lain). Tanpa awalan cabang, UMKM pertama di cabang kedua akan
 * mendapat kode yang sama dengan UMKM pertama di cabang pertama — dan
 * karena ID-nya sama, datanya akan saling menimpa.
 *
 * Format baru : CKG-KUL0001
 * Format lama : KUL0001  (data Cakung sebelum multi-cabang — tetap sah
 *               dan tidak diubah, hanya tidak dipakai lagi untuk yang baru)
 */
function buatKodeUnikFS(sektor, daftarUmkm) {
  const awalan = { 'Kuliner': 'KUL', 'Kerajinan': 'KRJ', 'Pertanian': 'PTN', 'Manufaktur': 'MFG' }[sektor] || 'UMK';
  const cab = singkatanCabang(cabangAktif());

  // Cocokkan kedua format saat mencari nomor tertinggi, supaya penomoran
  // tetap berlanjut dan tidak mengulang dari 1.
  const pola = new RegExp(awalan + '(\\d{4})$');
  let maks = 0;
  daftarUmkm.forEach(function (u) {
    const k = String(u.kodeUnik || u._id || '');
    const m = k.match(pola);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maks) maks = n;
    }
  });
  return cab + '-' + awalan + String(maks + 1).padStart(4, '0');
}

// ════════════════════════════════════════════════════════
// DASHBOARD — dihitung di browser
// ════════════════════════════════════════════════════════
async function susunDashboardOrganisasi(tahunDiminta) {
  const cfgDoc = await db.collection('config').doc(cabangAktif()).get();
  const cfg = cfgDoc.exists ? cfgDoc.data() : {};
  const tahun = Number(tahunDiminta) || Number(cfg.tahunAktif) || new Date().getFullYear();

  // PENTING — omset & tenagaKerja disaring TAHUN di tingkat query.
  // Sebelumnya seluruh isi koleksi dibaca lalu disaring di browser:
  // untuk tenagaKerja saja itu bisa 960 dokumen sekali buka dashboard,
  // padahal yang dipakai hanya satu tahun. Inilah yang menghabiskan
  // kuota harian Firestore.
  const saringTahun = function (q) { return q.where('tahun', '==', tahun); };

  const [umkmR, omsetTh, tkTh, kelasR, fasR, presR, lapR, legR] = await Promise.all([
    ambilKoleksi('umkm'),
    ambilKoleksi('omset', saringTahun, 'th' + tahun),
    ambilKoleksi('tenagaKerja', saringTahun, 'th' + tahun),
    ambilKoleksi('kemandirian'), ambilKoleksi('fasilitasi'),
    ambilKoleksi('prestasi'), ambilKoleksi('laporanCsr'),
    ambilKoleksi('legalitas')
  ]);

  const aktif = umkmR.filter(function (u) { return u.statusAktif !== false; });
  // Kode UMKM aktif — dipakai menyaring SELURUH perhitungan di bawah.
  // UMKM yang dinonaktifkan datanya tetap tersimpan, tetapi tidak lagi
  // ikut dihitung di ringkasan program.
  const kodeAktif = {};
  aktif.forEach(function (u) { kodeAktif[u.kodeUnik || u._id] = true; });
  const hanyaAktif = function (r) { return kodeAktif[r.idUmkm] === true; };
  const perSektor = { Kuliner: 0, Kerajinan: 0, Pertanian: 0, Manufaktur: 0 };
  aktif.forEach(function (u) { if (perSektor[u.sektor] !== undefined) perSektor[u.sektor]++; });

  const omsetAktif = omsetTh.filter(hanyaAktif);
  const omsetPerBulan = BULAN_LIST.map(function (b) {
    return omsetAktif.reduce(function (s, o) { return s + ((o.bulanan || {})[b] || 0); }, 0);
  });
  const totalOmset = omsetPerBulan.reduce(function (s, v) { return s + v; }, 0);

  const tkAktif = tkTh.filter(hanyaAktif);
  const tenagaKerjaPerBulan = BULAN_LIST.map(function (b) {
    return tkAktif.filter(function (t) { return t.bulan === b; })
               .reduce(function (s, t) { return s + (Number(t.jumlah) || 0); }, 0);
  });

  // Total tenaga kerja = jumlah dari input TERAKHIR masing-masing UMKM,
  // bukan total bulan terakhir.
  //
  // Alasannya: tidak semua UMKM mengisi tiap bulan. Bila dihitung dari
  // bulan terakhir saja, UMKM yang terakhir mengisi bulan April akan
  // dianggap nol — padahal tenaga kerjanya tetap ada. Cara ini mengambil
  // angka terbaru yang dimiliki setiap UMKM, lalu menjumlahkannya.
  const terakhirPerUmkm = {};
  tkAktif.forEach(function (t) {
    const urut = BULAN_LIST.indexOf(t.bulan);
    const ada = terakhirPerUmkm[t.idUmkm];
    if (!ada || urut > ada.urut) {
      terakhirPerUmkm[t.idUmkm] = { urut: urut, jumlah: Number(t.jumlah) || 0 };
    }
  });
  const totalTenagaKerja = Object.keys(terakhirPerUmkm)
    .reduce(function (s, k) { return s + terakhirPerUmkm[k].jumlah; }, 0);

  const distribusiKelas = { 'Pemula': 0, 'Madya': 0, 'Pra Mandiri': 0, 'Mandiri': 0 };
  const kelasAktif = kelasR.filter(hanyaAktif);
  kelasAktif.forEach(function (k) { if (distribusiKelas[k.kelas] !== undefined) distribusiKelas[k.kelas]++; });

  const jumlahPrestasi = {};
  presR.filter(hanyaAktif).forEach(function (p) {
    const n = p.namaUMKM || '(Tidak diketahui)';
    jumlahPrestasi[n] = (jumlahPrestasi[n] || 0) + 1;
  });
  const prestasiTerbaru = Object.keys(jumlahPrestasi)
    .map(function (n) { return { NamaUMKM: n, jumlah: jumlahPrestasi[n] }; })
    .sort(function (x, y) { return y.jumlah - x.jumlah; }).slice(0, 5);

  // Daftar tahun disusun dari tahun aktif ± beberapa tahun, bukan dari
  // memindai seluruh data. Memindai koleksi hanya untuk mengisi daftar
  // pilihan tidak sepadan dengan biaya bacaannya.
  const thAktif = Number(cfg.tahunAktif) || new Date().getFullYear();
  const tahunSet = {};
  for (let y = thAktif - 3; y <= thAktif + 1; y++) tahunSet[y] = true;
  tahunSet[tahun] = true;

  // Ringkasan legalitas — hanya milik UMKM aktif, dihitung dengan aturan
  // yang sama persis seperti di halaman Legalitas agar angkanya sejalan.
  const legalitas = { Aktif: 0, 'Perlu Diperbarui': 0, Kadaluarsa: 0 };
  const legalitasAktif = legR.filter(hanyaAktif);
  legalitasAktif.forEach(function (l) {
    const s = hitungStatusLegalitasFS(l).Status;
    if (legalitas[s] !== undefined) legalitas[s]++;
  });
  // UMKM yang belum punya catatan legalitas sama sekali — perlu diketahui
  // karena tidak muncul di tiga angka di atas.
  const punyaLegalitas = {};
  legalitasAktif.forEach(function (l) { punyaLegalitas[l.idUmkm] = true; });
  const tanpaLegalitas = aktif.filter(function (u) {
    return !punyaLegalitas[u.kodeUnik || u._id];
  }).length;

  return suksesFS({
    tahun: tahun,
    legalitas: legalitas,
    totalLegalitas: legalitasAktif.length,
    umkmTanpaLegalitas: tanpaLegalitas,
    totalUMKM: aktif.length,
    perSektor: perSektor,
    totalOmset: totalOmset,
    omsetPerBulan: omsetPerBulan,
    tenagaKerjaPerBulan: tenagaKerjaPerBulan,
    totalTenagaKerja: totalTenagaKerja,
    totalFasilitasi: fasR.filter(hanyaAktif).reduce(function (s, f) { return s + (Number(f.nominal) || 0); }, 0),
    targetFasilitasi: Number(cfg.targetFasilitasiTahunan) || 0,
    distribusiKelas: distribusiKelas,
    totalUMKMDenganKelas: kelasAktif.length || 1,
    prestasiTerbaru: prestasiTerbaru,
    laporanTerbaru: lapR.map(laporanKeLama)
      .sort(function (x, y) { return new Date(y.TanggalUpload) - new Date(x.TanggalUpload); }).slice(0, 5),
    statusAkses: { Allowed: 0, Blocked: 0 },
    bulanLabel: BULAN_LIST,
    daftarTahun: Object.keys(tahunSet).map(Number).sort(function (x, y) { return y - x; })
  }, 'OK');
}

async function susunDashboardUMKM(kodeDiminta, tahunDiminta) {
  const sesi = AppState.session || {};
  const kode = (sesi.roleFS === 'umkm') ? sesi.idUmkm : kodeDiminta;
  const cfgDoc = await db.collection('config').doc(cabangAktif()).get();
  const cfg = cfgDoc.exists ? cfgDoc.data() : {};
  const tahun = Number(tahunDiminta) || Number(cfg.tahunAktif) || new Date().getFullYear();

  const [profilD, omsetD, kelasD, tkS, presS, fasS, legS, omsetAll, tkAll] = await Promise.all([
    db.collection('umkm').doc(kode).get(),
    db.collection('omset').doc(kode + '_' + tahun).get(),
    db.collection('kemandirian').doc(kode).get(),
    saringPeran(db.collection('tenagaKerja').where('idUmkm', '==', kode).where('tahun', '==', tahun)).get(),
    saringPeran(db.collection('prestasi').where('idUmkm', '==', kode)).get(),
    saringPeran(db.collection('fasilitasi').where('idUmkm', '==', kode)).get(),
    saringPeran(db.collection('legalitas').where('idUmkm', '==', kode)).get(),
    saringPeran(db.collection('omset').where('idUmkm', '==', kode)).get(),
    saringPeran(db.collection('tenagaKerja').where('idUmkm', '==', kode)).get()
  ]);

  const omset = omsetD.exists ? dokKeObjek(omsetD) : null;
  const tkRows = tkS.docs.map(dokKeObjek);
  const tkPerBulan = BULAN_LIST.map(function (b) {
    const r = tkRows.find(function (t) { return t.bulan === b; });
    return r ? (Number(r.jumlah) || 0) : 0;
  });

  const tahunSet = {};
  omsetAll.docs.forEach(function (d) { const v = d.data().tahun; if (v) tahunSet[v] = true; });
  tkAll.docs.forEach(function (d) { const v = d.data().tahun; if (v) tahunSet[v] = true; });
  tahunSet[tahun] = true;

  return suksesFS({
    tahun: tahun,
    profil: profilD.exists ? umkmKeLama(dokKeObjek(profilD)) : null,
    omset: omset ? omsetKeLama(omset) : null,
    omsetBulanan: BULAN_LIST.map(function (b) { return omset ? ((omset.bulanan || {})[b] || 0) : 0; }),
    target: omset ? (Number(omset.target) || 0) : 0,
    totalRealisasi: omset ? (Number(omset.totalRealisasi) || 0) : 0,
    statusTarget: omset ? omset.statusTarget : 'Belum Ada Data',
    tkPerBulan: tkPerBulan,
    tenagaKerjaTerbaru: tkPerBulan.filter(function (v) { return v > 0; }).pop() || 0,
    kelas: kelasD.exists ? kemandirianKeLama(dokKeObjek(kelasD)) : null,
    prestasi: presS.docs.map(dokKeObjek).map(prestasiKeLama),
    fasilitasi: fasS.docs.map(dokKeObjek).map(fasilitasiKeLama),
    legalitas: legS.docs.map(dokKeObjek).map(function (l) {
      return Object.assign(legalitasKeLama(l), hitungStatusLegalitasFS(l));
    }),
    bulanLabel: BULAN_LIST,
    daftarTahun: Object.keys(tahunSet).map(Number).sort(function (x, y) { return y - x; })
  }, 'OK');
}

/** Cadangan seluruh koleksi — tanpa kredensial, seperti versi sebelumnya. */
async function susunCadangan() {
  const koleksi = ['cabang', 'users', 'umkm', 'omset', 'tenagaKerja', 'kemandirian',
                   'fasilitasi', 'prestasi', 'legalitas', 'laporanCsr', 'closing', 'config'];
  const sheets = {};
  for (const k of koleksi) {
    try {
      const snap = await db.collection(k).get();
      const rows = snap.docs.map(dokKeObjek);
      const headers = rows.length ? Object.keys(rows[0]) : [];
      sheets[k] = {
        headers: headers,
        rows: rows.map(function (r) {
          return headers.map(function (h) {
            const v = r[h];
            if (v instanceof Date) return formatTglUntukInput(v);
            if (v && typeof v === 'object') return JSON.stringify(v);
            return v;
          });
        })
      };
    } catch (e) { sheets[k] = { headers: [], rows: [] }; }
  }
  return suksesFS({
    namaAplikasi: AppState.config.namaAplikasi || 'SIPUMA',
    waktuBackup: new Date().toISOString(),
    jumlahSheet: Object.keys(sheets).length,
    sheets: sheets
  }, 'Data cadangan berhasil disiapkan.');
}

// ════════════════════════════════════════════════════════
// JALUR GAS (berkas & kredensial)
// ════════════════════════════════════════════════════════
// Beberapa action lama masih menulis ke Google Sheets. Di mode Firebase
// keduanya harus diarahkan ke versi Firestore — kalau tidak, penggantian
// password akan tampak berhasil padahal tidak berpengaruh saat login.
const PETA_AKSI_GAS = {
  resetPassword: 'resetPasswordFirebase'
};

/**
 * Hapus foto profil: berkasnya dihapus lewat GAS (Drive), catatannya
 * dikosongkan langsung di Firestore. Dulu keduanya dikerjakan GAS ke
 * Google Sheets — kini sheet itu hanya cadangan, jadi pengosongan catatan
 * harus dilakukan di Firestore agar benar-benar berpengaruh.
 */
async function hapusFotoProfilFS() {
  const sesi = AppState.session || {};
  const urlLama = sesi.fotoURL || '';
  if (urlLama) {
    // Cukup unggah berkas kosong? Tidak — GAS punya jalur khusus hapus.
    try { await panggilGAS('hapusBerkasFoto', [urlLama]); } catch (e) {}
  }
  await db.collection('users').doc(sesi.username).set({ fotoURL: '' }, { merge: true });
  if (sesi.roleFS === 'umkm' && sesi.idUmkm) {
    await db.collection('umkm').doc(sesi.idUmkm).set({ fotoURL: '' }, { merge: true });
  }
  return suksesFS(null, 'Foto profil berhasil dihapus.');
}

async function panggilGAS(action, args, opsi) {
  opsi = opsi || {};
  action = PETA_AKSI_GAS[action] || action;
  if (!GAS_URL || GAS_URL === 'GANTI_DENGAN_URL_EXEC_ANDA') {
    return gagalFS('Alamat server belum dikonfigurasi. Isi GAS_URL di js/config.js.');
  }
  // Pengguna yang masuk lewat jalur cepat belum punya sesi GAS — sesinya
  // diterbitkan di sini, sekali, saat pertama kali ada yang membutuhkannya.
  let tokenGas = (AppState.session || {}).tokenGas || '';
  if (!tokenGas && typeof pastikanTokenGas === 'function') {
    tokenGas = await pastikanTokenGas();
  }

  const payload = { action: action, args: args || [] };
  if (tokenGas) payload.token = tokenGas;

  const maks = opsi.percobaan || 3;
  let doGetTerulang = false;    // jawaban doGet hanya diulang satu kali
  let sesiDiperbarui = false;   // sesi GAS hanya diterbitkan ulang sekali
  for (let i = 1; i <= maks; i++) {
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      if (!res.ok) throw new Error('Status ' + res.status);
      const jawaban = await res.json();

      // ── Sesi berkas kedaluwarsa → terbitkan ulang, lalu coba lagi ──
      //
      // Sesi GAS punya masa berlaku sendiri, terpisah dari sesi Firebase.
      // Dulu sesi itu hanya diterbitkan saat belum ada sama sekali, jadi
      // begitu masa berlakunya habis tidak ada yang memperbaruinya — dan
      // setiap unggahan berikutnya ditolak dengan "Sesi Anda sudah
      // berakhir", bahkan setelah pengguna login ulang berkali-kali.
      if (jawaban && jawaban.sesiHabis && !sesiDiperbarui) {
        sesiDiperbarui = true;
        if (AppState.session) {
          AppState.session.tokenGas = '';
          if (typeof simpanSesiLokal === 'function') simpanSesiLokal(AppState.session);
        }
        const tokenBaru = (typeof pastikanTokenGas === 'function') ? await pastikanTokenGas() : '';
        if (tokenBaru) { payload.token = tokenBaru; continue; }
        return { success: false, data: null,
                 message: 'Sesi untuk unggah berkas tidak dapat disiapkan. ' +
                          'Coba muat ulang halaman; bila tetap gagal, periksa kuota ' +
                          'harian Firebase di Firebase Console → Usage.' };
      }

      // ── Kuota harian Firebase habis ──
      // Pesan aslinya berbahasa Inggris dan berbentuk JSON mentah, yang
      // bagi pengguna tidak ada artinya. Diterjemahkan agar sebabnya jelas,
      // karena yang diperlukan memang menunggu, bukan mencoba terus.
      if (jawaban && jawaban.success === false &&
          /Quota exceeded|RESOURCE_EXHAUSTED/i.test(String(jawaban.message || ''))) {
        return { success: false, data: null,
                 message: 'Kuota harian Firebase sudah habis untuk hari ini, jadi ' +
                          'data tidak dapat dibaca atau disimpan sementara waktu. ' +
                          'Jatahnya dihitung ulang setiap hari; coba lagi nanti.' };
      }

      // Kadang Apps Script membalas permintaan POST dengan jawaban doGet:
      // "SIPUMA API aktif. Gunakan POST untuk seluruh operasi data."
      // Itu terjadi bila pengalihan internal Google tersesat saat
      // eksekusinya berjalan lama — paling sering waktu mengunggah berkas.
      // Jawaban itu bukan hasil yang sah, jadi diulang sekali, bukan
      // ditampilkan kepada pengguna sebagai pesan gagal yang membingungkan.
      if (jawaban && jawaban.success === false &&
          String(jawaban.message || '').indexOf('Gunakan POST') > -1) {
        if (!doGetTerulang) {
          doGetTerulang = true;
          console.warn('SIPUMA: server membalas dengan jawaban doGet — diulang sekali.');
          await new Promise(function (r) { setTimeout(r, 800); });
          continue;
        }
        return { success: false, data: null,
                 message: 'Server berkas sedang sibuk dan belum sempat memproses ' +
                          'permintaan ini. Coba lagi sebentar lagi.' };
      }
      return jawaban;
    } catch (e) {
      if (i === maks) {
        return { success: false, data: null, gagalKoneksi: true,
                 message: 'Tidak dapat terhubung ke server berkas.' };
      }
      await new Promise(function (r) { setTimeout(r, 600 * i); });
    }
  }
}




/**
 * Tentukan kelas kemandirian dari rata-rata skor.
 *
 * ⚠️ Ambang batas ini HARUS sama persis dengan hitungKelas() di Kode.gs.
 * Sebelumnya di sini tertulis ambang yang berbeda (85/70/55), sehingga
 * skor 70–85 selalu jatuh ke "Pra Mandiri" — kelasnya tampak tidak
 * pernah berubah meski skornya naik.
 */
function hitungKelasFS(rataRata) {
  const r = Number(rataRata) || 0;
  if (r < 25) return 'Pemula';
  if (r < 50) return 'Madya';
  if (r < 75) return 'Pra Mandiri';
  return 'Mandiri';
}
