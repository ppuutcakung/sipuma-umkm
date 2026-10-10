// ════════════════════════════════════════════════════════
// PETA SEBARAN UMKM
// ════════════════════════════════════════════════════════
// Berkas ini berdiri sendiri. Seluruh isinya hanya menambah, tidak satu pun
// mengubah perilaku halaman yang sudah ada — jadi bila peta bermasalah,
// yang terganggu hanya tab peta, sisa aplikasi tetap berjalan.
//
// Pustaka yang dipakai semuanya gratis dan tanpa kunci API:
//   • Leaflet            — mesin petanya
//   • Leaflet.markercluster — mengelompokkan titik yang berdekatan
//   • OpenStreetMap      — gambar petanya
//
// Gambar peta diambil dari server peta, BUKAN dari Firebase. Membuka tab
// peta tidak menambah pemakaian kuota Firebase sama sekali: daftar UMKM
// yang dipakainya adalah daftar yang sudah dibaca dan disimpan oleh dasbor.
//
// ── Catatan tentang CARTO ──
// Rencana awal memakai CARTO Positron karena tampilannya bersih dan
// (katanya) bebas kunci API. Ternyata TIDAK: petanya memang tampil, tetapi
// seluruh gambarnya bertuliskan "API KEY REQUIRED" melintang sehingga tidak
// terbaca sama sekali. Karena itu sumber bakunya dipindah ke OpenStreetMap,
// yang betul-betul tanpa kunci dan tidak akan berubah diam-diam.
//
// Bila suatu saat ingin tampilan bersih ala CARTO, daftar gratis di
// carto.com lalu tempel kuncinya pada baris di bawah ini — tidak ada lagi
// yang perlu diubah. Dibiarkan kosong berarti memakai OpenStreetMap.
const PETA_KUNCI_CARTO = '';

/**
 * Lapisan gambar peta.
 *
 * Bila gambar dari sumber utama gagal dimuat, lapisannya diganti sendiri ke
 * OpenStreetMap. Tanpa penjagaan ini, kegagalan sumber peta berakhir sebagai
 * kotak abu-abu kosong tanpa penjelasan apa pun.
 */
function petaLapisanDasar(peta) {
  const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const osmAtr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  if (PETA_KUNCI_CARTO) {
    const carto = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=' + PETA_KUNCI_CARTO,
      { maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' });
    let sudahPindah = false;
    carto.on('tileerror', function () {
      if (sudahPindah) return;
      sudahPindah = true;
      console.warn('SIPUMA: gambar peta CARTO gagal dimuat — beralih ke OpenStreetMap.');
      try { peta.removeLayer(carto); } catch (e) {}
      L.tileLayer(osmUrl, { maxZoom: 19, attribution: osmAtr }).addTo(peta);
    });
    return carto.addTo(peta);
  }

  return L.tileLayer(osmUrl, { maxZoom: 19, attribution: osmAtr }).addTo(peta);
}


// Batas kasar wilayah Indonesia. Dipakai hanya untuk MEMPERINGATKAN, bukan
// menolak — koordinat di luar sini hampir selalu pertanda lintang dan bujur
// tertukar, kesalahan yang paling sering terjadi saat menyalin manual.
const PETA_BATAS_ID = { latMin: -11.5, latMaks: 6.5, lngMin: 94.5, lngMaks: 141.5 };

/**
 * Kotak wilayah Indonesia untuk Leaflet.
 *
 * Dipakai dua kali: sebagai tampilan awal saat belum ada titik, dan sebagai
 * PAGAR agar peta tidak bisa digeser keluar Indonesia lalu tersesat di
 * tengah samudra. Diberi kelonggaran sedikit supaya Sabang dan Merauke tetap
 * leluasa dilihat sampai ke tepinya.
 */
function petaKotakIndonesia() {
  return L.latLngBounds(
    [PETA_BATAS_ID.latMin, PETA_BATAS_ID.lngMin],
    [PETA_BATAS_ID.latMaks, PETA_BATAS_ID.lngMaks]
  ).pad(0.12);
}

// Pengaturan yang sama untuk semua peta di SIPUMA: tidak bisa diperkecil
// sampai memperlihatkan bola dunia, dan tidak bisa digeser keluar Indonesia.
function petaOpsiDasar() {
  return {
    attributionControl: true,
    minZoom: 4,
    maxBounds: petaKotakIndonesia(),
    maxBoundsViscosity: 0.75
  };
}

const PETA_WARNA_SEKTOR = {
  'Kuliner':    '#DC2626',
  'Kerajinan':  '#D97706',
  'Pertanian':  '#059669',
  'Manufaktur': '#2563EB'
};
function petaWarnaSektor(s) { return PETA_WARNA_SEKTOR[s] || '#6B7280'; }

/**
 * Apakah sepasang nilai ini benar-benar sebuah titik lokasi?
 *
 * Pemeriksaannya sengaja ketat, karena cara yang "kelihatan benar" justru
 * menipu: isFinite(null) bernilai BENAR — null diam-diam dianggap angka 0 —
 * sedangkan null === 0 bernilai SALAH. Gabungan keduanya membuat UMKM yang
 * belum punya titik dibaca seolah punya titik di 0,0, yaitu laut lepas di
 * pantai barat Afrika. Di layar gejalanya: "Titik tersimpan: 0.000000,
 * 0.000000" dan peta biru polos tanpa daratan.
 *
 * Karena itu null, undefined, dan teks kosong ditolak lebih dulu — sebelum
 * angkanya diperiksa sama sekali.
 */
function titikSah(lat, lng) {
  if (lat === null || lat === undefined || lat === '') return false;
  if (lng === null || lng === undefined || lng === '') return false;
  const la = Number(lat), ln = Number(lng);
  if (!isFinite(la) || !isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;          // 0,0 = belum diisi
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  return true;
}

// ════════════════════════════════════════════════════════
// MEMBACA KOORDINAT DARI TEKS
// ════════════════════════════════════════════════════════

/**
 * Ambil koordinat dari apa pun yang ditempel pengguna.
 *
 * Yang dikenali:
 *   • angka biasa          -6.1754, 106.9400
 *   • tautan peta panjang  .../@-6.1754,106.9400,17z/...
 *   • tautan dengan !3d    ...!3d-6.1754!4d106.9400
 *   • tautan dengan q/ll   ...?q=-6.1754,106.9400
 *
 * Hasilnya: { ok, lat, lng, pesan }
 *
 * Tautan pendek (maps.app.goo.gl / goo.gl/maps) SENGAJA tidak dicoba
 * diterjemahkan. Alamat sebenarnya hanya diketahui server Google, dan
 * browser tidak diizinkan membukanya diam-diam dari halaman lain. Daripada
 * gagal tanpa penjelasan, pengguna diberi tahu langkah yang benar.
 */
function uraiKoordinat(teks) {
  const t = String(teks || '').trim();
  if (!t) return { ok: false, pesan: 'Belum ada yang ditempel.' };

  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(t)) {
    return { ok: false, pesan:
      'Itu tautan pendek. Buka dulu tautannya di peramban sampai petanya tampil, ' +
      'lalu salin alamat lengkap dari bilah alamat dan tempel lagi ke sini.' };
  }

  const pola = [
    /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,                    // .../@lat,lng,17z
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,                   // ...!3dlat!4dlng
    /[?&](?:q|ll|query|destination|center)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/        // angka biasa
  ];

  for (let i = 0; i < pola.length; i++) {
    const c = t.match(pola[i]);
    if (!c) continue;
    const lat = parseFloat(c[1]), lng = parseFloat(c[2]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, pesan:
        'Angkanya di luar batas yang mungkin. Lintang harus antara -90 dan 90, ' +
        'bujur antara -180 dan 180. Mungkin urutannya tertukar?' };
    }
    const luar = (lat < PETA_BATAS_ID.latMin || lat > PETA_BATAS_ID.latMaks ||
                  lng < PETA_BATAS_ID.lngMin || lng > PETA_BATAS_ID.lngMaks);
    return {
      ok: true, lat: lat, lng: lng,
      pesan: luar
        ? 'Titik tersimpan, tetapi letaknya DI LUAR Indonesia. Periksa lagi — ' +
          'lintang dan bujur sering tertukar urutannya.'
        : ''
    };
  }

  return { ok: false, pesan:
    'Tidak ada koordinat yang bisa dibaca dari teks itu. Tempel alamat lengkap ' +
    'Google Maps, atau ketik angkanya langsung seperti: -6.1754, 106.9400' };
}

// ════════════════════════════════════════════════════════
// PEMILIH LOKASI — dipakai di formulir
// ════════════════════════════════════════════════════════
// Titik yang sedang dipilih disimpan per wadah, bukan di satu variabel
// bersama. Dengan begitu dua formulir yang kebetulan terbuka bersamaan
// tidak saling menimpa titiknya.
const _titikPilihan = {};
const _petaPemilih = {};

/** Titik yang sedang terpilih pada sebuah pemilih. null bila kosong. */
function ambilTitikPilihan(idWadah) {
  return _titikPilihan[idWadah] || null;
}

/**
 * Pasang pemilih lokasi ke dalam sebuah wadah.
 * Wadahnya HARUS sudah ada di halaman sebelum fungsi ini dipanggil.
 */
function pasangPemilihLokasi(idWadah, lat, lng) {
  const wadah = document.getElementById(idWadah);
  if (!wadah) return;

  // Bila pustaka petanya gagal dimuat (jaringan kantor memblokir CDN,
  // misalnya), formulirnya TIDAK boleh ikut rusak. Isian koordinat manual
  // disediakan sebagai pengganti, dan sisa formulir tetap berfungsi penuh.
  if (typeof L === 'undefined') {
    _titikPilihan[idWadah] = titikSah(lat, lng)
      ? { lat: Number(lat), lng: Number(lng) } : null;
    wadah.innerHTML =
      '<div class="d-flex gap-2" style="flex-wrap:wrap;">' +
        '<input class="form-control" id="' + idWadah + '_teks" style="flex:1;min-width:200px;" ' +
          'placeholder="Ketik: -6.1754, 106.9400">' +
        '<button type="button" class="btn btn-outline" onclick="terapkanTeksLokasi(\'' + idWadah + '\')">' +
          'Terapkan</button>' +
      '</div>' +
      '<div id="' + idWadah + '_info" style="font-size:12px;color:var(--text-muted);margin-top:6px;"></div>' +
      '<button type="button" class="btn btn-outline btn-sm mt-2" id="' + idWadah + '_hapus" ' +
        'onclick="hapusTitikPilihan(\'' + idWadah + '\')" style="display:none;">Hapus titik</button>' +
      '<div class="login-hint">Peta tidak dapat dimuat, jadi titiknya diketik manual. ' +
        'Periksa koneksi internet lalu muat ulang halaman bila ingin memakai peta.</div>';
    perbaruiInfoPemilih(idWadah, '');
    return;
  }

  // Peta sebelumnya pada wadah yang sama dibongkar dulu. Tanpa ini, membuka
  // formulir untuk kedua kalinya meninggalkan peta lama yang menggantung di
  // memori beserta seluruh pendengarnya.
  if (_petaPemilih[idWadah] && _petaPemilih[idWadah].peta) {
    try { _petaPemilih[idWadah].peta.remove(); } catch (e) {}
    delete _petaPemilih[idWadah];
  }

  const adaAwal = titikSah(lat, lng);
  _titikPilihan[idWadah] = adaAwal ? { lat: Number(lat), lng: Number(lng) } : null;

  wadah.innerHTML =
    '<div class="form-group" style="margin-bottom:8px;">' +
      '<div class="d-flex gap-2" style="flex-wrap:wrap;">' +
        '<input class="form-control" id="' + idWadah + '_teks" style="flex:1;min-width:200px;" ' +
          'placeholder="Tempel tautan Google Maps, atau ketik: -6.1754, 106.9400">' +
        '<button type="button" class="btn btn-outline" onclick="terapkanTeksLokasi(\'' + idWadah + '\')">' +
          '<i class="bi bi-geo-alt"></i> Terapkan</button>' +
      '</div>' +
      '<div class="login-hint">Cara tercepat di lapangan: buka Google Maps di HP, tekan lama ' +
        'titik lokasinya, pilih Bagikan, lalu tempel tautannya di sini. Bisa juga langsung ' +
        'klik petanya di bawah.</div>' +
    '</div>' +
    '<div id="' + idWadah + '_kanvas" style="height:240px;border-radius:10px;overflow:hidden;' +
      'border:1px solid var(--border);"></div>' +
    '<div class="d-flex gap-2 align-center mt-2" style="flex-wrap:wrap;">' +
      '<span id="' + idWadah + '_info" style="font-size:12px;color:var(--text-muted);"></span>' +
      '<button type="button" class="btn btn-outline btn-sm" id="' + idWadah + '_hapus" ' +
        'onclick="hapusTitikPilihan(\'' + idWadah + '\')" style="display:none;">' +
        '<i class="bi bi-x-lg"></i> Hapus titik</button>' +
    '</div>';

  const peta = L.map(idWadah + '_kanvas', petaOpsiDasar());
  petaLapisanDasar(peta);

  // Sudah ada titik → langsung ke titiknya. Belum ada → seluruh Indonesia,
  // bukan bola dunia dan bukan belahan bumi lain.
  const awal = adaAwal ? [Number(lat), Number(lng)] : null;
  if (awal) peta.setView(awal, 16);
  else peta.fitBounds(petaKotakIndonesia());

  let penanda = awal ? L.marker(awal).addTo(peta) : null;

  peta.on('click', function (e) {
    _titikPilihan[idWadah] = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (penanda) penanda.setLatLng(e.latlng);
    else penanda = L.marker(e.latlng).addTo(peta);
    perbaruiInfoPemilih(idWadah, '');
  });

  _petaPemilih[idWadah] = {
    peta: peta,
    taruh: function (la, ln) {
      const p = L.latLng(la, ln);
      if (penanda) penanda.setLatLng(p); else penanda = L.marker(p).addTo(peta);
      peta.setView(p, 17);
    },
    buang: function () { if (penanda) { peta.removeLayer(penanda); penanda = null; } }
  };

  perbaruiInfoPemilih(idWadah, '');

  // Peta yang digambar di dalam jendela yang baru muncul sering salah ukur
  // sendiri — bagian bawahnya jadi abu-abu kosong. Ukurannya dihitung ulang
  // beberapa kali setelah jendelanya benar-benar tampil.
  [60, 250, 600].forEach(function (ms) {
    setTimeout(function () { try { peta.invalidateSize(); } catch (e) {} }, ms);
  });
}

function perbaruiInfoPemilih(idWadah, pesan) {
  const info = document.getElementById(idWadah + '_info');
  const tblHapus = document.getElementById(idWadah + '_hapus');
  const t = _titikPilihan[idWadah];
  if (!info) return;
  if (t) {
    info.innerHTML = '<b>Titik tersimpan:</b> ' + t.lat.toFixed(6) + ', ' + t.lng.toFixed(6) +
      (pesan ? '<br><span style="color:var(--madya-text);">' + esc(pesan) + '</span>' : '');
    if (tblHapus) tblHapus.style.display = '';
  } else {
    info.innerHTML = 'Belum ada titik lokasi. Boleh dikosongkan — UMKM tetap tersimpan, ' +
      'hanya saja belum muncul di peta sebaran.';
    if (tblHapus) tblHapus.style.display = 'none';
  }
}

/** Tombol "Terapkan" pada pemilih lokasi. */
function terapkanTeksLokasi(idWadah) {
  const inp = document.getElementById(idWadah + '_teks');
  if (!inp) return;
  const hasil = uraiKoordinat(inp.value);
  if (!hasil.ok) { showToast('Belum bisa dibaca', hasil.pesan, 'warning'); return; }
  _titikPilihan[idWadah] = { lat: hasil.lat, lng: hasil.lng };
  if (_petaPemilih[idWadah]) _petaPemilih[idWadah].taruh(hasil.lat, hasil.lng);
  perbaruiInfoPemilih(idWadah, hasil.pesan);
  inp.value = '';
  if (hasil.pesan) showToast('Perlu diperiksa', hasil.pesan, 'warning');
  else showToast('Berhasil', 'Titik lokasi diterapkan. Jangan lupa tekan Simpan.', 'success');
}

function hapusTitikPilihan(idWadah) {
  _titikPilihan[idWadah] = null;
  if (_petaPemilih[idWadah]) _petaPemilih[idWadah].buang();
  perbaruiInfoPemilih(idWadah, '');
}

// ════════════════════════════════════════════════════════
// TAB PETA SEBARAN
// ════════════════════════════════════════════════════════

let _petaUtama = null;
let _petaKlaster = null;
let _petaSaringSektor = '';
let _petaSaringStatus = '';
let _petaKataCari = '';

// Batas perbesaran saat peta menyorot hasil saringan. Zoom 11 kira-kira
// selebar satu kota atau kabupaten beserta tetangganya — cukup untuk
// melihat sebarannya, tanpa terlanjur masuk ke tingkat jalan.
const PETA_ZOOM_WILAYAH = 11;

let _timerSorot = null;

/**
 * Kembalikan peta sebaran ke tampilan seluruh Indonesia.
 *
 * Dipanggil saat tab dibuka, saat saringan dikosongkan, dan saat tombol
 * "Tampilkan Seluruh Indonesia" ditekan — TIDAK lagi setiap kali popup
 * ditutup. Percobaan sebelumnya memulangkan peta otomatis setiap selesai
 * melihat satu UMKM, dan di pemakaian nyata itu terasa seperti ditarik
 * paksa: menyusuri beberapa UMKM dalam satu kelurahan jadi melelahkan.
 * Sekarang peta tetap pada tempat yang ditinggalkan pengguna, dan pulang
 * hanya ketika memang diminta.
 */
function petaKembaliKeIndonesia() {
  if (!_petaUtama) return;
  if (typeof AppState !== 'undefined' && AppState.currentSection !== 'petaUMKM') return;
  try { _petaUtama.flyToBounds(petaKotakIndonesia(), { duration: 0.6 }); } catch (e) {}
}

/** Halaman Peta Sebaran UMKM — untuk Admin dan Stakeholder. */
function loadPetaUMKM() {
  const sec = AppState.currentSection;
  const wadah = document.getElementById('app-container');
  wadah.innerHTML = areaMemuat();

  ensureUmkmCacheThen(function () {
    if (AppState.currentSection !== sec) return;
    gambarHalamanPeta();
  });
}

function gambarHalamanPeta() {
  const semua = AppState.cache.umkm || [];
  const berTitik = semua.filter(punyaTitik);

  document.getElementById('app-container').innerHTML =
    pageHeader('Sebaran Wilayah', 'Peta', 'UMKM',
      'Lihat persebaran UMKM binaan di wilayah kerja, lengkap dengan rute kunjungan ' +
      'dan kontak pendampingan.', '') +

    '<div class="grid grid-4 mb-3">' +
      '<div class="kpi-card c-blue"><div class="kpi-label">Sudah Ditandai</div>' +
        '<div class="kpi-value">' + berTitik.length + '</div>' +
        '<div class="kpi-meta">dari ' + semua.length + ' UMKM</div></div>' +
      '<div class="kpi-card c-red"><div class="kpi-label">Belum Ditandai</div>' +
        '<div class="kpi-value">' + (semua.length - berTitik.length) + '</div>' +
        '<div class="kpi-meta">belum muncul di peta</div></div>' +
      '<div class="kpi-card c-green"><div class="kpi-label">Tampil Sekarang</div>' +
        '<div class="kpi-value" id="petaJumlahTampil">' + berTitik.length + '</div>' +
        '<div class="kpi-meta">sesuai saringan</div></div>' +
      '<div class="kpi-card c-purple"><div class="kpi-label">Cakupan</div>' +
        '<div class="kpi-value">' +
          (semua.length ? Math.round(berTitik.length / semua.length * 100) : 0) + '%</div>' +
        '<div class="kpi-meta">data lokasi terisi</div></div>' +
    '</div>' +

    '<div class="table-card">' +
      '<div class="table-toolbar">' +
        '<div class="d-flex gap-2 align-center" style="flex-wrap:wrap;">' +
          '<select class="form-select" id="petaFilterSektor" style="width:auto;height:34px;" ' +
            'onchange="terapkanSaringPeta()">' +
            '<option value="">Semua Sektor</option>' +
            SEKTOR_LIST.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('') +
          '</select>' +
          '<select class="form-select" id="petaFilterStatus" style="width:auto;height:34px;" ' +
            'onchange="terapkanSaringPeta()">' +
            '<option value="">Semua Status</option>' +
            '<option value="Aktif">Aktif</option>' +
            '<option value="Tidak Aktif">Tidak Aktif</option>' +
          '</select>' +
          '<div class="input-group-icon" style="width:230px;">' +
            '<i class="bi bi-search"></i>' +
            '<input type="text" class="form-control" id="petaCari" style="height:34px;" ' +
              'placeholder="Cari nama UMKM..." oninput="terapkanSaringPeta()">' +
          '</div>' +
          '<button class="btn btn-outline btn-sm" onclick="petaKembaliKeIndonesia()" ' +
            'title="Kembali melihat seluruh Indonesia">' +
            '<i class="bi bi-arrows-fullscreen"></i> Tampilkan Seluruh Indonesia</button>' +
        '</div>' +
      '</div>' +
      '<div style="padding:0 14px 14px;">' +
        '<div id="petaKanvas" style="height:62vh;min-height:420px;border-radius:12px;' +
          'overflow:hidden;border:1px solid var(--border);"></div>' +
        '<div class="d-flex gap-3 mt-2" style="flex-wrap:wrap;font-size:12px;color:var(--text-muted);">' +
          SEKTOR_LIST.map(function (s) {
            return '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;' +
              'background:' + petaWarnaSektor(s) + ';margin-right:5px;"></span>' + esc(s) + '</span>';
          }).join('') +
        '</div>' +
        '<div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">' +
          'Pilih sektor atau status untuk menyorot wilayah sebarannya. ' +
          'Kosongkan saringan untuk kembali melihat seluruh Indonesia.' +
        '</div>' +
      '</div>' +
    '</div>' +

    (berTitik.length ? '' :
      '<div class="panel mt-3" style="background:var(--madya-bg);border-left:4px solid var(--madya-accent);">' +
        '<div style="font-size:13px;color:var(--madya-text);">' +
          '<b><i class="bi bi-info-circle"></i> Belum ada UMKM yang ditandai lokasinya.</b><br>' +
          '<span style="font-size:12px;">Petanya masih kosong karena titik lokasi belum pernah diisi. ' +
          'Buka <b>Data Master UMKM</b> → Ubah salah satu UMKM → isi bagian <b>Titik Lokasi</b>. ' +
          'UMKM juga dapat menandai lokasinya sendiri lewat <b>Profil Usaha Saya</b>.</span>' +
        '</div></div>');

  mulaiPetaSebaran();
}

function punyaTitik(u) {
  return titikSah(u.Lat, u.Lng);
}

function mulaiPetaSebaran() {
  // Bila pustaka petanya gagal dimuat, halaman ini menjelaskan keadaannya
  // alih-alih berhenti dengan layar kosong tanpa sebab.
  if (typeof L === 'undefined' || typeof L.markerClusterGroup !== 'function') {
    const k = document.getElementById('petaKanvas');
    if (k) k.innerHTML =
      '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);">' +
        '<i class="bi bi-wifi-off" style="font-size:28px;"></i>' +
        '<div style="margin-top:10px;font-size:13px;"><b>Pustaka peta gagal dimuat.</b></div>' +
        '<div style="font-size:12px;margin-top:4px;">Biasanya karena koneksi internet terputus ' +
        'saat halaman dibuka. Muat ulang halaman dengan Ctrl+Shift+R. Seluruh bagian SIPUMA ' +
        'yang lain tetap berfungsi normal.</div>' +
      '</div>';
    return;
  }

  // Peta lama WAJIB dibongkar dulu. Leaflet menolak memakai ulang wadah
  // yang sudah pernah dipakai, dan kalau dibiarkan, berpindah tab lalu
  // kembali ke sini akan membuat petanya gagal tampil sama sekali.
  if (_petaUtama) { try { _petaUtama.remove(); } catch (e) {} _petaUtama = null; }

  _petaUtama = L.map('petaKanvas', petaOpsiDasar());
  petaLapisanDasar(_petaUtama);

  // Tampilan awal: seluruh Indonesia. Begitu ada titik, peta menyesuaikan
  // sendiri ke area titik-titiknya lewat terapkanSaringPeta() di bawah.
  _petaUtama.fitBounds(petaKotakIndonesia());

  _petaKlaster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 45,
    zoomToBoundsOnClick: false,     // ditangani sendiri di bawah
    // Titik yang persis satu alamat tetap bisa dipilih satu per satu:
    // kelompoknya mekar keluar seperti kelopak saat perbesaran mentok.
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 1.6
  });

  // Klik pada lingkaran kelompok: SELALU mendekat, tidak pernah menampilkan
  // daftar nama.
  //
  // Dua percobaan sebelumnya sama-sama keliru. Yang pertama memakai patokan
  // jumlah anggota, yang kedua memakai patokan jarak antartitik — dan
  // keduanya berakhir sama: pada kelompok yang rapat, klik justru membuka
  // daftar nama, padahal yang dicari pengguna adalah titik UMKM-nya.
  //
  // Satu-satunya patokan yang benar: apakah peta masih bisa diperbesar.
  //   • Masih bisa → perbesar. Dari pandangan nasional, langkah pertamanya
  //     berhenti di tingkat kota/kabupaten supaya seluruh anggota kelompok
  //     terlihat sekaligus; sesudah itu mendekat sampai titiknya terpisah.
  //   • Sudah mentok, titik-titiknya benar-benar di alamat yang sama →
  //     kelompoknya DIKEMBANGKAN: titik-titiknya mekar keluar seperti
  //     kelopak, masing-masing berdiri sendiri dan bisa diklik satu per
  //     satu. Tetap berupa titik UMKM, bukan daftar nama.
  _petaKlaster.on('clusterclick', function (e) {
    const kotak = e.layer.getBounds();
    const zoomKini = _petaUtama.getZoom();
    const zoomMaks = _petaUtama.getMaxZoom();

    // Masih ada ruang untuk mendekat?
    const adaJarak = kotak.isValid() &&
      ((kotak.getNorth() - kotak.getSouth()) > 0.000001 ||
       (kotak.getEast() - kotak.getWest()) > 0.000001);

    if (!adaJarak || zoomKini >= zoomMaks) {
      try { e.layer.spiderfy(); }
      catch (err) { console.warn('SIPUMA: gagal mengembangkan kelompok —', err); }
      return;
    }

    // Dari pandangan nasional, berhenti dulu di tingkat kota/kabupaten.
    // Sesudah itu bebas mendekat sampai perbesaran penuh.
    const batas = (zoomKini < PETA_ZOOM_WILAYAH) ? PETA_ZOOM_WILAYAH : zoomMaks;
    _petaUtama.flyToBounds(kotak, {
      duration: 0.6,
      padding: [50, 50],
      maxZoom: batas
    });
  });

  _petaUtama.addLayer(_petaKlaster);
  terapkanSaringPeta();

  [60, 300, 700].forEach(function (ms) {
    setTimeout(function () { try { _petaUtama.invalidateSize(); } catch (e) {} }, ms);
  });
}

/** Gambar ulang titik sesuai saringan yang sedang dipilih. */
function terapkanSaringPeta() {
  if (!_petaKlaster) return;
  const elS = document.getElementById('petaFilterSektor');
  const elT = document.getElementById('petaFilterStatus');
  const elC = document.getElementById('petaCari');
  _petaSaringSektor = elS ? elS.value : '';
  _petaSaringStatus = elT ? elT.value : '';
  _petaKataCari = elC ? elC.value.trim().toLowerCase() : '';

  const baris = (AppState.cache.umkm || []).filter(function (u) {
    if (!punyaTitik(u)) return false;
    if (_petaSaringSektor && u.SektorUsaha !== _petaSaringSektor) return false;
    if (_petaSaringStatus && (u.StatusAktif || 'Aktif') !== _petaSaringStatus) return false;
    if (_petaKataCari && String(u.NamaUMKM).toLowerCase().indexOf(_petaKataCari) === -1) return false;
    return true;
  });

  _petaKlaster.clearLayers();
  const penanda = baris.map(function (u) {
    const warna = petaWarnaSektor(u.SektorUsaha);
    const mati = (u.StatusAktif === 'Tidak Aktif');
    const ikon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:' + warna + ';' +
            'border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);' +
            (mati ? 'opacity:.45;' : '') + '"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    const m = L.marker([Number(u.Lat), Number(u.Lng)], { icon: ikon, title: u.NamaUMKM });
    m.optionsUmkm = u;
    m.bindPopup(isiPopupUMKM(u), { maxWidth: 280 });
    // Mendekat HANYA bila pandangan sedang jauh. Kalau pengguna sudah
    // berada di tingkat kelurahan, mengklik satu titik tidak lagi menyentak
    // petanya — popupnya saja yang terbuka, dan Leaflet menggeser sedikit
    // bila popup itu tertutup tepi layar. Dulu setiap klik selalu melompat
    // ke perbesaran penuh, dan menyusuri beberapa UMKM berdekatan jadi
    // terasa seperti dilempar bolak-balik.
    m.on('click', function () {
      if (_petaUtama.getZoom() < 13) {
        _petaUtama.flyTo([Number(u.Lat), Number(u.Lng)], 14, { duration: 0.6 });
      }
    });
    return m;
  });
  _petaKlaster.addLayers(penanda);

  const hitung = document.getElementById('petaJumlahTampil');
  if (hitung) hitung.textContent = baris.length;

  sorotHasilSaringan();
}

/**
 * Arahkan pandangan peta mengikuti saringan yang sedang dipilih.
 *
 *   • Ada saringan  → sorot wilayah yang memuat SELURUH UMKM yang cocok,
 *                     dibatasi sampai tingkat kota/kabupaten saja.
 *   • Tanpa saringan → kembali ke seluruh Indonesia.
 *
 * Perbesarannya sengaja dibatasi. Tanpa batas itu, menyaring satu sektor
 * yang kebetulan hanya punya satu UMKM akan melompat sampai ke tingkat
 * jalan — dan pengguna kehilangan gambaran wilayahnya sama sekali.
 *
 * Diberi jeda singkat supaya mengetik di kotak pencarian tidak membuat
 * peta bergerak-gerak pada setiap huruf; ia menunggu sampai pengetikannya
 * berhenti dulu.
 */
function sorotHasilSaringan() {
  if (_timerSorot) clearTimeout(_timerSorot);
  _timerSorot = setTimeout(function () {
    _timerSorot = null;
    if (!_petaUtama || !_petaKlaster) return;
    if (typeof AppState !== 'undefined' && AppState.currentSection !== 'petaUMKM') return;

    const adaSaringan = !!(_petaSaringSektor || _petaSaringStatus || _petaKataCari);
    if (!adaSaringan) { petaKembaliKeIndonesia(); return; }

    let kotak = null;
    try { kotak = _petaKlaster.getBounds(); } catch (e) { kotak = null; }
    if (!kotak || !kotak.isValid()) { petaKembaliKeIndonesia(); return; }

    try {
      _petaUtama.flyToBounds(kotak, {
        duration: 0.7,
        padding: [60, 60],
        maxZoom: PETA_ZOOM_WILAYAH
      });
    } catch (e) { /* biarkan pada tampilan sekarang */ }
  }, 350);
}

function isiPopupUMKM(u) {
  const wa = (typeof rapikanNomorWA === 'function') ? rapikanNomorWA(u.NoHP) : '';
  const rute = 'https://www.google.com/maps/dir/?api=1&destination=' +
               Number(u.Lat) + ',' + Number(u.Lng);
  const mati = (u.StatusAktif === 'Tidak Aktif');

  return '<div style="min-width:210px;">' +
    '<div style="font-weight:700;font-size:13.5px;">' + esc(u.NamaUMKM) + '</div>' +
    '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">' +
      esc(u.KodeUnik) + ' &middot; ' + esc(u.SektorUsaha || '-') +
      (mati ? ' &middot; <b style="color:#991B1B;">Tidak Aktif</b>' : '') + '</div>' +
    (u.Spesialisasi ? '<div style="font-size:12px;">' + esc(u.Spesialisasi) + '</div>' : '') +
    (u.AlamatUsaha ? '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' +
      '<i class="bi bi-geo-alt"></i> ' + esc(u.AlamatUsaha) + '</div>' : '') +
    '<div class="d-flex gap-2 mt-2" style="flex-wrap:wrap;">' +
      '<a class="btn btn-primary btn-sm" href="' + rute + '" target="_blank" rel="noopener">' +
        '<i class="bi bi-signpost-2"></i> Rute</a>' +
      (wa ? '<a class="btn btn-outline btn-sm" href="https://wa.me/' + wa + '" target="_blank" ' +
        'rel="noopener" style="color:#128C7E;border-color:#128C7E;">' +
        '<i class="bi bi-whatsapp"></i> WhatsApp</a>' : '') +
      (u.AlamatUsaha ? '<button class="btn btn-outline btn-sm" ' +
        'onclick="salinTeks(' + JSON.stringify(String(u.AlamatUsaha)).replace(/"/g, '&quot;') + ')">' +
        '<i class="bi bi-clipboard"></i> Salin Alamat</button>' : '') +
      '<button class="btn btn-outline btn-sm" onclick="bukaDetailUMKM(\'' + esc(u.KodeUnik) + '\')">' +
        '<i class="bi bi-info-circle"></i> Detail</button>' +
    '</div>' +
  '</div>';
}

/** Salin teks apa pun ke papan klip, dengan cadangan untuk peramban lama. */
function salinTeks(teks) {
  const selesai = function () { showToast('Disalin', 'Teks sudah disalin ke papan klip.', 'success'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(teks).then(selesai).catch(function () { salinCaraLama(teks, selesai); });
  } else {
    salinCaraLama(teks, selesai);
  }
}
function salinCaraLama(teks, selesai) {
  try {
    const ta = document.createElement('textarea');
    ta.value = teks;
    ta.style.cssText = 'position:fixed;top:-1000px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    selesai();
  } catch (e) {
    showToast('Gagal', 'Peramban ini tidak mengizinkan penyalinan otomatis.', 'warning');
  }
}

/**
 * Jendela ringkas sebuah UMKM. Dipakai dari peta, dan sengaja HANYA
 * MENAMPILKAN — tidak ada tombol ubah atau hapus di sini, supaya aman
 * dibuka oleh Stakeholder maupun Admin dengan kode yang sama.
 */
function bukaDetailUMKM(kodeUnik) {
  const u = (AppState.cache.umkm || []).find(function (x) { return x.KodeUnik === kodeUnik; });
  if (!u) { showToast('Tidak ditemukan', 'Data UMKM itu tidak ada di daftar.', 'warning'); return; }

  const wa = (typeof rapikanNomorWA === 'function') ? rapikanNomorWA(u.NoHP) : '';
  const adaTitik = punyaTitik(u);
  const baris = function (label, nilai) {
    return '<div class="grid grid-2" style="padding:7px 0;border-bottom:1px solid var(--border);">' +
      '<div style="font-size:12px;color:var(--text-muted);">' + label + '</div>' +
      '<div style="font-size:13px;font-weight:600;">' + (nilai || '-') + '</div></div>';
  };

  const isi =
    baris('Kode Unik', esc(u.KodeUnik)) +
    baris('Sektor Usaha', esc(u.SektorUsaha)) +
    baris('Spesialisasi', esc(u.Spesialisasi)) +
    baris('Alamat Usaha', esc(u.AlamatUsaha)) +
    baris('Nomor HP', esc(u.NoHP)) +
    baris('Status', esc(u.StatusAktif || 'Aktif')) +
    baris('Titik Lokasi', adaTitik
      ? (Number(u.Lat).toFixed(6) + ', ' + Number(u.Lng).toFixed(6))
      : '<span style="color:var(--madya-text);">Belum ditandai</span>');

  const footer =
    (adaTitik ? '<a class="btn btn-primary" target="_blank" rel="noopener" ' +
      'href="https://www.google.com/maps/dir/?api=1&destination=' +
      Number(u.Lat) + ',' + Number(u.Lng) + '"><i class="bi bi-signpost-2"></i> Rute</a>' : '') +
    (wa ? '<a class="btn btn-outline" target="_blank" rel="noopener" href="https://wa.me/' + wa + '" ' +
      'style="color:#128C7E;border-color:#128C7E;"><i class="bi bi-whatsapp"></i> WhatsApp</a>' : '') +
    '<button class="btn btn-outline" onclick="closeModal(\'modalGeneric\')">Tutup</button>';

  openFormModal('<i class="bi bi-shop"></i> ' + esc(u.NamaUMKM), isi, footer);
}
