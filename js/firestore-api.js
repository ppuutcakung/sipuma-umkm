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
  'buatKredensialUMKM', 'hapusKredensial',
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
const CACHE_UMUR_MS = 90 * 1000;

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
    TanggalBinaan: u.tanggalBinaan, FotoURL: u.fotoURL,
    StatusAktif: u.statusAktif === false ? 'Tidak Aktif' : 'Aktif',
    TerakhirUpdate: u.terakhirUpdate
  };
}
function umkmKeBaru(d) {
  return {
    cabang: cabangAktif(),
    kodeUnik: d.KodeUnik, namaUMKM: d.NamaUMKM, sektor: d.SektorUsaha,
    spesialisasi: d.Spesialisasi || '', alamat: d.AlamatUsaha || '',
    noHP: d.NoHP || '',
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
    return panggilGAS(action, args, opsi);
  }
  if (!db) return gagalFS('Firebase belum siap. Muat ulang halaman.');

  try {
    return await jalankanAksiFirestore(action, args);
  } catch (e) {
    console.error('SIPUMA Firestore (' + action + '):', e);
    if (e.code === 'permission-denied') {
      return gagalFS('Anda tidak memiliki hak akses untuk tindakan ini.');
    }
    if (e.code === 'unavailable') {
      return { success: false, data: null, gagalKoneksi: true,
               message: 'Tidak dapat terhubung. Periksa koneksi internet Anda.' };
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
  uploadLaporanCSR: 'laporanCsr', deleteLaporanCSR: 'laporanCsr',
  updateUser: 'users', setStatusAkses: 'users', deleteUser: 'users', updateProfil: 'users',
  setClosing: 'closing', bukaClosing: 'closing',
  setConfig: 'config', setPeriodeAktif: 'config'
};

async function jalankanAksiFirestore(action, a) {
  const cab = cabangAktif();
  const sesi = AppState.session || {};

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
      const kred = await panggilGAS('buatKredensialUMKM', [d.NamaUMKM, kode]);
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
      const patch = umkmKeBaru(d);
      delete patch.cabang;                       // cabang tidak boleh berpindah lewat sini
      await db.collection('umkm').doc(d.KodeUnik).set(patch, { merge: true });
      return suksesFS(d, 'Profil UMKM berhasil diperbarui.');
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
      const kelas = rata >= 85 ? 'Mandiri' : rata >= 70 ? 'Pra Mandiri' : rata >= 55 ? 'Madya' : 'Pemula';
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
      const up = await panggilGAS('unggahBerkasLaporan', [a[0], a[1], a[2]]);
      if (!up || !up.success || !up.data) {
        return gagalFS((up && up.message) || 'Berkas gagal diunggah ke Drive.');
      }
      await db.collection('laporanCsr').add({
        cabang: cab,
        bulan: meta.Bulan || '',
        tahun: Number(meta.Tahun) || new Date().getFullYear(),
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

    case 'deleteLaporanCSR': {
      // Hapus berkasnya di Drive juga, supaya tidak menumpuk
      const dok = await db.collection('laporanCsr').doc(a[0]).get();
      const fid = dok.exists ? dok.data().fileID : '';
      await db.collection('laporanCsr').doc(a[0]).delete();
      if (fid) { try { await panggilGAS('hapusBerkasLaporan', [fid]); } catch (e) {} }
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
        await db.collection('umkm').doc(sesi.idUmkm).set(patch, { merge: true });
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

  const [umkmR, omsetTh, tkTh, kelasR, fasR, presR, lapR] = await Promise.all([
    ambilKoleksi('umkm'),
    ambilKoleksi('omset', saringTahun, 'th' + tahun),
    ambilKoleksi('tenagaKerja', saringTahun, 'th' + tahun),
    ambilKoleksi('kemandirian'), ambilKoleksi('fasilitasi'),
    ambilKoleksi('prestasi'), ambilKoleksi('laporanCsr')
  ]);

  const aktif = umkmR.filter(function (u) { return u.statusAktif !== false; });
  const perSektor = { Kuliner: 0, Kerajinan: 0, Pertanian: 0, Manufaktur: 0 };
  aktif.forEach(function (u) { if (perSektor[u.sektor] !== undefined) perSektor[u.sektor]++; });

  const omsetPerBulan = BULAN_LIST.map(function (b) {
    return omsetTh.reduce(function (s, o) { return s + ((o.bulanan || {})[b] || 0); }, 0);
  });
  const totalOmset = omsetPerBulan.reduce(function (s, v) { return s + v; }, 0);

  const tenagaKerjaPerBulan = BULAN_LIST.map(function (b) {
    return tkTh.filter(function (t) { return t.bulan === b; })
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
  tkTh.forEach(function (t) {
    const urut = BULAN_LIST.indexOf(t.bulan);
    const ada = terakhirPerUmkm[t.idUmkm];
    if (!ada || urut > ada.urut) {
      terakhirPerUmkm[t.idUmkm] = { urut: urut, jumlah: Number(t.jumlah) || 0 };
    }
  });
  const totalTenagaKerja = Object.keys(terakhirPerUmkm)
    .reduce(function (s, k) { return s + terakhirPerUmkm[k].jumlah; }, 0);

  const distribusiKelas = { 'Pemula': 0, 'Madya': 0, 'Pra Mandiri': 0, 'Mandiri': 0 };
  kelasR.forEach(function (k) { if (distribusiKelas[k.kelas] !== undefined) distribusiKelas[k.kelas]++; });

  const jumlahPrestasi = {};
  presR.forEach(function (p) {
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

  return suksesFS({
    tahun: tahun,
    totalUMKM: aktif.length,
    perSektor: perSektor,
    totalOmset: totalOmset,
    omsetPerBulan: omsetPerBulan,
    tenagaKerjaPerBulan: tenagaKerjaPerBulan,
    totalTenagaKerja: totalTenagaKerja,
    totalFasilitasi: fasR.reduce(function (s, f) { return s + (Number(f.nominal) || 0); }, 0),
    targetFasilitasi: Number(cfg.targetFasilitasiTahunan) || 0,
    distribusiKelas: distribusiKelas,
    totalUMKMDenganKelas: kelasR.length || 1,
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
  const payload = { action: action, args: args || [] };
  if (AppState.session && AppState.session.tokenGas) payload.token = AppState.session.tokenGas;

  const maks = opsi.percobaan || 3;
  for (let i = 1; i <= maks; i++) {
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      if (!res.ok) throw new Error('Status ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === maks) {
        return { success: false, data: null, gagalKoneksi: true,
                 message: 'Tidak dapat terhubung ke server berkas.' };
      }
      await new Promise(function (r) { setTimeout(r, 600 * i); });
    }
  }
}


