// Kategori Laporan CSR.
//
// Sengaja TIDAK diletakkan di config.js: berkas itu menyimpan GAS_URL
// milik pemasang, jadi tidak boleh ikut dikirim saat ada pembaruan —
// menimpanya akan menghapus alamat server dan membuat aplikasi berhenti.
//
// Namanya DAFTAR_KATEGORI_LAPORAN, bukan KATEGORI_LAPORAN, supaya tidak
// bentrok dengan sisa deklarasi lama yang mungkin masih ada di config.js.
// Nama yang sama dideklarasikan dua kali membuat SELURUH berkas ini gagal
// dimuat — dan gejalanya menyesatkan: seluruh tab tampak "belum terpasang".
const DAFTAR_KATEGORI_LAPORAN = ['AP-AR & KPI', 'Hasil SROI', 'UMKM goes to Vendor', 'Lainnya'];

// ════════════════════════════════════════════════════════
// SELURUH HALAMAN SIPUMA (Admin / CSR UT / UMKM)
// ════════════════════════════════════════════════════════
// Logika di berkas ini dipindahkan langsung dari SIPUMA versi iframe yang
// sudah teruji penuh, agar perilaku setiap halaman tetap persis sama.
// Komunikasi ke server kini melewati lapisan penyesuai di compat.js
// (google.script.run & panggilServerAman → fetch ke REST API).
//
// Berkas ini SENGAJA tidak dipecah-pecah seperti dulu (JSPart1-13):
// pemecahan itu hanya diperlukan karena batasan Apps Script HtmlService.
// Di GitHub Pages tidak ada batasan tersebut.

function loadMasterUmkm() {
  // PENTING: pakai cache yang SUDAH ADA dulu (termasuk data awal yang
  // ditanam server saat halaman dimuat) — JANGAN paksa ambil ulang lewat
  // RPC setiap kali halaman ini dibuka. Refresh paksa hanya dilakukan
  // secara eksplisit setelah tambah/ubah/hapus data (lihat simpanUMKM,
  // hapusUMKM) lewat reloadMasterUmkmFresh().
  ensureUmkmCacheThen(() => renderMasterUmkm());
}
function reloadMasterUmkmFresh() {
  // Dipakai KHUSUS setelah tambah/ubah/hapus data UMKM — di sini kita
  // WAJIB ambil data terbaru dari server, cache lama tidak boleh dipakai.
  refreshUmkmCacheThen(() => renderMasterUmkm());
}

const MASTER_UMKM_PER_HALAMAN = 12;
function renderMasterUmkm(filterSektor) {
  const container = document.getElementById('app-container');
  if (filterSektor === undefined) filterSektor = '';

  container.innerHTML = `
    ${pageHeader('Manajemen Data', 'Data Master', 'UMKM', 'Kelola profil UMKM binaan: tambah, ubah, dan hapus data pada 4 sektor usaha.',
      `<div class="d-flex gap-2" style="flex-wrap:wrap;">${tombolEkspor('eksporDataMasterUMKM')}<button class="btn btn-primary" onclick="formUMKM()"><i class="bi bi-plus-lg"></i> Tambah UMKM</button></div>`)}
    <div class="table-card">
      <div class="table-toolbar">
        <div class="d-flex gap-2 align-center" style="flex-wrap:wrap;">
          <select class="form-select" id="masterUmkmFilterSektor" style="width:auto;height:34px;" onchange="renderMasterUmkmTabel(1)">
            <option value="">Semua Sektor</option>
            ${optionsHtml(SEKTOR_LIST, filterSektor)}
          </select>
          <select class="form-select" id="masterUmkmFilterStatus" style="width:auto;height:34px;" onchange="renderMasterUmkmTabel(1)">
            <option value="">Semua Status</option>
            <option value="aktif">Hanya Aktif</option>
            <option value="nonaktif">Hanya Tidak Aktif</option>
          </select>
          <div class="input-group-icon" style="width:220px;">
            <i class="bi bi-search"></i>
            <input type="text" class="form-control" id="masterUmkmCari" style="height:34px;" placeholder="Cari nama/kode UMKM..." oninput="renderMasterUmkmTabel(1)">
          </div>
          <span class="text-muted" style="font-size:12px;" id="masterUmkmJumlah"></span>
        </div>
      </div>
      <div id="masterUmkmTabelArea"></div>
    </div>
  `;
  // Bagian tabel dirender TERPISAH (lihat renderMasterUmkmTabel) — supaya
  // saat mengetik di kolom pencarian, HANYA isi tabel yang diperbarui,
  // BUKAN seluruh toolbar/kolom pencariannya. Kalau kolom pencarian ikut
  // dibangun ulang setiap ketikan, elemen <input>-nya benar-benar diganti
  // dengan yang baru, sehingga fokus kursor hilang dan pengguna harus
  // klik ulang setiap mengetik satu huruf.
  renderMasterUmkmTabel(1);
}

function renderMasterUmkmTabel(halaman) {
  const area = document.getElementById('masterUmkmTabelArea');
  if (!area) return;
  const filterSektor = document.getElementById('masterUmkmFilterSektor') ? document.getElementById('masterUmkmFilterSektor').value : '';
  const kataKunci = document.getElementById('masterUmkmCari') ? document.getElementById('masterUmkmCari').value : '';
  halaman = halaman || 1;

  // Urutkan dari UMKM yang PALING BARU dibina ke yang paling lama,
  // agar penambahan terbaru langsung terlihat di halaman pertama.
  let rows = (AppState.cache.umkm || []).slice().sort(function (a, b) {
    return new Date(b.TanggalBinaan || 0) - new Date(a.TanggalBinaan || 0);
  });
  if (filterSektor) rows = rows.filter(r => r.SektorUsaha === filterSektor);
  const fStatus = document.getElementById('masterUmkmFilterStatus') ? document.getElementById('masterUmkmFilterStatus').value : '';
  if (fStatus === 'aktif')    rows = rows.filter(u => umkmAktif(u));
  if (fStatus === 'nonaktif') rows = rows.filter(u => !umkmAktif(u));
  if (kataKunci && kataKunci.trim()) {
    const k = kataKunci.trim().toLowerCase();
    rows = rows.filter(r => String(r.NamaUMKM).toLowerCase().includes(k) || String(r.KodeUnik).toLowerCase().includes(k));
  }

  const totalHalaman = Math.max(1, Math.ceil(rows.length / MASTER_UMKM_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * MASTER_UMKM_PER_HALAMAN;
  const rowsHalamanIni = rows.slice(mulai, mulai + MASTER_UMKM_PER_HALAMAN);

  const jumlahEl = document.getElementById('masterUmkmJumlah');
  if (jumlahEl) jumlahEl.textContent = rows.length + ' UMKM';

  area.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Kode Unik</th><th>Nama UMKM</th><th>Sektor</th><th>Spesialisasi</th><th>WhatsApp</th><th>Binaan Sejak</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${rowsHalamanIni.length ? rowsHalamanIni.map(u => `
            <tr>
              <td><b>${esc(u.KodeUnik)}</b></td>
              <td>${esc(u.NamaUMKM)}</td>
              <td><span class="sector-tag">${esc(u.SektorUsaha)}</span></td>
              <td>${esc(u.Spesialisasi)}</td>
              <td>${u.NoHP
                ? `<a href="https://wa.me/${rapikanNomorWA(u.NoHP)}" target="_blank" style="font-size:12.5px;white-space:nowrap;"><i class="bi bi-whatsapp" style="color:#25D366;"></i> ${esc(u.NoHP)}</a>`
                : `<span class="text-muted" style="font-size:11.5px;">belum diisi</span>`}</td>
              <td>${formatBulanTahun(u.TanggalBinaan)}</td>
              <td>
                <span class="status-pill ${umkmAktif(u) ? 'allowed' : 'blocked'}"><span class="dot"></span>${umkmAktif(u) ? 'Aktif' : 'Tidak Aktif'}</span>
              </td>
              <td>
                <button class="action-icon-btn primary" title="Ubah" onclick='formUMKM(${JSON.stringify(u)})'><i class="bi bi-pencil"></i></button>
                <button class="action-icon-btn ${umkmAktif(u) ? 'danger' : ''}" title="${umkmAktif(u) ? 'Nonaktifkan' : 'Aktifkan'}" onclick="ubahStatusAktifUMKM('${u.KodeUnik}', ${umkmAktif(u) ? 'false' : 'true'})"><i class="bi bi-${umkmAktif(u) ? 'toggle-on' : 'toggle-off'}"></i></button>
                <button class="action-icon-btn danger" title="Hapus" onclick="hapusUMKM('${u.KodeUnik}')"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join('') : `<tr><td colspan="8"><div class="table-empty"><i class="bi bi-inbox"></i>${kataKunci ? 'Tidak ada UMKM yang cocok dengan pencarian.' : 'Belum ada data UMKM.'}</div></td></tr>`}
        </tbody>
      </table>
      </div>
      ${totalHalaman > 1 ? `
      <div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;padding:0 4px 4px;">
        ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderMasterUmkmTabel(${p})">${p}</button>`).join('')}
      </div>` : ''}
  `;
}

function formUMKM(data) {
  const isEdit = !!data;
  const tglBinaanDefault = isEdit && data.TanggalBinaan ? formatBulanTahunUntukInput(data.TanggalBinaan) : formatBulanTahunUntukInput(new Date());
  const body = `
    <input type="hidden" id="fUmkmKodeUnik" value="${isEdit ? data.KodeUnik : ''}">
    <div class="form-group"><label class="form-label">Nama UMKM</label><input class="form-control" id="fUmkmNama" value="${isEdit ? esc(data.NamaUMKM) : ''}" placeholder="Contoh: Dapoer Berkah Cakung" required></div>
    <div class="grid grid-2">
      <div class="form-group"><label class="form-label">Sektor Usaha</label>
        <select class="form-select" id="fUmkmSektor">${optionsHtml(SEKTOR_LIST, isEdit ? data.SektorUsaha : null)}</select>
      </div>
      <div class="form-group"><label class="form-label">Kode Unik</label><input class="form-control" value="${isEdit ? data.KodeUnik : 'Otomatis oleh sistem'}" disabled></div>
    </div>
    <div class="grid grid-2">
      <div class="form-group"><label class="form-label">Spesialisasi</label><input class="form-control" id="fUmkmSpesialisasi" value="${isEdit ? esc(data.Spesialisasi) : ''}" placeholder="Contoh: Nasi box & katering harian"></div>
      <div class="form-group"><label class="form-label">Dibina Sejak (Bulan & Tahun)</label><input type="month" class="form-control" id="fUmkmTglBinaan" value="${tglBinaanDefault}"></div>
    </div>
    <div class="form-group"><label class="form-label">Alamat Usaha</label><input class="form-control" id="fUmkmAlamat" value="${isEdit ? esc(data.AlamatUsaha) : ''}" placeholder="Contoh: Cakung, Jakarta Timur"></div>
    <div class="form-group"><label class="form-label">Nomor HP / WhatsApp</label>
      <input class="form-control" id="fUmkmNoHP" value="${isEdit ? esc(data.NoHP || '') : ''}" placeholder="Contoh: 081234567890">
      <div class="login-hint">Dipakai untuk mengirim pengingat legalitas lewat WhatsApp. Boleh diawali 0 atau 62.</div>
    </div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button>
    <button class="btn btn-primary" id="btnSimpanUmkm" onclick="simpanUMKM(${isEdit})"><i class="bi bi-save"></i> Simpan</button>`;
  openFormModal(isEdit ? 'Ubah Data UMKM' : 'Tambah UMKM Baru', body, footer);
}
// Khusus untuk kolom "Dibina Sejak" — cuma butuh Bulan & Tahun (format
// 'YYYY-MM', cocok dengan <input type="month">), tanggal hariannya
// diabaikan sepenuhnya (selalu dianggap tanggal 1 saat disimpan).

function simpanUMKM(isEdit) {
  const btn = document.getElementById('btnSimpanUmkm');
  const tglBinaanInput = document.getElementById('fUmkmTglBinaan').value;
  const data = {
    KodeUnik: document.getElementById('fUmkmKodeUnik').value,
    NamaUMKM: document.getElementById('fUmkmNama').value.trim(),
    SektorUsaha: document.getElementById('fUmkmSektor').value,
    Spesialisasi: document.getElementById('fUmkmSpesialisasi').value.trim(),
    AlamatUsaha: document.getElementById('fUmkmAlamat').value.trim(),
    NoHP: document.getElementById('fUmkmNoHP').value.trim(),
    // PENTING: kirim sebagai TEKS ('YYYY-MM', format Bulan & Tahun saja —
    // dari <input type="month">), BUKAN objek Date() langsung. Terbukti
    // dari error "Failed due to illegal value in property: TanggalBinaan"
    // — google.script.run TIDAK BISA mengirim objek Date sebagai properti
    // di dalam objek argumen (exception ini terjadi SAAT PENGIRIMAN,
    // sebelum sempat sampai ke server, dan tidak pernah tertangkap oleh
    // withFailureHandler — makanya tombol Simpan macet selamanya tanpa
    // pesan apa pun). Server akan mengubahnya jadi tanggal (tanggal 1 di
    // bulan tersebut) sebelum ditulis ke sheet.
    TanggalBinaan: tglBinaanInput || formatBulanTahunUntukInput(new Date())
  };
  if (!data.NamaUMKM) { showToast('Peringatan', 'Nama UMKM wajib diisi.', 'warning'); return; }
  setBtnLoading(btn);
  // DISENGAJAKAN SEDERHANA: SATU panggilan langsung ke server, TANPA lapisan
  // retry/verifikasi/single-flight yang rumit. Akar masalah asli (bug
  // serialisasi Date di Apps Script) SUDAH diperbaiki permanen di server
  // (getDaftarUMKM, addUMKM, dll sekarang mengirim data sebagai string
  // JSON) — jadi mekanisme "jaring pengaman" berlapis yang dulu dipasang
  // untuk menyiasati bug itu JUSTRU jadi sumber masalah baru (saling
  // tumpang tindih, perulangan tanpa henti). Kembali ke pola paling
  // sederhana: satu permintaan, satu jawaban, selesai.
  const fn = isEdit ? 'updateUMKM' : 'addUMKM';
  google.script.run
    .withSuccessHandler((res) => {
      resetBtn(btn);
      if (!res) {
        showToast('Tidak Jelas', 'Server tidak memberi jawaban yang jelas. Silakan tutup form ini, refresh halaman (F5), lalu periksa apakah "' + data.NamaUMKM + '" sudah tersimpan atau belum.', 'warning');
        return;
      }
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        closeModal('modalGeneric');
        if (!AppState.cache.umkm) AppState.cache.umkm = [];
        if (isEdit) {
          const idx = AppState.cache.umkm.findIndex(u => u.KodeUnik === data.KodeUnik);
          if (idx > -1) Object.assign(AppState.cache.umkm[idx], data);
        } else {
          const kodeBaru = res.data && res.data.kodeUnik ? res.data.kodeUnik : data.KodeUnik;
          AppState.cache.umkm.push({
            ID: res.data && res.data.id ? res.data.id : '',
            NamaUMKM: data.NamaUMKM, KodeUnik: kodeBaru, SektorUsaha: data.SektorUsaha,
            Spesialisasi: data.Spesialisasi, AlamatUsaha: data.AlamatUsaha,
            // NoHP & StatusAktif WAJIB ikut. Sebelumnya terlewat, sehingga
            // datanya tersimpan di server tetapi hilang dari tampilan —
            // membuat nomor HP tampak "tidak tersimpan" padahal ada.
            NoHP: data.NoHP || '', StatusAktif: 'Aktif',
            TanggalBinaan: data.TanggalBinaan, FotoURL: '', TerakhirUpdate: new Date()
          });
          if (AppState.cache.users) {
            AppState.cache.users.push({
              Username: data.NamaUMKM, KodeUnik: kodeBaru, Role: 'UMKM', IDUMKM: kodeBaru,
              StatusAksesLogin: 'Allowed', AlasanPemblokiran: '', StatusAktif: true,
              TanggalDibuat: new Date(), TanggalPerubahanAkses: new Date(),
              Catatan: 'Dibuat otomatis saat pendaftaran UMKM', FotoURL: '', Alamat: data.AlamatUsaha || ''
            });
          }
        }
        if (AppState.currentSection === 'masterUmkm') renderMasterUmkm();
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    })
    .withFailureHandler((err) => {
      resetBtn(btn);
      showToast('Error', (err && err.message) ? err.message : 'Terjadi kesalahan saat menghubungi server. Silakan coba lagi.', 'danger');
    })
    [fn](data);
}

function hapusUMKM(kodeUnik) {
  showConfirm('Data UMKM "' + kodeUnik + '" beserta SELURUH riwayat terkait (Omset, Tenaga Kerja, Kemandirian, Fasilitasi, Prestasi, dan akun login) akan dihapus permanen. Lanjutkan?', () => {
    panggilServerAman('deleteUMKM', [kodeUnik], (res) => {
      closeModal('modalConfirm');
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        // Bersihkan SEMUA cache lokal yang terkait UMKM ini — bukan cuma
        // daftar UMKM-nya saja, tapi juga seluruh riwayat yang ditanam di
        // cache lain, supaya konsisten dengan penghapusan cascade di server.
        if (AppState.cache.umkm) AppState.cache.umkm = AppState.cache.umkm.filter(u => u.KodeUnik !== kodeUnik);
        if (AppState.cache.omsetAll) AppState.cache.omsetAll = AppState.cache.omsetAll.filter(r => r.IDUMKM !== kodeUnik);
        if (AppState.cache.tenagaKerjaAll) AppState.cache.tenagaKerjaAll = AppState.cache.tenagaKerjaAll.filter(r => r.IDUMKM !== kodeUnik);
        if (AppState.cache.kemandirianAll) AppState.cache.kemandirianAll = AppState.cache.kemandirianAll.filter(r => r.IDUMKM !== kodeUnik);
        if (AppState.cache.kemandirianPerUmkm) delete AppState.cache.kemandirianPerUmkm[kodeUnik];
        if (AppState.cache.fasilitasi) AppState.cache.fasilitasi = AppState.cache.fasilitasi.filter(r => r.IDUMKM !== kodeUnik);
        if (AppState.cache.prestasi) AppState.cache.prestasi = AppState.cache.prestasi.filter(r => r.IDUMKM !== kodeUnik);
        if (AppState.currentSection === 'masterUmkm') renderMasterUmkm();
      }
      else showToast('Gagal', res.message, 'danger');
    }, () => {
      closeModal('modalConfirm');
      showToast('Error', 'Gagal menghapus UMKM setelah beberapa percobaan. Silakan coba lagi.', 'danger');
    });
  }, 'Ya, Hapus');
}


// ════════════════════════════════════════════════════════
// KOMPONEN: DROPDOWN UMKM BISA DICARI (searchable select)
// ════════════════════════════════════════════════════════
// Pengganti <select> biasa untuk memilih UMKM — pengguna bisa mengetik
// nama UMKM untuk menyaring daftar, alih-alih men-scroll dropdown panjang.
// Dipakai di: Input Omset, Input Tenaga Kerja, Asesmen Kemandirian,
// Catat Fasilitasi Pemasaran, Tambah/Ubah Catatan Prestasi.
//
// PENTING soal kompatibilitas: elemen dengan id={id} yang dihasilkan adalah
// <input type="hidden"> (BUKAN <select>) — tapi tetap punya properti
// `.value` yang bisa dibaca persis sama seperti `<select>.value` di semua
// kode yang sudah ada (document.getElementById(id).value). Jadi TIDAK ADA
// kode lain yang perlu diubah selain baris yang membuat elemennya.
// Tutup daftar dropdown kalau pengguna klik di luar area dropdown-nya.



// ════════════════════════════════════════════════════════
// HELPER UMUM: PANGGIL SERVER DENGAN PROTEKSI PENUH
// ════════════════════════════════════════════════════════
// Dipakai di SEMUA modul (bukan cuma UMKM) untuk melindungi dari 2 masalah
// yang terbukti nyata di lingkungan Apps Script tertentu:
// 1) Panggilan macet tanpa respons sama sekali (timeout manual, tidak
//    bergantung pada withFailureHandler yang kadang tidak pernah terpicu).
// 2) withSuccessHandler terpanggil tapi nilainya literally `null` (bukan
//    objek respons normal) — dianggap KEGAGALAN yang perlu dicoba ulang,
//    BUKAN "berhasil tapi kosong".


// Timeout MANUAL (bukan withFailureHandler) — beberapa error internal Google
// terbukti "Uncaught" dan TIDAK PERNAH memicu withSuccessHandler ATAUPUN
// withFailureHandler sama sekali (macet total secara diam-diam). Timer
// murni JavaScript ini tidak bergantung pada mekanisme Google yang kadang
// gagal itu, sehingga tetap bisa memicu percobaan ulang walau errornya
// tidak pernah "sampai" ke kode kita.


// ════════════════════════════════════════════════════════
// MODUL: OMSET — ADMIN (pilih UMKM manapun)
// ════════════════════════════════════════════════════════
function loadOmsetAdmin() {
  ensureUmkmCacheThen(() => renderOmsetForm('Admin', AppState.cache.umkm[0] ? AppState.cache.umkm[0].KodeUnik : ''));
}
function loadOmsetUmkm() {
  renderOmsetForm('UMKM', AppState.session.idUmkm);
}

function renderOmsetForm(role, kodeUmkm) {
  const container = document.getElementById('app-container');
  const tahun = AppState.config.tahunAktif || new Date().getFullYear();
  container.innerHTML = `
    ${pageHeader('Pelaporan Berkala', role === 'Admin' ? 'Input & Monitoring' : 'Update', 'Omset',
      role === 'Admin' ? 'Pilih UMKM dan catat realisasi omset bulanan beserta target tahunan.' : 'Catat realisasi omset bulanan Anda dan pantau capaian terhadap target tahunan.', '')}
    <div class="panel mb-4">
      <div class="grid grid-2 mb-3">
        ${role === 'Admin' ? `
        <div class="form-group mb-0"><label class="form-label">Pilih UMKM</label>
          ${dropdownUmkmCari('omsetUmkmSelect', kodeUmkm, "renderOmsetForm('Admin', document.getElementById('omsetUmkmSelect').value)")}
        </div>` : `<div></div>`}
        <div class="form-group mb-0"><label class="form-label">Tahun</label>
          <select class="form-select" id="omsetTahunSelect" onchange="gantiTahunOmset('${role}')">${optionsHtml([2025,2026,2027], tahun)}</select>
        </div>
      </div>
      <div id="omsetFormArea"><div class="loading-inline"><div class="spinner"></div></div></div>
    </div>
    ${spandukUmkmNonaktif(kodeUmkm)}
        <div id="closingOmsetArea"></div>
    ${role === 'Admin' ? `
    <div class="panel">
      <div class="flex-between" style="flex-wrap:wrap;gap:8px;"><div class="panel-title mb-0">Rekap Omset Seluruh UMKM</div>${tombolEkspor('eksporRekapOmset')}</div>
      <div class="text-muted mb-3" style="font-size:12px;">Kolom Target Omset diisi mandiri oleh masing-masing UMKM lewat dashboard omset mereka (wajib diisi sekali per tahun).</div>
      <div id="rekapOmsetArea" class="mt-2"><div class="loading-inline"><div class="spinner"></div></div></div>
    </div>` : `
    <div class="panel">
      <div class="panel-title">Riwayat Tahunan Omset Saya</div>
      <div class="text-muted mb-3" style="font-size:12px;">Rekap omset per tahun sebagai acuan perkembangan usaha Anda dari tahun ke tahun. Anda dapat menghapus riwayat tahun tertentu kalau diperlukan.</div>
      <div id="riwayatOmsetArea" class="mt-2"><div class="loading-inline"><div class="spinner"></div></div></div>
    </div>`}
  `;
  muatFormOmset(kodeUmkm, tahun);
  muatPanelClosing(kodeUmkm, tahun, 'Omset', 'closingOmsetArea');
  if (role === 'Admin') muatRekapOmset(tahun, 1);
  else muatRiwayatTahunanOmset(kodeUmkm);
}

function muatRiwayatTahunanOmset(kodeUmkm) {
  const sec = AppState.currentSection;
  const area = document.getElementById('riwayatOmsetArea');
  if (!area) return;
  if (AppState.cache.omsetAll) { renderRiwayatTahunanOmset(kodeUmkm); return; }
  // Pengguna UMKM memakai action khusus yang HANYA mengembalikan data
  // usahanya sendiri. getAllOmset sengaja tidak dibuka untuk peran UMKM,
  // karena isinya omset SELURUH UMKM binaan.
  const aksi = AppState.session.role === 'UMKM' ? 'getRiwayatOmsetUMKM' : 'getAllOmset';
  const argumen = AppState.session.role === 'UMKM' ? [AppState.session.idUmkm] : [];
  panggilServerAman(aksi, argumen, (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.omsetAll = res.success ? parseJsonAman(res.data, []) : [];
    renderRiwayatTahunanOmset(kodeUmkm);
  }, () => {
    if (AppState.currentSection !== sec) return;
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat riwayat. <button class="btn btn-outline btn-sm mt-2" onclick="muatRiwayatTahunanOmset('${kodeUmkm}')">Coba Lagi</button></div>`;
  });
}

function renderRiwayatTahunanOmset(kodeUmkm) {
  const area = document.getElementById('riwayatOmsetArea');
  if (!area) return;
  const rows = (AppState.cache.omsetAll || []).filter(r => r.IDUMKM === kodeUmkm).sort((a, b) => Number(b.Tahun) - Number(a.Tahun));
  area.innerHTML = `
    <div class="table-card">
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Tahun</th><th>Omset (YTD)</th><th>Target Omset</th><th>Persentase Capaian</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map(r => {
          const target = Number(r.TargetOmsetTahunan) || 0;
          const realisasi = Number(r.TotalRealisasi) || 0;
          const persen = target > 0 ? Math.round((realisasi / target) * 1000) / 10 : 0;
          return `
          <tr>
            <td><b>${r.Tahun}</b></td>
            <td>${formatRupiahFull(realisasi)}</td>
            <td>${target > 0 ? formatRupiahFull(target) : `<span class="text-muted" style="font-style:italic;">Belum diisi</span>`}</td>
            <td>${target > 0 ? `<span class="status-pill ${persen >= 100 ? 'tercapai' : 'belumtercapai'}"><span class="dot"></span>${persen}%</span>` : '-'}</td>
            <td><button class="action-icon-btn danger" title="Hapus riwayat tahun ini" onclick="hapusRiwayatOmset('${kodeUmkm}', ${r.Tahun})"><i class="bi bi-trash"></i></button></td>
          </tr>`;
        }).join('') : `<tr><td colspan="5"><div class="table-empty"><i class="bi bi-inbox"></i>Belum ada riwayat omset tahun sebelumnya.</div></td></tr>`}</tbody>
      </table>
      </div>
    </div>
  `;
}

function hapusRiwayatOmset(kodeUmkm, tahun) {
  showConfirm('Hapus riwayat omset tahun ' + tahun + ' secara permanen? Data ini tidak dapat dikembalikan.', () => {
    panggilServerAman('deleteOmset', [kodeUmkm, tahun], (res) => {
      closeModal('modalConfirm');
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        if (AppState.cache.omsetAll) {
          AppState.cache.omsetAll = AppState.cache.omsetAll.filter(r => !(r.IDUMKM === kodeUmkm && Number(r.Tahun) === Number(tahun)));
        }
        renderRiwayatTahunanOmset(kodeUmkm);
        // Kalau tahun yang dihapus adalah tahun yang sedang tampil di form
        // input, muat ulang form itu juga supaya datanya konsisten (kembali
        // ke kosong kalau memang tahun aktif yang dihapus).
        const tahunAktifDropdown = document.getElementById('omsetTahunSelect');
        if (tahunAktifDropdown && Number(tahunAktifDropdown.value) === Number(tahun)) muatFormOmset(kodeUmkm, tahun);
      } else showToast('Gagal', res.message, 'danger');
    }, () => {
      closeModal('modalConfirm');
      showToast('Error', 'Gagal menghapus setelah beberapa percobaan. Silakan coba lagi.', 'danger');
    });
  }, 'Ya, Hapus');
}

function gantiTahunOmset(role) {
  const kodeUmkm = role === 'Admin' ? document.getElementById('omsetUmkmSelect').value : AppState.session.idUmkm;
  const tahun = document.getElementById('omsetTahunSelect').value;
  muatFormOmset(kodeUmkm, tahun);
  // Status closing berbeda per tahun — panelnya wajib ikut diperbarui,
  // kalau tidak statusnya akan tertinggal di tahun sebelumnya.
  muatPanelClosing(kodeUmkm, tahun, 'Omset', 'closingOmsetArea');
  if (role === 'Admin') muatRekapOmset(tahun, 1);
}

// ── Rekap Omset seluruh UMKM (dengan paginasi 10/halaman) ──
const REKAP_OMSET_PER_HALAMAN = 10;
function muatRekapOmset(tahun, halaman) {
  const sec = AppState.currentSection;
  const area = document.getElementById('rekapOmsetArea');
  if (!area) return;
  if (AppState.cache.omsetAll) { renderRekapOmset(tahun, halaman); return; }
  panggilServerAman('getAllOmset', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.omsetAll = res.success ? parseJsonAman(res.data, []) : [];
    renderRekapOmset(tahun, halaman);
  }, () => {
    if (AppState.currentSection !== sec) return;
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat rekap. <button class="btn btn-outline btn-sm mt-2" onclick="muatRekapOmset(${tahun}, 1)">Coba Lagi</button></div>`;
  });
}
function renderRekapOmset(tahun, halaman) {
  const area = document.getElementById('rekapOmsetArea');
  if (!area) return;
  const semuaUmkm = AppState.cache.umkm || [];
  const omsetTahunIni = (AppState.cache.omsetAll || []).filter(o => Number(o.Tahun) === Number(tahun));
  const gabungan = semuaUmkm.map(u => {
    const o = omsetTahunIni.find(x => x.IDUMKM === u.KodeUnik);
    const target = o ? Number(o.TargetOmsetTahunan) || 0 : 0;
    const realisasi = o ? Number(o.TotalRealisasi) || 0 : 0;
    const persen = target > 0 ? Math.round((realisasi / target) * 1000) / 10 : 0;
    // Bulan terakhir yang diisi = bulan TERAKHIR yang nilainya di atas nol.
    // Ditelusuri mundur dari Desember agar bulan kosong di tengah tahun
    // tidak dianggap sebagai akhir pengisian.
    let bulanTerakhir = '';
    if (o) {
      for (let i = BULAN_LIST.length - 1; i >= 0; i--) {
        if ((Number(o[BULAN_LIST[i]]) || 0) > 0) { bulanTerakhir = BULAN_LIST[i]; break; }
      }
    }
    return { NamaUMKM: u.NamaUMKM, KodeUnik: u.KodeUnik, target, realisasi, persen,
             bulanTerakhir, sudahIsiTarget: !!(o && target > 0) };
  }).sort((a, b) => b.realisasi - a.realisasi);

  const totalHalaman = Math.max(1, Math.ceil(gabungan.length / REKAP_OMSET_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * REKAP_OMSET_PER_HALAMAN;
  const rows = gabungan.slice(mulai, mulai + REKAP_OMSET_PER_HALAMAN);

  area.innerHTML = `
    <div class="table-card">
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Nama UMKM</th><th>Target Omset</th><th>Total Omset (YTD)</th><th>Persentase Pencapaian</th><th>Terakhir Input</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td><b>${esc(r.NamaUMKM)}</b></td>
            <td>${r.sudahIsiTarget ? formatRupiahFull(r.target) : `<span class="text-muted" style="font-style:italic;">Belum diisi UMKM</span>`}</td>
            <td>${formatRupiahFull(r.realisasi)}</td>
            <td>${r.sudahIsiTarget ? `<span class="status-pill ${r.persen >= 100 ? 'tercapai' : 'belumtercapai'}"><span class="dot"></span>${r.persen}%</span>` : '-'}</td>
            <td>${r.bulanTerakhir
              ? `<b>${esc(r.bulanTerakhir)}</b>`
              : `<span class="text-muted" style="font-style:italic;font-size:11.5px;">Belum ada</span>`}</td>
          </tr>`).join('') : `<tr><td colspan="5"><div class="table-empty"><i class="bi bi-inbox"></i>Belum ada data UMKM.</div></td></tr>`}</tbody>
      </table>
      </div>
    </div>
    ${totalHalaman > 1 ? `
    <div class="d-flex gap-2 mt-2" style="flex-wrap:wrap;">
      ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderRekapOmset(${tahun}, ${p})">${p}</button>`).join('')}
    </div>` : ''}
  `;
}

function muatFormOmset(kodeUmkm, tahun) {
  const area = document.getElementById('omsetFormArea');
  panggilServerAman('getOmsetUMKM', [kodeUmkm, tahun], (res) => {
    const d = res.success ? res.data : null;
    const target = d ? d.TargetOmsetTahunan : 0;
    // UMKM boleh isi Target Omset HANYA SEKALI per tahun — begitu sudah
    // terisi (>0), kolom terkunci sampai tahun berikutnya (record omset
    // baru per tahun otomatis mulai dari target kosong lagi). Admin/PIC
    // selalu bisa mengisi/mengubahnya kapan saja sebagai override.
    const targetSudahTerisi = Number(target) > 0;
    const umkmTerkunci = AppState.session.role === 'UMKM' && targetSudahTerisi;
    area.innerHTML = `
      <div class="form-group"><label class="form-label">Target Omset Tahunan (Rp) ${umkmTerkunci ? '<span class="text-muted">(sudah diisi — tidak dapat diubah sampai tahun berikutnya)</span>' : (AppState.session.role === 'UMKM' ? '<span class="text-muted">(wajib diisi sekali untuk tahun ini)</span>' : '')}</label>
        <input type="number" class="form-control" id="omsetTarget" value="${target || ''}" placeholder="180000000" ${umkmTerkunci ? 'disabled' : ''}></div>
      <div class="grid grid-3" id="omsetMonthsGrid">
        ${BULAN_LIST.map(b => `
          <div class="form-group"><label class="form-label">${b}</label>
            <input type="number" min="0" class="form-control omset-month" data-bulan="${b}" value="${d ? (d[b] || 0) : 0}"></div>
        `).join('')}
      </div>
      <div class="flex-between" style="border-top:1px solid var(--border-color);padding-top:14px;margin-top:6px;">
        <div class="text-muted" style="font-size:12.5px;">Total Realisasi: <b style="color:var(--text-primary)">${formatRupiahFull(d ? d.TotalRealisasi : 0)}</b> ${d ? `<span class="status-pill ${d.StatusTarget === 'Tercapai' ? 'tercapai' : 'belumtercapai'}" style="margin-left:6px;"><span class="dot"></span>${d.StatusTarget}</span>` : ''}</div>
        <button class="btn btn-primary" id="btnSimpanOmset" onclick="simpanOmset('${kodeUmkm}', ${tahun})"><i class="bi bi-save"></i> Simpan Omset</button>
      </div>
    `;
  }, () => {
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat data omset. <button class="btn btn-outline btn-sm mt-2" onclick="muatFormOmset('${kodeUmkm}', ${tahun})">Coba Lagi</button></div>`;
  });
}

function simpanOmset(kodeUmkm, tahun) {
  const btn = document.getElementById('btnSimpanOmset');
  const umkmObj = (AppState.cache.umkm || []).find(u => u.KodeUnik === kodeUmkm) || AppState.session.profil;
  const record = { IDUMKM: kodeUmkm, NamaUMKM: umkmObj ? umkmObj.NamaUMKM : '', Tahun: Number(tahun) };
  if (AppState.session.role !== 'UMKM') record.TargetOmsetTahunan = Number(document.getElementById('omsetTarget').value) || 0;
  document.querySelectorAll('.omset-month').forEach(inp => { record[inp.dataset.bulan] = Number(inp.value) || 0; });
  if (record.TargetOmsetTahunan === undefined) {
    const targetInput = document.getElementById('omsetTarget');
    record.TargetOmsetTahunan = Number(targetInput.value) || 0;
  }
  function perbaruiCacheRekap(dataLengkap) {
    if (!AppState.cache.omsetAll) AppState.cache.omsetAll = [];
    const idx = AppState.cache.omsetAll.findIndex(o => o.IDUMKM === kodeUmkm && Number(o.Tahun) === Number(tahun));
    if (idx > -1) Object.assign(AppState.cache.omsetAll[idx], dataLengkap);
    else AppState.cache.omsetAll.push(dataLengkap);
    const rekapArea = document.getElementById('rekapOmsetArea');
    if (rekapArea) renderRekapOmset(tahun, 1);
    const riwayatArea = document.getElementById('riwayatOmsetArea');
    if (riwayatArea) renderRiwayatTahunanOmset(kodeUmkm);
    // Target baru saja terisi (UMKM) — kunci langsung field-nya tanpa perlu
    // memuat ulang lewat server (data yang kita punya sudah lengkap).
    if (AppState.session.role === 'UMKM' && Number(dataLengkap.TargetOmsetTahunan) > 0) {
      const targetInput = document.getElementById('omsetTarget');
      if (targetInput) {
        targetInput.disabled = true;
        const label = targetInput.previousElementSibling;
        if (label) {
          const spanLama = label.querySelector('span');
          if (spanLama) spanLama.remove();
          label.insertAdjacentHTML('beforeend', ' <span class="text-muted">(sudah diisi — tidak dapat diubah sampai tahun berikutnya)</span>');
        }
      }
    }
  }
  setBtnLoading(btn);
  panggilServerAman('saveOmset', [record], (res) => {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      // Pakai data hasil simpan LANGSUNG (server sudah kembalikan TotalRealisasi
      // & StatusTarget terhitung) — tidak perlu fetch ulang ke server.
      const area = document.getElementById('omsetFormArea');
      if (area) {
        const d = res.data;
        document.getElementById('omsetTarget').value = d.TargetOmsetTahunan || '';
        document.querySelectorAll('.omset-month').forEach(inp => { inp.value = d[inp.dataset.bulan] || 0; });
        const infoEl = area.querySelector('.text-muted');
        if (infoEl) infoEl.innerHTML = `Total Realisasi: <b style="color:var(--text-primary)">${formatRupiahFull(d.TotalRealisasi)}</b> <span class="status-pill ${d.StatusTarget === 'Tercapai' ? 'tercapai' : 'belumtercapai'}" style="margin-left:6px;"><span class="dot"></span>${d.StatusTarget}</span>`;
      }
      perbaruiCacheRekap(res.data);
    }
    else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    // JANGAN verifikasi via server lagi (kanal yang sama kemungkinan besar
    // juga akan gagal membaca). Hitung sendiri di browser dan perbarui
    // tampilan secara optimis — penyimpanan di server hampir selalu
    // sebenarnya berhasil walau konfirmasinya hilang di jalan.
    let total = 0;
    BULAN_LIST.forEach(b => { total += Number(record[b]) || 0; });
    const target = Number(record.TargetOmsetTahunan) || 0;
    const statusTarget = (target > 0 && total >= target) ? 'Tercapai' : 'Belum Tercapai';
    showToast('Kemungkinan Tersimpan', 'Server tidak memberi konfirmasi (gangguan koneksi), tapi data biasanya tetap tersimpan. Tampilan sudah diperbarui — silakan cek lagi nanti untuk memastikan.', 'warning');
    const area = document.getElementById('omsetFormArea');
    if (area) {
      const infoEl = area.querySelector('.text-muted');
      if (infoEl) infoEl.innerHTML = `Total Realisasi: <b style="color:var(--text-primary)">${formatRupiahFull(total)}</b> <span class="status-pill ${statusTarget === 'Tercapai' ? 'tercapai' : 'belumtercapai'}" style="margin-left:6px;"><span class="dot"></span>${statusTarget}</span>`;
    }
    perbaruiCacheRekap(Object.assign({}, record, { TotalRealisasi: total, StatusTarget: statusTarget }));
  });
}


// ════════════════════════════════════════════════════════
// MODUL: TENAGA KERJA
// ════════════════════════════════════════════════════════
function loadTenagaKerjaAdmin() { ensureUmkmCacheThen(() => renderTenagaKerjaForm('Admin', AppState.cache.umkm[0] ? AppState.cache.umkm[0].KodeUnik : '')); }
function loadTenagaKerjaUmkm() { renderTenagaKerjaForm('UMKM', AppState.session.idUmkm); }

function renderTenagaKerjaForm(role, kodeUmkm) {
  const container = document.getElementById('app-container');
  const tahun = AppState.config.tahunAktif || new Date().getFullYear();
  container.innerHTML = `
    ${pageHeader('Pelaporan Berkala', role === 'Admin' ? 'Input' : 'Update', 'Tenaga Kerja',
      'Catat jumlah tenaga kerja/karyawan setiap bulan untuk memantau penyerapan tenaga kerja lokal.', '')}
    <div class="grid grid-1-2">
      <div class="panel">
        <div class="panel-title mb-3">Form Input</div>
        ${role === 'Admin' ? `<div class="form-group"><label class="form-label">Pilih UMKM</label>${dropdownUmkmCari('tkUmkmSelect', kodeUmkm, "renderTenagaKerjaForm('Admin', document.getElementById('tkUmkmSelect').value)")}</div>` : ''}
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">Bulan</label><select class="form-select" id="tkBulan">${optionsHtml(BULAN_LIST)}</select></div>
          <div class="form-group"><label class="form-label">Tahun</label><select class="form-select" id="tkTahun" onchange="muatPanelClosing('${kodeUmkm}', this.value, 'TenagaKerja', 'closingTkArea'); muatTabelTenagaKerja('${kodeUmkm}', this.value);">${optionsHtml([2025,2026,2027], tahun)}</select></div>
        </div>
        <div class="form-group"><label class="form-label">Jumlah Tenaga Kerja</label><input type="number" min="0" class="form-control" id="tkJumlah" placeholder="Contoh: 6"></div>
        <div class="form-group"><label class="form-label">Catatan (opsional)</label><textarea class="form-control" id="tkCatatan" placeholder="Contoh: +2 karyawan baru warga RW 04"></textarea></div>
        <button class="btn btn-primary btn-block" id="btnSimpanTk" onclick="simpanTenagaKerja('${kodeUmkm}')"><i class="bi bi-save"></i> Simpan Data Tenaga Kerja</button>
        ${spandukUmkmNonaktif(kodeUmkm)}
        <div id="closingTkArea"></div>
      </div>
      <div class="table-card">
        <div class="table-toolbar"><span class="panel-title mb-0" style="font-size:14px;">Riwayat Tenaga Kerja</span></div>
        <div id="tkTableArea"><div class="loading-inline"><div class="spinner"></div></div></div>
      </div>
    </div>
    ${role === 'Admin' ? `
    <div class="panel mt-4">
      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">
        <div class="panel-title mb-0">Rekap Tenaga Kerja Seluruh UMKM</div>${tombolEkspor('eksporRekapTenagaKerja')}
        <select class="form-select" id="rekapTkFilterSektor" style="width:auto;min-width:160px;" onchange="renderRekapTenagaKerja(1)">
          <option value="">Semua Sektor</option>
          ${optionsHtml(SEKTOR_LIST, null)}
        </select>
      </div>
      <div class="text-muted mb-3" style="font-size:12px;">Menampilkan jumlah tenaga kerja pada bulan TERAKHIR yang diinput oleh masing-masing UMKM.</div>
      <div id="rekapTkArea" class="mt-2"><div class="loading-inline"><div class="spinner"></div></div></div>
    </div>` : ''}
  `;
  muatTabelTenagaKerja(kodeUmkm, tahun);
  muatPanelClosing(kodeUmkm, tahun, 'TenagaKerja', 'closingTkArea');
  if (role === 'Admin') muatRekapTenagaKerja(1);
}

function muatRekapTenagaKerja(halaman) {
  const sec = AppState.currentSection;
  const area = document.getElementById('rekapTkArea');
  if (!area) return;
  if (AppState.cache.tenagaKerjaAll) { renderRekapTenagaKerja(halaman); return; }
  panggilServerAman('getAllTenagaKerja', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.tenagaKerjaAll = res.success ? parseJsonAman(res.data, []) : [];
    renderRekapTenagaKerja(halaman);
  }, () => {
    if (AppState.currentSection !== sec) return;
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat rekap. <button class="btn btn-outline btn-sm mt-2" onclick="AppState.cache.tenagaKerjaAll=null;muatRekapTenagaKerja(1)">Coba Lagi</button></div>`;
  });
}

const REKAP_TK_PER_HALAMAN = 10;
function renderRekapTenagaKerja(halaman) {
  const area = document.getElementById('rekapTkArea');
  if (!area) return;
  const filterSektor = document.getElementById('rekapTkFilterSektor') ? document.getElementById('rekapTkFilterSektor').value : '';
  const semuaUmkm = (AppState.cache.umkm || []).filter(u => !filterSektor || u.SektorUsaha === filterSektor);
  const semuaTk = AppState.cache.tenagaKerjaAll || [];

  const gabungan = semuaUmkm.map(u => {
    // Cari entri PALING BARU (bulan-tahun terdekat dengan sekarang) untuk
    // UMKM ini, dari SELURUH riwayat (bukan cuma tahun berjalan).
    const milikUmkm = semuaTk.filter(t => t.IDUMKM === u.KodeUnik);
    let terbaru = null;
    milikUmkm.forEach(t => {
      if (!terbaru) { terbaru = t; return; }
      if (Number(t.Tahun) > Number(terbaru.Tahun) ||
        (Number(t.Tahun) === Number(terbaru.Tahun) && BULAN_LIST.indexOf(t.Bulan) > BULAN_LIST.indexOf(terbaru.Bulan))) {
        terbaru = t;
      }
    });
    return {
      NamaUMKM: u.NamaUMKM, SektorUsaha: u.SektorUsaha,
      bulanInput: terbaru ? (terbaru.Bulan + ' ' + terbaru.Tahun) : null,
      jumlah: terbaru ? Number(terbaru.JumlahTenagaKerja) : null
    };
  }).sort((a, b) => (b.jumlah || 0) - (a.jumlah || 0));

  const totalHalaman = Math.max(1, Math.ceil(gabungan.length / REKAP_TK_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * REKAP_TK_PER_HALAMAN;
  const rows = gabungan.slice(mulai, mulai + REKAP_TK_PER_HALAMAN);

  area.innerHTML = `
    <div class="table-card">
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>UMKM</th><th>Sektor</th><th>Bulan Input Tenaga Kerja</th><th>Jumlah Tenaga Kerja</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td><b>${esc(r.NamaUMKM)}</b></td>
            <td><span class="sector-tag">${esc(r.SektorUsaha)}</span></td>
            <td>${r.bulanInput || `<span class="text-muted" style="font-style:italic;">Belum ada data</span>`}</td>
            <td>${r.jumlah !== null ? '<b>' + r.jumlah + '</b> orang' : '-'}</td>
          </tr>`).join('') : `<tr><td colspan="4"><div class="table-empty"><i class="bi bi-inbox"></i>Belum ada data UMKM.</div></td></tr>`}</tbody>
      </table>
      </div>
    </div>
    ${totalHalaman > 1 ? `
    <div class="d-flex gap-2 mt-2" style="flex-wrap:wrap;">
      ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderRekapTenagaKerja(${p})">${p}</button>`).join('')}
    </div>` : ''}
  `;
}

function renderTabelTenagaKerja(rows) {
  const area = document.getElementById('tkTableArea');
  if (!area) return;
  // Urutkan dari bulan-tahun PALING BARU (dekat dengan sekarang) di ATAS,
  // ke yang paling lama di BAWAH.
  const rowsUrut = [...rows].sort((a, b) => {
    if (Number(b.Tahun) !== Number(a.Tahun)) return Number(b.Tahun) - Number(a.Tahun);
    return BULAN_LIST.indexOf(b.Bulan) - BULAN_LIST.indexOf(a.Bulan);
  });
  area.innerHTML = `
    <table class="sipuma-table"><thead><tr><th>Bulan</th><th>Jumlah</th><th>Catatan</th></tr></thead>
      <tbody>${rowsUrut.length ? rowsUrut.map(r => `<tr><td>${r.Bulan} ${r.Tahun}</td><td><b>${r.JumlahTenagaKerja}</b> orang</td><td class="text-muted">${esc(r.Catatan) || '-'}</td></tr>`).join('') : `<tr><td colspan="3"><div class="table-empty"><i class="bi bi-inbox"></i>Belum ada data.</div></td></tr>`}</tbody>
    </table>`;
}
function muatTabelTenagaKerja(kodeUmkm, tahun) {
  const area = document.getElementById('tkTableArea');
  const kunci = kodeUmkm + '_' + tahun;
  if (!AppState.cache.tenagaKerjaPerUmkmTahun) AppState.cache.tenagaKerjaPerUmkmTahun = {};
  if (AppState.cache.tenagaKerjaPerUmkmTahun[kunci]) {
    renderTabelTenagaKerja(AppState.cache.tenagaKerjaPerUmkmTahun[kunci]);
    return;
  }
  panggilServerAman('getTenagaKerjaUMKM', [kodeUmkm, tahun], (res) => {
    const rows = res.success ? parseJsonAman(res.data, []) : [];
    AppState.cache.tenagaKerjaPerUmkmTahun[kunci] = rows;
    renderTabelTenagaKerja(rows);
  }, () => {
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat riwayat. <button class="btn btn-outline btn-sm mt-2" onclick="muatTabelTenagaKerja('${kodeUmkm}', ${tahun})">Coba Lagi</button></div>`;
  });
}

function simpanTenagaKerja(kodeUmkm) {
  const btn = document.getElementById('btnSimpanTk');
  const jumlah = document.getElementById('tkJumlah').value;
  if (jumlah === '') { showToast('Peringatan', 'Jumlah tenaga kerja wajib diisi.', 'warning'); return; }
  const umkmObj = (AppState.cache.umkm || []).find(u => u.KodeUnik === kodeUmkm) || AppState.session.profil;
  const record = {
    IDUMKM: kodeUmkm, NamaUMKM: umkmObj ? umkmObj.NamaUMKM : '',
    Bulan: document.getElementById('tkBulan').value, Tahun: Number(document.getElementById('tkTahun').value),
    JumlahTenagaKerja: Number(jumlah), Catatan: document.getElementById('tkCatatan').value.trim()
  };
  function terapkanKeCacheLokal() {
    const kunci = kodeUmkm + '_' + record.Tahun;
    if (!AppState.cache.tenagaKerjaPerUmkmTahun) AppState.cache.tenagaKerjaPerUmkmTahun = {};
    if (!AppState.cache.tenagaKerjaPerUmkmTahun[kunci]) AppState.cache.tenagaKerjaPerUmkmTahun[kunci] = [];
    const rows = AppState.cache.tenagaKerjaPerUmkmTahun[kunci];
    const idx = rows.findIndex(r => r.Bulan === record.Bulan);
    if (idx > -1) Object.assign(rows[idx], record); else rows.push(record);
    document.getElementById('tkJumlah').value = ''; document.getElementById('tkCatatan').value = '';
    renderTabelTenagaKerja(rows);
    // Perbarui juga cache "semua tenaga kerja" (dipakai tabel Rekap Tenaga
    // Kerja Seluruh UMKM) supaya langsung ikut ter-update tanpa reload.
    if (AppState.cache.tenagaKerjaAll) {
      const idxAll = AppState.cache.tenagaKerjaAll.findIndex(r => r.IDUMKM === kodeUmkm && Number(r.Tahun) === record.Tahun && r.Bulan === record.Bulan);
      if (idxAll > -1) Object.assign(AppState.cache.tenagaKerjaAll[idxAll], record);
      else AppState.cache.tenagaKerjaAll.push(record);
      const rekapArea = document.getElementById('rekapTkArea');
      if (rekapArea) renderRekapTenagaKerja(1);
    }
  }
  setBtnLoading(btn);
  panggilServerAman('saveTenagaKerja', [record], (res) => {
    resetBtn(btn);
    if (res.success) { showToast('Berhasil', res.message, 'success'); terapkanKeCacheLokal(); }
    else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    // JANGAN verifikasi via server lagi (kanal yang sama kemungkinan besar
    // juga akan gagal membaca) — langsung terapkan ke cache lokal secara
    // optimis, penyimpanan di server hampir selalu sebenarnya berhasil
    // walau konfirmasinya hilang di jalan.
    showToast('Kemungkinan Tersimpan', 'Server tidak memberi konfirmasi (gangguan koneksi), tapi data biasanya tetap tersimpan. Tampilan sudah diperbarui — silakan cek lagi nanti untuk memastikan.', 'warning');
    terapkanKeCacheLokal();
  });
}


// ════════════════════════════════════════════════════════
// MODUL: ASESMEN KELAS KEMANDIRIAN (Admin)
// ════════════════════════════════════════════════════════
function loadKemandirian() { ensureUmkmCacheThen(() => renderKemandirianForm(AppState.cache.umkm[0] ? AppState.cache.umkm[0].KodeUnik : '')); }

function renderKemandirianForm(kodeUmkm) {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Evaluasi Terstandarisasi', 'Asesmen', 'Kelas Kemandirian',
      'Input skor 3 pilar (Produksi, Pemasaran, Keuangan). Sistem otomatis menghitung rata-rata & kelas kemandirian akhir.', '')}
    ${spandukUmkmNonaktif(kodeUmkm)}
    <div class="grid grid-1-2">
      <div class="panel">
        <div class="form-group"><label class="form-label">Pilih UMKM</label>${dropdownUmkmCari('kkUmkmSelect', kodeUmkm, "renderKemandirianForm(document.getElementById('kkUmkmSelect').value)")}</div>
        <div id="kkFormArea"><div class="loading-inline"><div class="spinner"></div></div></div>
      </div>
      <div class="panel">
        <div class="panel-title">Panduan Skala Kelas</div>
        <div class="grid grid-2 mt-2">
          ${tierMiniLegend('Pemula','0–24')}${tierMiniLegend('Madya','25–49')}
          ${tierMiniLegend('Pra Mandiri','50–74')}${tierMiniLegend('Mandiri','75–100')}
        </div>
        <div class="text-muted mt-3" style="font-size:12px;">Kelas kemandirian dihitung otomatis dari rata-rata (Produksi + Pemasaran + Keuangan) / 3.</div>
        <div class="mt-4">
          <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">
            <div class="panel-title mb-0" style="font-size:14px;">Rekap Kelas Kemandirian UMKM</div>${tombolEkspor('eksporRekapAsesmen')}
            <select class="form-select" id="kkFilterKelas" style="width:auto;min-width:160px;" onchange="renderRekapKemandirian(1, this.value)">
              <option value="">Semua Status</option>
              <option value="Pemula">Pemula</option>
              <option value="Madya">Madya</option>
              <option value="Pra Mandiri">Pra Mandiri</option>
              <option value="Mandiri">Mandiri</option>
            </select>
          </div>
          <div id="kkRekapArea" class="mt-2"><div class="loading-inline"><div class="spinner"></div></div></div>
        </div>
      </div>
    </div>
  `;
  muatFormKemandirian(kodeUmkm);
  muatRekapKemandirian(1);
}
function tierMiniLegend(nama, skor) {
  const cls = tierClass(nama);
  return `<div class="tier-card" style="padding:10px;"><span class="tier-name"><span class="dot dot-${cls}"></span>${nama}</span><div class="text-muted mt-2" style="font-size:11.5px;">Skor ${skor}</div></div>`;
}

// ── Rekap Kelas Kemandirian (semua UMKM, dengan paginasi 10/halaman) ──
const REKAP_PER_HALAMAN = 10;
function muatRekapKemandirian(halaman) {
  const sec = AppState.currentSection;
  const area = document.getElementById('kkRekapArea');
  if (!area) return;
  if (AppState.cache.kemandirianAll) { renderRekapKemandirian(halaman, ''); return; }
  panggilServerAman('getAllKelasKemandirian', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.kemandirianAll = res.success ? parseJsonAman(res.data, []) : [];
    renderRekapKemandirian(halaman, '');
  }, () => {
    if (AppState.currentSection !== sec) return;
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat rekap. <button class="btn btn-outline btn-sm mt-2" onclick="AppState.cache.kemandirianAll=null;muatRekapKemandirian(1)">Coba Lagi</button></div>`;
  });
}
function renderRekapKemandirian(halaman, filterKelas) {
  const area = document.getElementById('kkRekapArea');
  if (!area) return;
  const dropdownFilter = document.getElementById('kkFilterKelas');
  if (filterKelas === undefined) filterKelas = dropdownFilter ? dropdownFilter.value : '';
  else if (dropdownFilter) dropdownFilter.value = filterKelas;
  let semua = [...(AppState.cache.kemandirianAll || [])].sort((a, b) => (b.RataRata || 0) - (a.RataRata || 0));
  if (filterKelas) semua = semua.filter(r => r.Kelas === filterKelas);
  const totalHalaman = Math.max(1, Math.ceil(semua.length / REKAP_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * REKAP_PER_HALAMAN;
  const rows = semua.slice(mulai, mulai + REKAP_PER_HALAMAN);
  area.innerHTML = `
    <div class="table-card">
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Kode Unik</th><th>Nama UMKM</th><th>Rata-Rata Skor</th><th>Status Kemandirian</th><th>Bulan/Tahun Asesmen</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td><b>${esc(r.IDUMKM)}</b></td>
            <td>${esc(r.NamaUMKM)}</td>
            <td>${r.RataRata}</td>
            <td><span class="tier-score-pill tier-${tierClass(r.Kelas)}">${esc(r.Kelas)}</span></td>
            <td>${formatBulanTahun(r.TanggalAsesmen)}</td>
          </tr>`).join('') : `<tr><td colspan="5"><div class="table-empty"><i class="bi bi-inbox"></i>${filterKelas ? 'Tidak ada UMKM dengan status ini.' : 'Belum ada data asesmen.'}</div></td></tr>`}</tbody>
      </table>
      </div>
    </div>
    ${totalHalaman > 1 ? `
    <div class="d-flex gap-2 mt-2" style="flex-wrap:wrap;">
      ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderRekapKemandirian(${p}, '${filterKelas}')">${p}</button>`).join('')}
    </div>` : ''}
  `;
}

function muatFormKemandirian(kodeUmkm) {
  const area = document.getElementById('kkFormArea');
  // Pakai cache lokal per-UMKM dulu kalau sudah pernah dibuka di sesi ini —
  // menghindari harus menunggu RPC lagi setiap kali pindah-pindah UMKM
  // (yang terbukti bisa macet/gagal kalau kanal sedang bermasalah).
  if (!AppState.cache.kemandirianPerUmkm) AppState.cache.kemandirianPerUmkm = {};
  if (AppState.cache.kemandirianPerUmkm[kodeUmkm] !== undefined) {
    renderFormKemandirianDenganData(kodeUmkm, AppState.cache.kemandirianPerUmkm[kodeUmkm]);
    return;
  }
  panggilServerAman('getKelasKemandirianUMKM', [kodeUmkm], (res) => {
    const d = res.success ? (parseJsonAman(res.data, null) || {}) : {};
    AppState.cache.kemandirianPerUmkm[kodeUmkm] = d;
    renderFormKemandirianDenganData(kodeUmkm, d);
  }, () => {
    area.innerHTML = `<div class="table-empty"><i class="bi bi-wifi-off"></i>Gagal memuat data asesmen. <button class="btn btn-outline btn-sm mt-2" onclick="muatFormKemandirian('${kodeUmkm}')">Coba Lagi</button></div>`;
  });
}
function renderFormKemandirianDenganData(kodeUmkm, d) {
  const area = document.getElementById('kkFormArea');
  if (!area) return;
  const tglAsesmenDefault = d.TanggalAsesmen ? formatBulanTahunUntukInput(d.TanggalAsesmen) : formatBulanTahunUntukInput(new Date());
  area.innerHTML = `
    <div class="grid grid-2 mb-3">
      <div class="form-group mb-0"><label class="form-label">Bulan & Tahun Asesmen</label><input type="month" class="form-control" id="kkTglAsesmen" value="${tglAsesmenDefault}"></div>
      <div class="form-group mb-0"><label class="form-label">Nama Asesor</label><input class="form-control" id="kkAsesor" value="${esc(d.Asesor || '')}" placeholder="Contoh: Siti Rahmawati"></div>
    </div>
    <div class="grid grid-3 mb-3">
      <div class="form-group"><label class="form-label">Skor Produksi (0-100)</label><input type="number" min="0" max="100" class="form-control" id="kkProduksi" value="${d.SkorProduksi || ''}" oninput="previewKelas()"></div>
      <div class="form-group"><label class="form-label">Skor Pemasaran (0-100)</label><input type="number" min="0" max="100" class="form-control" id="kkPemasaran" value="${d.SkorPemasaran || ''}" oninput="previewKelas()"></div>
      <div class="form-group"><label class="form-label">Skor Keuangan (0-100)</label><input type="number" min="0" max="100" class="form-control" id="kkKeuangan" value="${d.SkorKeuangan || ''}" oninput="previewKelas()"></div>
    </div>
    <div class="panel mb-3" style="background:var(--canvas);" id="kkPreviewBox">
      <span class="text-muted" style="font-size:12.5px;">Hasil kelas akan tampil di sini setelah skor diisi.</span>
    </div>
    <div class="form-group"><label class="form-label">Catatan Penting — Produksi</label><textarea class="form-control" id="kkCatatanProduksi">${esc(d.CatatanProduksi || '')}</textarea></div>
    <div class="form-group"><label class="form-label">Catatan Penting — Pemasaran</label><textarea class="form-control" id="kkCatatanPemasaran">${esc(d.CatatanPemasaran || '')}</textarea></div>
    <div class="form-group"><label class="form-label">Catatan Penting — Keuangan</label><textarea class="form-control" id="kkCatatanKeuangan">${esc(d.CatatanKeuangan || '')}</textarea></div>
    <div class="form-group"><label class="form-label">Saran Program yang Harus Diikuti</label><textarea class="form-control" id="kkSaranProgram">${esc(d.SaranProgram || '')}</textarea></div>
    <button class="btn btn-primary btn-block" id="btnSimpanKK" onclick="simpanKemandirian('${kodeUmkm}')"><i class="bi bi-save"></i> Simpan Asesmen</button>
  `;
  previewKelas();
}

function previewKelas() {
  const p = Number(document.getElementById('kkProduksi').value) || 0;
  const pm = Number(document.getElementById('kkPemasaran').value) || 0;
  const k = Number(document.getElementById('kkKeuangan').value) || 0;
  const rata = Math.round(((p + pm + k) / 3) * 10) / 10;
  const kelas = rata < 25 ? 'Pemula' : rata < 50 ? 'Madya' : rata < 75 ? 'Pra Mandiri' : 'Mandiri';
  const cls = tierClass(kelas);
  document.getElementById('kkPreviewBox').innerHTML = `<div class="d-flex align-center gap-3"><span class="tier-score-pill tier-${cls}" style="font-size:13px;padding:6px 14px;">${kelas}</span><span>Rata-rata Skor: <b>${rata}</b> / 100</span></div>`;
}

function simpanKemandirian(kodeUmkm) {
  const btn = document.getElementById('btnSimpanKK');
  const umkmObj = (AppState.cache.umkm || []).find(u => u.KodeUnik === kodeUmkm);
  const p = Number(document.getElementById('kkProduksi').value);
  const pm = Number(document.getElementById('kkPemasaran').value);
  const k = Number(document.getElementById('kkKeuangan').value);
  if ([p,pm,k].some(v => isNaN(v))) { showToast('Peringatan','Ketiga skor pilar wajib diisi.','warning'); return; }
  const record = {
    IDUMKM: kodeUmkm, NamaUMKM: umkmObj ? umkmObj.NamaUMKM : '',
    SkorProduksi: p, SkorPemasaran: pm, SkorKeuangan: k,
    CatatanProduksi: document.getElementById('kkCatatanProduksi').value.trim(),
    CatatanPemasaran: document.getElementById('kkCatatanPemasaran').value.trim(),
    CatatanKeuangan: document.getElementById('kkCatatanKeuangan').value.trim(),
    SaranProgram: document.getElementById('kkSaranProgram').value.trim(),
    Asesor: document.getElementById('kkAsesor').value.trim(),
    // Dikirim sebagai TEKS ('YYYY-MM'), BUKAN objek Date — pelajaran dari
    // bug "Failed due to illegal value in property" sebelumnya. Server
    // akan mengubahnya jadi tanggal yang benar (tanggal 1 di bulan itu).
    TanggalAsesmen: document.getElementById('kkTglAsesmen').value || formatBulanTahunUntukInput(new Date())
  };
  setBtnLoading(btn);
  panggilServerAman('saveKelasKemandirian', [record], (res) => {
    resetBtn(btn);
    if (res.success) {
      const dataHasil = parseJsonAman(res.data, record);
      showToast('Berhasil', res.message, 'success');
      // Update cache lokal LANGSUNG (hindari perlu fetch ulang) —
      // dataHasil sudah berisi RataRata & Kelas hasil hitungan server.
      if (!AppState.cache.kemandirianPerUmkm) AppState.cache.kemandirianPerUmkm = {};
      AppState.cache.kemandirianPerUmkm[kodeUmkm] = dataHasil;
      if (AppState.cache.kemandirianAll) {
        const idx = AppState.cache.kemandirianAll.findIndex(r => r.IDUMKM === kodeUmkm);
        if (idx > -1) Object.assign(AppState.cache.kemandirianAll[idx], dataHasil);
        else AppState.cache.kemandirianAll.push(dataHasil);
        const rekapArea = document.getElementById('kkRekapArea');
        if (rekapArea) renderRekapKemandirian(1);
      }
    } else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    // JANGAN coba verifikasi via server lagi — kanal yang sama yang barusan
    // gagal untuk MENYIMPAN kemungkinan besar JUGA akan gagal untuk MEMBACA
    // (terbukti berulang kali). Dari pengamatan nyata: penyimpanan di server
    // hampir selalu SEBENARNYA berhasil walau konfirmasinya hilang di jalan.
    // Jadi di sini kita HITUNG SENDIRI hasilnya di browser (rumus identik
    // dengan server) dan perbarui tampilan secara optimis, sambil tetap
    // memberi tahu pengguna secara jujur bahwa ini belum terverifikasi.
    const rata = Math.round(((p + pm + k) / 3) * 10) / 10;
    const kelas = rata < 25 ? 'Pemula' : rata < 50 ? 'Madya' : rata < 75 ? 'Pra Mandiri' : 'Mandiri';
    const dataOptimis = Object.assign({}, record, { RataRata: rata, Kelas: kelas, TanggalAsesmen: new Date() });
    showToast('Kemungkinan Tersimpan', 'Server tidak memberi konfirmasi (gangguan koneksi), tapi data biasanya tetap tersimpan. Tampilan sudah diperbarui — silakan cek lagi nanti untuk memastikan.', 'warning');
    if (!AppState.cache.kemandirianPerUmkm) AppState.cache.kemandirianPerUmkm = {};
    AppState.cache.kemandirianPerUmkm[kodeUmkm] = dataOptimis;
    if (AppState.cache.kemandirianAll) {
      const idx = AppState.cache.kemandirianAll.findIndex(r => r.IDUMKM === kodeUmkm);
      if (idx > -1) Object.assign(AppState.cache.kemandirianAll[idx], dataOptimis);
      else AppState.cache.kemandirianAll.push(dataOptimis);
      const rekapArea = document.getElementById('kkRekapArea');
      if (rekapArea) renderRekapKemandirian(1);
    }
  });
}


// ════════════════════════════════════════════════════════
// MODUL: FASILITASI PEMASARAN (Admin)
// ════════════════════════════════════════════════════════
function loadFasilitasi() {
  const sec = AppState.currentSection;
  ensureUmkmCacheThen(() => {
    if (AppState.currentSection !== sec) return;
    // Pakai data yang sudah ditanam server sejak awal kalau tersedia —
    // menghindari kanal RPC yang terbukti bisa gagal, sama seperti UMKM
    // dan Kelas Kemandirian.
    if (AppState.cache.fasilitasi) { renderFasilitasi(AppState.cache.fasilitasi); return; }
    panggilServerAman('getAllFasilitasi', [], (res) => {
      if (AppState.currentSection !== sec) return;
      AppState.cache.fasilitasi = res.success ? parseJsonAman(res.data, []) : [];
      renderFasilitasi(AppState.cache.fasilitasi);
    }, () => {
      if (AppState.currentSection !== sec) return;
      document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat data fasilitasi pemasaran.</p><button class="btn btn-primary mt-2" onclick="loadFasilitasi()">Coba Lagi</button></div>`;
    });
  });
}

const FASILITASI_PER_HALAMAN = 16;
function renderFasilitasi(rows) {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Investasi Pembinaan', 'Fasilitasi', 'Pemasaran', 'Catat setiap kegiatan fasilitasi pemasaran yang diberikan kepada UMKM beserta nominalnya.',
      `<button class="btn btn-primary" onclick="formFasilitasi()"><i class="bi bi-plus-lg"></i> Catat Fasilitasi</button>`)}
    <div id="fasilitasiRingkasanArea"></div>
    <div class="table-card">
      <div class="table-toolbar">
        <div class="d-flex gap-2 align-center" style="flex-wrap:wrap;">
          <select class="form-select" id="fasFilterSektor" style="width:auto;height:34px;" onchange="renderFasilitasiTabel(1)">
            <option value="">Semua Sektor</option>
            ${optionsHtml(SEKTOR_LIST, null)}
          </select>
          <div class="input-group-icon" style="width:220px;">
            <i class="bi bi-search"></i>
            <input type="text" class="form-control" id="fasCariUmkm" style="height:34px;" placeholder="Cari nama UMKM..." oninput="renderFasilitasiTabel(1)">
          </div>
        </div>
      </div>
      <div id="fasilitasiTabelArea"></div>
    </div>
  `;
  // Ringkasan & tabel dirender TERPISAH dari toolbar (lihat pola yang sama
  // dipakai di Data Master UMKM) — supaya kolom pencarian tidak dibangun
  // ulang setiap ketikan, dan fokus kursor tidak hilang.
  renderFasilitasiRingkasan();
  renderFasilitasiTabel(1);
}

function renderFasilitasiRingkasan() {
  const area = document.getElementById('fasilitasiRingkasanArea');
  if (!area) return;
  const rows = AppState.cache.fasilitasi || [];
  const petaSektor = {};
  (AppState.cache.umkm || []).forEach(u => { petaSektor[u.KodeUnik] = u.SektorUsaha; });
  const total = rows.reduce((s, r) => s + Number(r.NominalRupiah || 0), 0);
  const totalPerSektor = {};
  SEKTOR_LIST.forEach(s => { totalPerSektor[s] = 0; });
  rows.forEach(r => {
    const sektor = petaSektor[r.IDUMKM];
    if (sektor && totalPerSektor[sektor] !== undefined) totalPerSektor[sektor] += Number(r.NominalRupiah || 0);
  });
  const targetSaatIni = Number(AppState.config.targetFasilitasiTahunan) || 0;
  const bisaEditTarget = AppState.session.role === 'Admin';
  area.innerHTML = `
    <div class="grid grid-1-2 mb-3">
      <div class="panel" style="background:linear-gradient(135deg,var(--primary),var(--primary-active));color:#fff;">
        <span style="font-size:11px;text-transform:uppercase;opacity:.85;font-weight:700;">Total Fasilitasi Pemasaran</span>
        <div style="font-size:28px;font-weight:700;">${formatRupiahFull(total)}</div>
        <div class="mt-3 pt-3" style="border-top:1px solid rgba(255,255,255,0.25);">
          <label style="font-size:11px;text-transform:uppercase;opacity:.85;font-weight:700;display:block;margin-bottom:6px;">Target Fasilitasi Pemasaran dalam Setahun (Rp)</label>
          ${bisaEditTarget ? `
          <div class="d-flex gap-2">
            <input type="number" min="0" class="form-control" id="targetFasilitasiInput" value="${targetSaatIni || ''}" placeholder="Contoh: 800000000" style="background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.35);color:#fff;">
            <button class="btn btn-outline" style="background:#fff;color:var(--primary);flex:none;" id="btnSimpanTargetFasilitasi" onclick="simpanTargetFasilitasi()"><i class="bi bi-save"></i> Simpan</button>
          </div>` : `
          <div style="font-size:20px;font-weight:700;"><i class="bi bi-lock-fill" style="font-size:14px;opacity:.75;"></i> ${formatRupiahFull(targetSaatIni)}</div>`}
        </div>
      </div>
      <div class="panel">
        <span class="text-muted" style="font-size:11px;text-transform:uppercase;font-weight:700;">Total per Sektor</span>
        <div class="grid grid-2 mt-2" style="gap:8px;">
          ${SEKTOR_LIST.map(s => `
            <div class="d-flex flex-between" style="padding:6px 10px;background:var(--canvas);border-radius:8px;">
              <span class="sector-tag">${s}</span>
              <b style="font-size:13px;">${formatRupiahFull(totalPerSektor[s])}</b>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function simpanTargetFasilitasi() {
  const btn = document.getElementById('btnSimpanTargetFasilitasi');
  const nilai = Number(document.getElementById('targetFasilitasiInput').value) || 0;
  setBtnLoading(btn, 'Menyimpan...');
  panggilServerAman('setConfig', ['targetFasilitasiTahunan', nilai], (res) => {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', 'Target Fasilitasi Pemasaran berhasil diperbarui.', 'success');
      // Perbarui config lokal + kosongkan cache Dashboard supaya widget
      // Fasilitasi Pemasaran di Dashboard Utama langsung menampilkan angka
      // target terbaru ini pada kunjungan berikutnya (tanpa perlu reload).
      AppState.config.targetFasilitasiTahunan = nilai;
      AppState.cache.dashboardOrganisasi = null;
    } else {
      showToast('Gagal', res.message, 'danger');
    }
  }, () => {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan target. Silakan coba lagi.', 'danger');
  });
}


function renderFasilitasiTabel(halaman) {
  const area = document.getElementById('fasilitasiTabelArea');
  if (!area) return;
  const filterSektor = document.getElementById('fasFilterSektor') ? document.getElementById('fasFilterSektor').value : '';
  const kataKunci = document.getElementById('fasCariUmkm') ? document.getElementById('fasCariUmkm').value.trim().toLowerCase() : '';
  const petaSektor = {};
  (AppState.cache.umkm || []).forEach(u => { petaSektor[u.KodeUnik] = u.SektorUsaha; });

  let rows = AppState.cache.fasilitasi || [];
  if (filterSektor) rows = rows.filter(r => petaSektor[r.IDUMKM] === filterSektor);
  if (kataKunci) rows = rows.filter(r => String(r.NamaUMKM).toLowerCase().includes(kataKunci));
  // Urutkan dari tanggal PALING BARU di atas, paling lama di bawah.
  rows = [...rows].sort((a, b) => new Date(b.TanggalFasilitasi) - new Date(a.TanggalFasilitasi));

  const totalHalaman = Math.max(1, Math.ceil(rows.length / FASILITASI_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * FASILITASI_PER_HALAMAN;
  const rowsHalamanIni = rows.slice(mulai, mulai + FASILITASI_PER_HALAMAN);

  area.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Tanggal</th><th>UMKM</th><th>Customer/Mitra</th><th>Kegiatan</th><th>Nominal</th></tr></thead>
        <tbody>${rowsHalamanIni.length ? rowsHalamanIni.map(r => `<tr><td>${formatTgl(r.TanggalFasilitasi)}</td><td>${esc(r.NamaUMKM)}</td><td>${esc(r.NamaCustomer)}</td><td>${esc(r.DeskripsiKegiatan)}</td><td><b>${formatRupiahFull(r.NominalRupiah)}</b></td></tr>`).join('') : `<tr><td colspan="5"><div class="table-empty"><i class="bi bi-inbox"></i>${(filterSektor || kataKunci) ? 'Tidak ada data yang cocok.' : 'Belum ada data fasilitasi.'}</div></td></tr>`}</tbody>
      </table>
      </div>
      ${totalHalaman > 1 ? `
      <div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;padding:0 4px 4px;">
        ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderFasilitasiTabel(${p})">${p}</button>`).join('')}
      </div>` : ''}
  `;
}

function formFasilitasi() {
  const body = `
    <div class="form-group"><label class="form-label">Pilih UMKM</label>${dropdownUmkmCari('fasUmkm', null, '')}</div>
    <div class="form-group"><label class="form-label">Nama Customer / Mitra</label><input class="form-control" id="fasCustomer" placeholder="Contoh: PT United Tractors Tbk"></div>
    <div class="form-group"><label class="form-label">Deskripsi Kegiatan</label><textarea class="form-control" id="fasDeskripsi" placeholder="Contoh: Tenant Bazar Kuliner Akbar HUT UT ke-54"></textarea></div>
    <div class="grid grid-2">
      <div class="form-group"><label class="form-label">Nominal (Rp)</label><input type="number" min="0" class="form-control" id="fasNominal" placeholder="7500000"></div>
      <div class="form-group"><label class="form-label">Tanggal Fasilitasi</label><input type="date" class="form-control" id="fasTanggal"></div>
    </div>
    <div class="form-group"><label class="form-label">Catatan (opsional)</label><textarea class="form-control" id="fasCatatan"></textarea></div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button><button class="btn btn-primary" id="btnSimpanFas" onclick="simpanFasilitasi()"><i class="bi bi-save"></i> Simpan</button>`;
  openFormModal('Catat Fasilitasi Pemasaran', body, footer);
}

function simpanFasilitasi() {
  const btn = document.getElementById('btnSimpanFas');
  const kodeUmkm = document.getElementById('fasUmkm').value;
  const umkmObj = (AppState.cache.umkm || []).find(u => u.KodeUnik === kodeUmkm);
  const nominal = document.getElementById('fasNominal').value;
  if (!nominal || Number(nominal) <= 0) { showToast('Peringatan','Nominal harus lebih dari 0.','warning'); return; }
  const record = {
    IDUMKM: kodeUmkm, NamaUMKM: umkmObj ? umkmObj.NamaUMKM : '',
    NamaCustomer: document.getElementById('fasCustomer').value.trim(),
    DeskripsiKegiatan: document.getElementById('fasDeskripsi').value.trim(),
    NominalRupiah: Number(nominal),
    TanggalFasilitasi: document.getElementById('fasTanggal').value || formatTglUntukInput(new Date()),
    Catatan: document.getElementById('fasCatatan').value.trim()
  };
  setBtnLoading(btn);
  panggilServerAman('addFasilitasi', [record], (res) => {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      closeModal('modalGeneric');
      if (!AppState.cache.fasilitasi) AppState.cache.fasilitasi = [];
      AppState.cache.fasilitasi.push(record);
      if (AppState.currentSection === 'fasilitasi') renderFasilitasi(AppState.cache.fasilitasi);
    }
    else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan fasilitasi setelah beberapa percobaan. Data mungkin sudah tersimpan — silakan muat ulang halaman untuk memeriksa.', 'danger');
  });
}


// ════════════════════════════════════════════════════════
// MODUL: CATATAN PRESTASI UMKM (Admin input, CSR UT lihat)
// ════════════════════════════════════════════════════════
function loadPrestasiAdmin() {
  const sec = AppState.currentSection;
  ensureUmkmCacheThen(() => {
    if (AppState.currentSection !== sec) return;
    if (AppState.cache.prestasi) { renderPrestasiAdmin(AppState.cache.prestasi); return; }
    panggilServerAman('getAllPrestasi', [], (res) => {
      if (AppState.currentSection !== sec) return;
      AppState.cache.prestasi = res.success ? parseJsonAman(res.data, []) : [];
      renderPrestasiAdmin(AppState.cache.prestasi);
    }, () => {
      if (AppState.currentSection !== sec) return;
      document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat catatan prestasi.</p><button class="btn btn-primary mt-2" onclick="loadPrestasiAdmin()">Coba Lagi</button></div>`;
    });
  });
}
const PRESTASI_PER_HALAMAN = 15;
function renderPrestasiAdmin(rows) {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Akumulasi Pencapaian', 'Catatan', 'Prestasi UMKM', 'Input catatan prestasi/pencapaian UMKM setiap bulannya untuk ditampilkan di dashboard CSR UT.',
      `<button class="btn btn-primary" onclick="formPrestasi()"><i class="bi bi-plus-lg"></i> Tambah Catatan</button>`)}
    <div class="table-card">
      <div class="table-toolbar">
        <div class="input-group-icon" style="width:240px;">
          <i class="bi bi-search"></i>
          <input type="text" class="form-control" id="presCariUmkm" style="height:34px;" placeholder="Cari nama UMKM..." oninput="renderPrestasiTabel(1)">
        </div>
      </div>
      <div id="prestasiTabelArea"></div>
    </div>
  `;
  // Tabel dirender TERPISAH dari toolbar pencarian — supaya fokus kursor
  // tidak hilang setiap kali mengetik (pola sama seperti Data Master UMKM).
  renderPrestasiTabel(1);
}

function renderPrestasiTabel(halaman) {
  const area = document.getElementById('prestasiTabelArea');
  if (!area) return;
  const kataKunci = document.getElementById('presCariUmkm') ? document.getElementById('presCariUmkm').value.trim().toLowerCase() : '';

  let rows = AppState.cache.prestasi || [];
  if (kataKunci) rows = rows.filter(r => String(r.NamaUMKM).toLowerCase().includes(kataKunci));
  // Urutkan berdasarkan PERIODE (Bulan/Tahun kejadian) — dari yang paling
  // dekat dengan sekarang di atas, ke yang paling lama di bawah.
  rows = [...rows].sort((a, b) => {
    if (Number(b.Tahun) !== Number(a.Tahun)) return Number(b.Tahun) - Number(a.Tahun);
    return BULAN_LIST.indexOf(b.Bulan) - BULAN_LIST.indexOf(a.Bulan);
  });

  const totalHalaman = Math.max(1, Math.ceil(rows.length / PRESTASI_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * PRESTASI_PER_HALAMAN;
  const rowsHalamanIni = rows.slice(mulai, mulai + PRESTASI_PER_HALAMAN);

  area.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>UMKM</th><th>Kategori</th><th>Deskripsi</th><th>Periode</th><th>Dicatat</th><th>Aksi</th></tr></thead>
        <tbody>${rowsHalamanIni.length ? rowsHalamanIni.map(r => `<tr><td><b>${esc(r.NamaUMKM)}</b></td><td><span class="sector-tag">${esc(r.KategoriPrestasi)}</span></td><td style="max-width:340px;">${esc(r.DeskripsiPrestasi)}</td><td>${esc(r.Bulan)} ${esc(r.Tahun)}</td><td class="text-muted">${formatTgl(r.TanggalPencatatan)}</td><td><button class="action-icon-btn primary" title="Ubah" onclick='formPrestasi(${JSON.stringify(r)})'><i class="bi bi-pencil"></i></button><button class="action-icon-btn danger" title="Hapus" onclick="hapusPrestasi('${r.ID}')"><i class="bi bi-trash"></i></button></td></tr>`).join('') : `<tr><td colspan="8"><div class="table-empty"><i class="bi bi-inbox"></i>${kataKunci ? 'Tidak ada catatan yang cocok.' : 'Belum ada catatan prestasi.'}</div></td></tr>`}</tbody>
      </table>
      </div>
      ${totalHalaman > 1 ? `
      <div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;padding:0 4px 4px;">
        ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderPrestasiTabel(${p})">${p}</button>`).join('')}
      </div>` : ''}
  `;
}
function formPrestasi(data) {
  const isEdit = !!data;
  const body = `
    <input type="hidden" id="presId" value="${isEdit ? esc(data.ID) : ''}">
    <div class="form-group"><label class="form-label">Pilih UMKM</label>${dropdownUmkmCari('presUmkm', isEdit ? data.IDUMKM : null, '', isEdit)}</div>
    <div class="grid grid-2">
      <div class="form-group"><label class="form-label">Bulan</label><select class="form-select" id="presBulan">${optionsHtml(BULAN_LIST, isEdit ? data.Bulan : null)}</select></div>
      <div class="form-group"><label class="form-label">Tahun</label><input type="number" class="form-control" id="presTahun" value="${isEdit ? data.Tahun : (AppState.config.tahunAktif || 2026)}"></div>
    </div>
    <div class="form-group"><label class="form-label">Kategori Prestasi</label><select class="form-select" id="presKategori">${optionsHtml(KATEGORI_PRESTASI, isEdit ? data.KategoriPrestasi : null)}</select></div>
    <div class="form-group"><label class="form-label">Deskripsi Prestasi</label><textarea class="form-control" id="presDeskripsi" placeholder="Contoh: Meningkatkan omset 30%, menambah 5 karyawan baru">${isEdit ? esc(data.DeskripsiPrestasi) : ''}</textarea></div>
    <div class="form-group"><label class="form-label">Catatan Tambahan (opsional)</label><textarea class="form-control" id="presCatatan">${isEdit ? esc(data.CatatanTambahan) : ''}</textarea></div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button><button class="btn btn-primary" id="btnSimpanPres" onclick="simpanPrestasi(${isEdit})"><i class="bi bi-save"></i> Simpan</button>`;
  openFormModal(isEdit ? 'Ubah Catatan Prestasi' : 'Tambah Catatan Prestasi', body, footer);
}
function hapusPrestasi(id) {
  showConfirm('Catatan prestasi ini akan dihapus permanen. Lanjutkan?', () => {
    panggilServerAman('deletePrestasi', [id], (res) => {
      closeModal('modalConfirm');
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        if (AppState.cache.prestasi) {
          const idx = AppState.cache.prestasi.findIndex(r => String(r.ID) === String(id));
          if (idx > -1) AppState.cache.prestasi.splice(idx, 1);
        }
        renderPrestasiTabel(1);
      } else showToast('Gagal', res.message, 'danger');
    }, () => { closeModal('modalConfirm'); showToast('Error', 'Gagal menghapus, silakan coba lagi.', 'danger'); });
  }, 'Ya, Hapus');
}
function simpanPrestasi(isEdit) {
  const btn = document.getElementById('btnSimpanPres');
  const kodeUmkm = document.getElementById('presUmkm').value;
  const umkmObj = (AppState.cache.umkm || []).find(u => u.KodeUnik === kodeUmkm);
  const deskripsi = document.getElementById('presDeskripsi').value.trim();
  if (!deskripsi) { showToast('Peringatan','Deskripsi prestasi wajib diisi.','warning'); return; }
  const record = {
    IDUMKM: kodeUmkm, NamaUMKM: umkmObj ? umkmObj.NamaUMKM : '',
    Bulan: document.getElementById('presBulan').value, Tahun: Number(document.getElementById('presTahun').value),
    KategoriPrestasi: document.getElementById('presKategori').value, DeskripsiPrestasi: deskripsi,
    CatatanTambahan: document.getElementById('presCatatan').value.trim()
  };
  if (isEdit) record.ID = document.getElementById('presId').value;
  setBtnLoading(btn);
  const fn = isEdit ? 'updatePrestasi' : 'addPrestasi';
  panggilServerAman(fn, [record], (res) => {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      closeModal('modalGeneric');
      if (!AppState.cache.prestasi) AppState.cache.prestasi = [];
      if (isEdit) {
        const idx = AppState.cache.prestasi.findIndex(r => String(r.ID) === String(record.ID));
        if (idx > -1) Object.assign(AppState.cache.prestasi[idx], record);
      } else {
        AppState.cache.prestasi.push(Object.assign({ TanggalPencatatan: new Date() }, record));
      }
      if (AppState.currentSection === 'prestasi') renderPrestasiAdmin(AppState.cache.prestasi);
    }
    else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan catatan prestasi setelah beberapa percobaan. Data mungkin sudah tersimpan — silakan muat ulang halaman untuk memeriksa.', 'danger');
  });
}


// ════════════════════════════════════════════════════════
// MODUL: TAB KHUSUS CSR UT — Omset, Tenaga Kerja, Fasilitasi (view-only)
// ════════════════════════════════════════════════════════
function loadOmsetUT() {
  ensureUmkmCacheThen(() => renderOmsetUTPage(AppState.config.tahunAktif || new Date().getFullYear()));
}
function renderOmsetUTPage(tahun) {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Monitoring Mitra Binaan', 'Omset', 'UMKM', 'Rekap realisasi omset seluruh UMKM binaan terhadap target tahunan (sama seperti data yang dikelola Admin).', '')}
    <div class="table-card">
      <div class="table-toolbar">
        <div class="d-flex gap-2 align-center">
          <label class="form-label mb-0">Tahun</label>
          <select class="form-select" id="omsetTahunSelect" style="width:auto;height:34px;" onchange="renderOmsetUTPage(this.value)">${optionsHtml([2025,2026,2027], tahun)}</select>
          ${tombolEkspor('eksporRekapOmset')}
        </div>
      </div>
      <div id="rekapOmsetArea"><div class="loading-inline"><div class="spinner"></div></div></div>
    </div>
  `;
  muatRekapOmset(tahun, 1);
}

function loadTenagaKerjaUT() {
  ensureUmkmCacheThen(() => renderTenagaKerjaUTPage());
}
function renderTenagaKerjaUTPage() {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Monitoring Mitra Binaan', 'Tenaga Kerja', 'UMKM', 'Rekap jumlah tenaga kerja bulan terakhir yang diinput oleh masing-masing UMKM binaan (sama seperti data yang dikelola Admin).', '')}
    <div class="panel">
      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">
        <div class="panel-title mb-0">Rekap Tenaga Kerja Seluruh UMKM</div>${tombolEkspor('eksporRekapTenagaKerja')}
        <select class="form-select" id="rekapTkFilterSektor" style="width:auto;min-width:160px;" onchange="renderRekapTenagaKerja(1)">
          <option value="">Semua Sektor</option>
          ${optionsHtml(SEKTOR_LIST, null)}
        </select>
      </div>
      <div class="text-muted mb-3" style="font-size:12px;">Menampilkan jumlah tenaga kerja pada bulan TERAKHIR yang diinput oleh masing-masing UMKM.</div>
      <div id="rekapTkArea" class="mt-2"><div class="loading-inline"><div class="spinner"></div></div></div>
    </div>
  `;
  muatRekapTenagaKerja(1);
}

function loadFasilitasiUT() {
  ensureUmkmCacheThen(() => {
    panggilServerAman('getAllFasilitasi', [], (res) => {
      AppState.cache.fasilitasi = res.success ? parseJsonAman(res.data, []) : [];
      renderFasilitasiUTPage();
    }, () => {
      document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat data fasilitasi pemasaran.</p><button class="btn btn-primary mt-2" onclick="loadFasilitasiUT()">Coba Lagi</button></div>`;
    });
  });
}
function renderFasilitasiUTPage() {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Monitoring Mitra Binaan', 'Fasilitasi', 'Pemasaran UMKM', 'Rekap kegiatan fasilitasi pemasaran yang telah diberikan kepada UMKM binaan (sama seperti data yang dikelola Admin).', '')}
    <div id="fasilitasiRingkasanArea"></div>
    <div class="table-card">
      <div class="table-toolbar">
        <div class="d-flex gap-2 align-center" style="flex-wrap:wrap;">
          <select class="form-select" id="fasFilterSektor" style="width:auto;height:34px;" onchange="renderFasilitasiTabel(1)">
            <option value="">Semua Sektor</option>
            ${optionsHtml(SEKTOR_LIST, null)}
          </select>
          <div class="input-group-icon" style="width:220px;">
            <i class="bi bi-search"></i>
            <input type="text" class="form-control" id="fasCariUmkm" style="height:34px;" placeholder="Cari nama UMKM..." oninput="renderFasilitasiTabel(1)">
          </div>
        </div>
      </div>
      <div id="fasilitasiTabelArea"></div>
    </div>
  `;
  renderFasilitasiRingkasan();
  renderFasilitasiTabel(1);
}

function loadFasilitasiSaya() {
  const sec = AppState.currentSection;
  const kodeUmkm = AppState.session.idUmkm;
  if (AppState.cache.fasilitasi) { renderFasilitasiSayaPage(kodeUmkm); return; }
  panggilServerAman('getAllFasilitasi', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.fasilitasi = res.success ? parseJsonAman(res.data, []) : [];
    renderFasilitasiSayaPage(kodeUmkm);
  }, () => {
    if (AppState.currentSection !== sec) return;
    document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat data fasilitasi pemasaran.</p><button class="btn btn-primary mt-2" onclick="loadFasilitasiSaya()">Coba Lagi</button></div>`;
  });
}
function renderFasilitasiSayaPage(kodeUmkm) {
  const container = document.getElementById('app-container');
  const rows = (AppState.cache.fasilitasi || []).filter(r => r.IDUMKM === kodeUmkm)
    .sort((a, b) => new Date(b.TanggalFasilitasi) - new Date(a.TanggalFasilitasi));
  const total = rows.reduce((s, r) => s + Number(r.NominalRupiah || 0), 0);
  container.innerHTML = `
    ${pageHeader('Investasi Pembinaan', 'Fasilitasi', 'Pemasaran', 'Rekap kegiatan fasilitasi pemasaran yang telah diberikan kepada usaha Anda oleh PPU UT Cakung.', '')}
    <div class="panel mb-3" style="background:linear-gradient(135deg,var(--primary),var(--primary-active));color:#fff;">
      <span style="font-size:11px;text-transform:uppercase;opacity:.85;font-weight:700;">Total Fasilitasi Pemasaran Diterima</span>
      <div style="font-size:28px;font-weight:700;">${formatRupiahFull(total)}</div>
    </div>
    <div class="table-card">
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Tanggal</th><th>Customer/Mitra</th><th>Kegiatan</th><th>Nominal</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr><td>${formatTgl(r.TanggalFasilitasi)}</td><td>${esc(r.NamaCustomer)}</td><td>${esc(r.DeskripsiKegiatan)}</td><td><b>${formatRupiahFull(r.NominalRupiah)}</b></td></tr>`).join('') : `<tr><td colspan="4"><div class="table-empty"><i class="bi bi-inbox"></i>Belum ada fasilitasi pemasaran yang tercatat untuk usaha Anda.</div></td></tr>`}</tbody>
      </table>
      </div>
    </div>
  `;
}

function loadPerformaTerbaik() {
  const sec = AppState.currentSection;
  if (AppState.cache.prestasi) { renderPerformaTerbaik(sortPrestasiTerbaru(AppState.cache.prestasi)); return; }
  panggilServerAman('getPerformaTerbaik', ['', ''], (res) => {
    if (AppState.currentSection !== sec) return;
    renderPerformaTerbaik(res.success ? parseJsonAman(res.data, []) : []);
  }, () => {
    if (AppState.currentSection !== sec) return;
    document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat data performa.</p><button class="btn btn-primary mt-2" onclick="loadPerformaTerbaik()">Coba Lagi</button></div>`;
  });
}
function sortPrestasiTerbaru(rows) {
  return [...rows].sort((a, b) => new Date(b.TanggalPencatatan) - new Date(a.TanggalPencatatan));
}
function renderPerformaTerbaik(rows, filterBulan, filterKategori) {
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Apresiasi Mitra Binaan', 'Performa', 'UMKM Terbaik', 'Daftar UMKM dengan pencapaian/prestasi terbaik berdasarkan catatan yang diinput Admin/PIC.', '')}
    <div class="panel mb-3 d-flex gap-2" style="flex-wrap:wrap;">
      <select class="form-select" style="width:auto;" onchange="filterPerforma(this.value, document.getElementById('filterKat').value)"><option value="">Semua Bulan</option>${optionsHtml(BULAN_LIST, filterBulan)}</select>
      <select class="form-select" id="filterKat" style="width:auto;" onchange="filterPerforma(document.querySelector('.form-select').value, this.value)"><option value="">Semua Kategori</option>${optionsHtml(KATEGORI_PRESTASI, filterKategori)}</select>
    </div>
    <div class="grid grid-2" id="performaGrid">
      ${rows.length ? rows.map(r => `
        <div class="panel">
          <div class="d-flex flex-between mb-2"><b>${esc(r.NamaUMKM)}</b><span class="sector-tag">${esc(r.KategoriPrestasi)}</span></div>
          <p class="text-muted" style="font-size:12.5px;">${esc(r.DeskripsiPrestasi)}</p>
          <div class="text-muted" style="font-size:11.5px;"><i class="bi bi-calendar3"></i> ${esc(r.Bulan)} ${esc(r.Tahun)} ${r.CatatanTambahan ? ' • ' + esc(r.CatatanTambahan) : ''}</div>
        </div>`).join('') : `<div class="table-empty" style="grid-column:1/-1;"><i class="bi bi-inbox"></i>Belum ada catatan prestasi.</div>`}
    </div>
  `;
}
function filterPerforma(bulan, kategori) {
  if (AppState.cache.prestasi) {
    let rows = sortPrestasiTerbaru(AppState.cache.prestasi);
    if (bulan) rows = rows.filter(r => r.Bulan === bulan);
    if (kategori) rows = rows.filter(r => r.KategoriPrestasi === kategori);
    renderPerformaTerbaik(rows, bulan, kategori);
    return;
  }
  panggilServerAman('getPerformaTerbaik', [bulan, kategori], (res) => renderPerformaTerbaik(res.success ? parseJsonAman(res.data, []) : [], bulan, kategori), () => {
    showToast('Error', 'Gagal memuat data dengan filter tersebut.', 'danger');
  });
}


// ════════════════════════════════════════════════════════
// MODUL: LAPORAN CSR (Admin upload, UT lihat)
// ════════════════════════════════════════════════════════
function loadLaporanCsrAdmin() {
  const sec = AppState.currentSection;
  if (AppState.cache.laporanCsr) { renderLaporanCsr(AppState.cache.laporanCsr, true, _laporanCsrTahun); return; }
  panggilServerAman('getAllLaporanCSR', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.laporanCsr = res.success ? parseJsonAman(res.data, []) : [];
    renderLaporanCsr(AppState.cache.laporanCsr, true, _laporanCsrTahun);
  }, () => {
    if (AppState.currentSection !== sec) return;
    document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat laporan CSR.</p><button class="btn btn-primary mt-2" onclick="loadLaporanCsrAdmin()">Coba Lagi</button></div>`;
  });
}
/** Pesan yang jelas bila Admin menutup akses laporan. */
function renderLaporanDitutup() {
  document.getElementById('app-container').innerHTML =
    pageHeader('Arsip Resmi', 'File Laporan', 'PPU',
      'Laporan bulanan resmi program.', '') +
    '<div class="panel text-center" style="padding:56px 24px;">' +
      '<i class="bi bi-lock-fill" style="font-size:38px;color:var(--border-strong);"></i>' +
      '<h5 class="mt-3">Laporan belum dibuka</h5>' +
      '<p class="text-muted" style="font-size:13px;max-width:460px;margin:8px auto 0;">' +
        'Admin cabang ini belum membuka akses laporan. Silakan hubungi pengelola ' +
        'bila Anda memerlukannya.</p>' +
    '</div>';
}

function loadLaporanCsrUT() {
  const sec = AppState.currentSection;
  if (AppState.cache.laporanCsr) { renderLaporanCsr(AppState.cache.laporanCsr.filter(r => r.Status === 'Final'), false); return; }
  panggilServerAman('getAllLaporanCSR', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.laporanCsr = res.success ? parseJsonAman(res.data, []) : [];
    renderLaporanCsr(AppState.cache.laporanCsr.filter(r => r.Status === 'Final'), false);
  }, () => {
    if (AppState.currentSection !== sec) return;
    document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat laporan CSR.</p><button class="btn btn-primary mt-2" onclick="loadLaporanCsrUT()">Coba Lagi</button></div>`;
  });
}

function renderLaporanCsr(rows, isAdmin, tahunFilter) {
  const semua = [...rows].sort((a,b) => new Date(b.TanggalUpload) - new Date(a.TanggalUpload));
  // Kumpulkan tahun yang benar-benar punya laporan, untuk mengisi filter
  const daftarTahun = Array.from(new Set(semua.map(f => Number(f.Tahun)).filter(Boolean))).sort((a,b) => b - a);
  const tahunAktif = tahunFilter !== undefined && tahunFilter !== null && tahunFilter !== ''
    ? Number(tahunFilter) : '';
  rows = tahunAktif ? semua.filter(f => Number(f.Tahun) === tahunAktif) : semua;

  // Saringan kategori — disimpan di luar fungsi agar tidak hilang saat
  // tahunnya diganti, dan sebaliknya.
  if (_laporanCsrKategori) rows = rows.filter(f => (f.Kategori || 'Lainnya') === _laporanCsrKategori);
  _laporanCsrIsAdmin = isAdmin;

  // Jumlah per kategori ditampilkan di pilihannya, supaya terlihat
  // kategori mana yang sudah terisi tanpa perlu membukanya satu per satu.
  const dasar = tahunAktif ? semua.filter(f => Number(f.Tahun) === tahunAktif) : semua;
  const jumlahKategori = {};
  DAFTAR_KATEGORI_LAPORAN.forEach(k => { jumlahKategori[k] = 0; });
  dasar.forEach(f => {
    const k = f.Kategori || 'Lainnya';
    if (jumlahKategori[k] !== undefined) jumlahKategori[k]++;
  });

  const filterHtml =
    `<div class="d-flex gap-2 align-center" style="flex-wrap:wrap;">
      <label class="form-label mb-0" style="white-space:nowrap;">Tahun Data</label>
      <select class="form-select" style="width:auto;height:34px;" onchange="gantiTahunLaporanCsr(this.value)">
        <option value="">Semua Tahun</option>
        ${daftarTahun.map(y => `<option value="${y}"${y === tahunAktif ? ' selected' : ''}>${y}</option>`).join('')}
      </select>
      <label class="form-label mb-0" style="white-space:nowrap;">Kategori</label>
      <select class="form-select" style="width:auto;height:34px;" onchange="gantiKategoriLaporanCsr(this.value)">
        <option value="">Semua Kategori (${dasar.length})</option>
        ${DAFTAR_KATEGORI_LAPORAN.map(k => `<option value="${esc(k)}"${k === _laporanCsrKategori ? ' selected' : ''}>${esc(k)} (${jumlahKategori[k]})</option>`).join('')}
      </select>
      ${isAdmin ? `<button class="btn btn-primary" onclick="formUploadLaporan()"><i class="bi bi-upload"></i> Upload Baru</button>` : ''}
    </div>`;

  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Arsip Resmi', isAdmin ? 'Laporan CSR' : 'File Laporan', isAdmin ? '(PDF)' : 'PPU', 'Laporan bulanan resmi program yang dapat diakses oleh Stakeholder.', filterHtml)}
    <div class="grid grid-2">
      ${rows.length ? rows.map(f => `
        <div class="file-item">
          <div class="f-head">
            <div class="f-icon"><i class="bi bi-file-earmark-pdf-fill"></i></div>
            <div style="flex:1;">
              <div class="d-flex flex-between"><div class="f-name">${esc(f.NamaFile)}</div><span class="status-pill ${f.Status === 'Final' ? 'final' : 'draft'}"><span class="dot"></span>${esc(f.Status)}</span></div>
              <div class="mt-1"><span class="status-pill" style="font-size:10.5px;background:var(--madya-bg);color:var(--madya-text);"><i class="bi bi-tag-fill"></i> ${esc(f.Kategori || 'Lainnya')}</span></div>
              <div class="f-meta mt-1">${esc(f.Bulan)} ${esc(f.Tahun)} • Diupload ${formatTgl(f.TanggalUpload)} oleh ${esc(f.DiuploadOleh)}</div>
              <div class="text-muted mt-2" style="font-size:12px;">${esc(f.DeskripsiLaporan) || ''}</div>
            </div>
          </div>
          <div class="f-actions">
            <button class="btn btn-outline btn-sm" onclick="previewFile('${f.FileURL}','${esc(f.NamaFile)}',true,'${f.FileID}')"><i class="bi bi-eye"></i> Baca PDF</button>
            <a class="btn btn-primary btn-sm" href="${f.FileURL}" target="_blank"><i class="bi bi-download"></i> Unduh</a>
            ${isAdmin ? `<button class="btn btn-outline btn-sm" onclick='formUbahLaporan(${JSON.stringify(f)})'><i class="bi bi-pencil"></i> Ubah</button>` : ''}
            ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="hapusLaporan('${f.ID}')"><i class="bi bi-trash"></i></button>` : ''}
          </div>
        </div>`).join('') : `<div class="table-empty" style="grid-column:1/-1;"><i class="bi bi-file-earmark-x"></i>${
        _laporanCsrKategori ? 'Belum ada laporan pada kategori ini.' : 'Belum ada laporan diupload.'}</div>`}
    </div>
  `;
}

function formUploadLaporan() {
  const body = `
    <div class="grid grid-2">
      <div class="form-group"><label class="form-label">Bulan</label><select class="form-select" id="lapBulan">${optionsHtml(BULAN_LIST)}</select></div>
      <div class="form-group"><label class="form-label">Tahun</label><input type="number" class="form-control" id="lapTahun" value="${AppState.config.tahunAktif || 2026}"></div>
    </div>
    <div class="form-group"><label class="form-label">Kategori Laporan</label>
      <select class="form-select" id="lapKategori">${optionsHtml(DAFTAR_KATEGORI_LAPORAN)}</select></div>
    <div class="form-group"><label class="form-label">Nama File</label><input class="form-control" id="lapNama" placeholder="Laporan_CSR_Agustus_2026"></div>
    <div class="form-group"><label class="form-label">File PDF</label><input type="file" accept="application/pdf" class="form-control" id="lapFile" style="padding:6px;"></div>
    <div class="form-group"><label class="form-label">Deskripsi Laporan</label><textarea class="form-control" id="lapDeskripsi"></textarea></div>
    <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="lapStatus">${optionsHtml(['Draft','Final','Archived'],'Final')}</select></div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button><button class="btn btn-primary" id="btnUploadLap" onclick="simpanUploadLaporan()"><i class="bi bi-upload"></i> Upload</button>`;
  openFormModal('Upload File Laporan CSR', body, footer);
}

async function simpanUploadLaporan() {
  const btn = document.getElementById('btnUploadLap');
  const fileInput = document.getElementById('lapFile');
  const file = fileInput.files[0];
  if (!file) { showToast('Peringatan','Pilih file PDF terlebih dahulu.','warning'); return; }
  if (file.type !== 'application/pdf') { showToast('Peringatan','Hanya file PDF yang diterima.','warning'); return; }
  setBtnLoading(btn, 'Mengupload...');
  try {
    const base64 = await readFileAsBase64(file);
    const meta = {
      Bulan: document.getElementById('lapBulan').value, Tahun: Number(document.getElementById('lapTahun').value),
      Kategori: document.getElementById('lapKategori').value,
      DeskripsiLaporan: document.getElementById('lapDeskripsi').value.trim(),
      Status: document.getElementById('lapStatus').value, DiuploadOleh: AppState.session.username
    };
    const namaFile = (document.getElementById('lapNama').value.trim() || file.name) + '.pdf';
    panggilServerAman('uploadLaporanCSR', [base64, namaFile, file.type, meta], (res) => {
      resetBtn(btn);
      if (res.success) {
        showToast('Berhasil', 'File laporan CSR berhasil diupload.', 'success');
        closeModal('modalGeneric');
        // PENTING: masukkan LANGSUNG ke cache lokal — JANGAN panggil ulang
        // loadLaporanCsrAdmin() begitu saja, karena sekarang fungsi itu
        // memakai cache yang sudah ada (yang belum berisi file baru ini).
        if (!AppState.cache.laporanCsr) AppState.cache.laporanCsr = [];
        AppState.cache.laporanCsr.push({
          ID: res.data && res.data.id ? res.data.id : '',
          Bulan: meta.Bulan, Tahun: meta.Tahun, NamaFile: namaFile,
          FileURL: res.data ? res.data.fileUrl : '', FileID: res.data ? res.data.fileId : '',
          DeskripsiLaporan: meta.DeskripsiLaporan, TanggalUpload: new Date(),
          DiuploadOleh: meta.DiuploadOleh, Status: meta.Status, Catatan: ''
        });
        if (AppState.currentSection === 'laporanCsr') renderLaporanCsr(AppState.cache.laporanCsr, true, _laporanCsrTahun);
      }
      else showToast('Gagal', res.message, 'danger');
    }, () => {
      resetBtn(btn);
      showToast('Error', 'Gagal mengupload setelah beberapa percobaan. Silakan periksa "Laporan CSR (PDF)" — kemungkinan file sudah masuk, atau coba upload lagi.', 'danger');
    }, 2, 25000); // hanya 2x percobaan, tapi tunggu sampai 25 detik per percobaan — file PDF butuh waktu upload lebih lama daripada data teks biasa
  } catch (e) { resetBtn(btn); showToast('Error', e.message, 'danger'); }
}

function hapusLaporan(id) {
  showConfirm('Hapus file laporan ini secara permanen?', () => {
    panggilServerAman('deleteLaporanCSR', [id], (res) => {
      closeModal('modalConfirm');
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        if (AppState.cache.laporanCsr) AppState.cache.laporanCsr = AppState.cache.laporanCsr.filter(r => r.ID !== id);
        if (AppState.currentSection === 'laporanCsr') renderLaporanCsr(AppState.cache.laporanCsr, true, _laporanCsrTahun);
      }
      else showToast('Gagal', res.message, 'danger');
    }, () => {
      closeModal('modalConfirm');
      showToast('Error', 'Gagal menghapus setelah beberapa percobaan. Silakan coba lagi.', 'danger');
    });
  }, 'Ya, Hapus');
}


// ════════════════════════════════════════════════════════
// PROFIL SAYA (UMKM)
// ════════════════════════════════════════════════════════
function loadProfilSaya() {
  const p = AppState.session.profil || {};
  const container = document.getElementById('app-container');
  container.innerHTML = `
    ${pageHeader('Data Usaha', 'Profil Usaha', 'Saya', 'Perbarui foto dan alamat usaha Anda. Username dan Kode Unik tidak dapat diubah sendiri.', '')}
    <div class="grid grid-1-2">
      <div class="panel text-center">
        <div class="avatar-circle" style="width:96px;height:96px;font-size:32px;margin:0 auto 14px;" id="profilAvatarBig">${AppState.session.fotoURL ? `<img src="${normalizeFotoUrl(AppState.session.fotoURL)}">` : (p.NamaUMKM||'?')[0]}</div>
        <input type="file" id="fotoUmkmInput" accept="image/*" style="display:none;" onchange="uploadFotoUMKM()">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('fotoUmkmInput').click()"><i class="bi bi-camera"></i> Ganti Foto</button>
        ${AppState.session.fotoURL ? `<button class="btn btn-outline btn-sm mt-2" id="btnHapusFotoUmkm" onclick="hapusFotoUMKM()" style="color:var(--pemula-text);border-color:var(--pemula-text);"><i class="bi bi-trash"></i> Hapus Foto</button>` : ''}
      </div>
      <div class="panel">
        <div class="grid grid-2 mb-3">
          <div class="form-group mb-0"><label class="form-label">Nama UMKM</label><input class="form-control" value="${esc(p.NamaUMKM)}" disabled></div>
          <div class="form-group mb-0"><label class="form-label">Kode Unik</label><input class="form-control" value="${esc(p.KodeUnik)}" disabled></div>
        </div>
        <div class="grid grid-2 mb-3">
          <div class="form-group mb-0"><label class="form-label">Sektor Usaha</label><input class="form-control" value="${esc(p.SektorUsaha)}" disabled></div>
          <div class="form-group mb-0"><label class="form-label">Spesialisasi</label><input class="form-control" value="${esc(p.Spesialisasi)}" disabled></div>
        </div>
        <div class="form-group"><label class="form-label">Alamat Usaha</label><textarea class="form-control" id="profilAlamat">${esc(p.AlamatUsaha)}</textarea></div>
        <button class="btn btn-primary" id="btnSimpanProfilUmkm" onclick="simpanProfilUMKM()"><i class="bi bi-save"></i> Simpan Perubahan</button>
      </div>
    </div>
  `;
}
function simpanProfilUMKM() {
  const btn = document.getElementById('btnSimpanProfilUmkm');
  const alamatBaru = document.getElementById('profilAlamat').value.trim();
  setBtnLoading(btn);
  panggilServerAman('updateProfilUMKM', [AppState.session.idUmkm, alamatBaru, null], (res) => {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      AppState.session.alamat = alamatBaru;
      safeStorageSet('sipuma_session', JSON.stringify(AppState.session));
    } else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan setelah beberapa percobaan. Silakan coba lagi.', 'danger');
  });
}
async function uploadFotoUMKM() {
  const file = document.getElementById('fotoUmkmInput').files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('Peringatan', 'Ukuran foto melebihi 2 MB.', 'warning');
    return;
  }
  try {
    const base64 = await readFileAsBase64(file);
    // Argumen ke-4 = foto lama, supaya berkasnya dihapus dari Drive dan
    // tidak menumpuk setiap kali diganti.
    const res = await panggilAPI('uploadFoto',
      [base64, file.name, file.type, AppState.session.fotoURL || '']);

    if (!res.success || !res.data) {
      showToast('Gagal', res.message || 'Foto gagal diunggah.', 'danger');
      return;
    }
    const url = res.data.fotoURL || res.data.fileUrl;
    await panggilAPI('updateProfil', [AppState.session.alamat || '', url]);

    AppState.session.fotoURL = url;
    // Memakai simpanSesiLokal(), bukan kunci lama 'sipuma_session'.
    // Kunci penyimpanan sesi sudah berganti sejak pindah ke Firebase —
    // menulis ke kunci lama membuat foto hilang lagi saat halaman dimuat ulang.
    simpanSesiLokal(AppState.session);

    const avatar = document.getElementById('profilAvatarBig');
    if (avatar) avatar.innerHTML = '<img src="' + esc(normalizeFotoUrl(url)) + '">';
    renderShellPeran();
    loadProfilSaya();          // segarkan agar tombol Hapus ikut muncul
    showToast('Berhasil', 'Foto profil berhasil diperbarui.', 'success');
  } catch (e) {
    showToast('Error', 'Gagal mengunggah foto: ' + e.message, 'danger');
  }
}

/** Hapus foto profil usaha (berkas di Drive ikut dihapus). */
function hapusFotoUMKM() {
  showConfirm('Hapus foto profil usaha Anda? Berkas fotonya juga akan dihapus dari Google Drive.',
    async function () {
      closeModal('modalConfirm');
      const btn = document.getElementById('btnHapusFotoUmkm');
      setBtnLoading(btn, 'Menghapus...');
      const res = await panggilAPI('hapusFotoProfil', []);
      resetBtn(btn);
      if (res.success) {
        AppState.session.fotoURL = '';
        simpanSesiLokal(AppState.session);
        renderShellPeran();
        loadProfilSaya();
        showToast('Berhasil', 'Foto profil berhasil dihapus.', 'success');
      } else {
        showToast('Gagal', res.message || 'Gagal menghapus foto.', 'danger');
      }
    }, 'Ya, Hapus');
}


// ════════════════════════════════════════════════════════
// BANTUAN & SUPPORT (UMKM)
// ════════════════════════════════════════════════════════
function loadBantuan() {
  const container = document.getElementById('app-container');
  const faqs = [
    ['Bagaimana cara input omset bulanan?', 'Buka menu "Update Omset", isi nilai omset pada bulan berjalan, lalu tekan tombol Simpan Omset.'],
    ['Kenapa saya tidak bisa login?', 'Pastikan Nama UMKM dan Kode Unik sudah benar. Jika masih gagal, akses Anda mungkin sedang diblokir Admin — silakan hubungi Admin PPU.'],
    ['Siapa yang menentukan Kelas Kemandirian saya?', 'Kelas Kemandirian dinilai oleh Admin/PIC berdasarkan 3 pilar: Produksi, Pemasaran, dan Keuangan.'],
    ['Bagaimana cara mengubah Kode Unik (password) saya?', 'Kode Unik dibuat otomatis oleh sistem dan tidak dapat diubah. Hubungi Admin jika mengalami kendala akses.']
  ];
  container.innerHTML = `
    ${pageHeader('Pusat Bantuan', 'Bantuan &', 'Support', 'Temukan jawaban atas pertanyaan umum atau hubungi tim pendamping PPU UT Cakung.', '')}
    <div class="grid grid-1-2">
      <div class="panel">
        <div class="panel-title mb-3">Pertanyaan Umum (FAQ)</div>
        ${faqs.map(f => `<div class="pilar-note-card"><div class="pilar-title" style="font-size:13px;"><i class="bi bi-question-circle text-primary-c"></i> ${f[0]}</div><div class="text-muted" style="font-size:12.5px;">${f[1]}</div></div>`).join('')}
      </div>
      <div class="panel text-center">
        <i class="bi bi-headset" style="font-size:34px;color:var(--primary);"></i>
        <div class="panel-title mt-2">Hubungi Tim PPU</div>
        <p class="text-muted" style="font-size:12.5px;">Butuh bantuan lebih lanjut? Tim pendamping siap membantu Anda.</p>
        <button class="btn btn-primary btn-block mb-2" onclick="window.open('https://wa.me/','_blank')"><i class="bi bi-whatsapp"></i> Chat via WhatsApp</button>
        <button class="btn btn-outline btn-block" onclick="window.open('mailto:ppu.cakung@unitedtractors.com')"><i class="bi bi-envelope"></i> Kirim Email</button>
      </div>
    </div>
  `;
}


// File ini SENGAJA dibuat kosong/tidak penting dan ditaruh di posisi PALING
// AKHIR dari seluruh file JavaScript. Terbukti file di posisi terakhir
// kadang gagal termuat sempurna (terpotong sebelum tag penutup) — dengan
// menaruh sesuatu yang tidak krusial di sini, risiko itu "diserap" oleh
// file kosong ini, bukan oleh fungsi-fungsi penting aplikasi.
console.log('SIPUMA: seluruh bagian skrip selesai dimuat.');

// ════════════════════════════════════════════════════════
// MANAJEMEN USER & AKSES (Admin)
// ════════════════════════════════════════════════════════
function loadUserAkses() {
  const sec = AppState.currentSection;
  if (AppState.cache.users) { renderUserAkses(AppState.cache.users); return; }
  panggilServerAman('getAllUsers', [], (res) => {
    if (AppState.currentSection !== sec) return;
    AppState.cache.users = res.success ? parseJsonAman(res.data, []) : [];
    renderUserAkses(AppState.cache.users);
  }, () => {
    if (AppState.currentSection !== sec) return;
    document.getElementById('app-container').innerHTML = `<div class="panel text-center" style="padding:60px 20px;"><i class="bi bi-wifi-off" style="font-size:36px;color:var(--border-strong);"></i><p class="mt-3 text-muted">Gagal memuat data user.</p><button class="btn btn-primary mt-2" onclick="loadUserAkses()">Coba Lagi</button></div>`;
  });
}
const USER_AKSES_PER_HALAMAN = 12;
function renderUserAkses(rows) {
  const container = document.getElementById('app-container');
  const allowedCount = rows.filter(u => u.StatusAksesLogin === 'Allowed').length;
  const blockedCount = rows.filter(u => u.StatusAksesLogin === 'Blocked').length;
  container.innerHTML = `
    ${pageHeader('Kontrol Keamanan Sistem', 'Manajemen', 'User & Akses', 'Kelola username, password, dan status akses login (Allowed/Blocked) untuk semua pengguna.', '')}
    <div class="grid grid-3 mb-4">
      <div class="kpi-card c-blue"><div class="kpi-label">Total User</div><div class="kpi-value">${rows.length}</div></div>
      <div class="kpi-card c-green"><div class="kpi-label">Allowed (Aktif)</div><div class="kpi-value">${allowedCount}</div></div>
      <div class="kpi-card c-red"><div class="kpi-label">Blocked (Ditahan)</div><div class="kpi-value">${blockedCount}</div></div>
    </div>
    <div class="table-card">
      <div class="table-toolbar">
        <div class="input-group-icon" style="width:240px;">
          <i class="bi bi-search"></i>
          <input type="text" class="form-control" id="userAksesCari" style="height:34px;" placeholder="Cari username/UMKM..." oninput="renderUserAksesTabel(1)">
        </div>
      </div>
      <div id="userAksesTabelArea"></div>
    </div>
  `;
  // Tabel dirender TERPISAH dari kolom pencarian — supaya fokus kursor
  // tidak hilang setiap kali mengetik (pola sama seperti Data Master UMKM).
  renderUserAksesTabel(1);
}

function renderUserAksesTabel(halaman) {
  const area = document.getElementById('userAksesTabelArea');
  if (!area) return;
  const kataKunci = document.getElementById('userAksesCari') ? document.getElementById('userAksesCari').value.trim().toLowerCase() : '';

  let rows = AppState.cache.users || [];
  if (kataKunci) rows = rows.filter(u => String(u.Username).toLowerCase().includes(kataKunci) || String(u.IDUMKM || '').toLowerCase().includes(kataKunci));

  const totalHalaman = Math.max(1, Math.ceil(rows.length / USER_AKSES_PER_HALAMAN));
  halaman = Math.min(Math.max(1, halaman), totalHalaman);
  const mulai = (halaman - 1) * USER_AKSES_PER_HALAMAN;
  const rowsHalamanIni = rows.slice(mulai, mulai + USER_AKSES_PER_HALAMAN);

  area.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="sipuma-table">
        <thead><tr><th>Username</th><th>Role</th><th>Status Akses</th><th>Status Aktif</th><th>Dibuat</th><th>Aksi</th></tr></thead>
        <tbody>${rowsHalamanIni.length ? rowsHalamanIni.map(u => `
          <tr>
            <td><b>${esc(u.Username)}</b>${u.IDUMKM ? `<div class="text-muted" style="font-size:11px;">${esc(u.IDUMKM)}</div>` : ''}</td>
            <td><span class="sector-tag">${esc(u.Role)}</span></td>
            <td><span class="status-pill ${u.StatusAksesLogin === 'Allowed' ? 'allowed' : 'blocked'}"><span class="dot"></span>${esc(u.StatusAksesLogin)}</span></td>
            <td>${u.StatusAktif ? 'Aktif' : 'Nonaktif'}</td>
            <td class="text-muted">${formatTgl(u.TanggalDibuat)}</td>
            <td>
              <button class="action-icon-btn primary" title="Edit" onclick='formEditUser(${JSON.stringify(u)})'><i class="bi bi-pencil"></i></button>
              <button class="action-icon-btn ${u.StatusAksesLogin === 'Allowed' ? 'danger' : ''}" title="${u.StatusAksesLogin === 'Allowed' ? 'Blokir' : 'Buka Akses'}" onclick="toggleAkses('${esc(u.Username)}','${u.StatusAksesLogin}')"><i class="bi bi-${u.StatusAksesLogin === 'Allowed' ? 'lock' : 'unlock'}"></i></button>
              ${(u.Role !== 'Admin' && u.Role !== 'UT') ? `<button class="action-icon-btn danger" title="Hapus" onclick="hapusUser('${esc(u.Username)}')"><i class="bi bi-trash"></i></button>` : `<span class="text-muted" style="font-size:10.5px;" title="Akun sistem tidak dapat dihapus"><i class="bi bi-shield-lock"></i></span>`}
            </td>
          </tr>`).join('') : `<tr><td colspan="6"><div class="table-empty"><i class="bi bi-inbox"></i>${kataKunci ? 'Tidak ada user yang cocok.' : 'Belum ada data user.'}</div></td></tr>`}
        </tbody>
      </table>
      </div>
      ${totalHalaman > 1 ? `
      <div class="d-flex gap-2 mt-3" style="flex-wrap:wrap;padding:0 4px 4px;">
        ${Array.from({length: totalHalaman}, (_, i) => i + 1).map(p => `<button class="btn ${p === halaman ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="renderUserAksesTabel(${p})">${p}</button>`).join('')}
      </div>` : ''}
  `;
}

function formEditUser(u) {
  // Username akun sistem (Admin & Stakeholder) dikunci — di TAMPILAN
  // maupun di SERVER. Keduanya harus sejalan: pernah terjadi tampilan
  // dibuka tetapi server tetap mengunci, sehingga penyimpanan terlihat
  // berhasil padahal namanya tidak berubah.
  // Penggantian dilakukan lewat fungsi gantiUsernameStakeholder() di Kode.gs.
  const fixedUsername = (u.Role === 'Admin' || u.Role === 'UT');
  const body = `
    <input type="hidden" id="fuOriginal" value="${esc(u.Username)}">
    <div class="form-group"><label class="form-label">Username</label>
      <input class="form-control" id="fuUsername" value="${esc(u.Username)}" ${fixedUsername ? 'disabled' : ''}>
      <div class="login-hint">${fixedUsername
        ? 'Username akun sistem dikunci. Penggantian dilakukan oleh pengelola lewat Apps Script.'
        : 'Untuk UMKM, username mengikuti nama usaha di Data Master.'}</div></div>
    <div class="form-group"><label class="form-label">Catatan / Alasan Pemblokiran</label><textarea class="form-control" id="fuCatatan">${esc(u.AlasanPemblokiran || '')}</textarea></div>

    <div class="panel mt-3" style="background:var(--canvas);">
      <div class="panel-title mb-0" style="font-size:13px;">Reset Password</div>
      <div class="text-muted mb-2" style="font-size:11.5px;">
        Password tersimpan dalam bentuk terenkripsi dan tidak dapat dibaca siapa pun —
        termasuk Admin. Bila pengguna lupa password, buatkan yang baru di sini,
        lalu sampaikan kepada yang bersangkutan.
      </div>
      <div class="d-flex gap-2" style="flex-wrap:wrap;">
        <input class="form-control" id="fuPasswordBaru" placeholder="Password baru (minimal 6 karakter)" style="flex:1;min-width:200px;">
        <button class="btn btn-outline" id="btnResetPassword" onclick="resetPasswordUser('${esc(u.Username)}')">
          <i class="bi bi-key"></i> Terapkan
        </button>
      </div>
    </div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button><button class="btn btn-primary" id="btnSimpanUser" onclick="simpanEditUser()"><i class="bi bi-save"></i> Simpan</button>`;
  openFormModal('Edit User: ' + u.Username, body, footer);
}
function simpanEditUser() {
  const btn = document.getElementById('btnSimpanUser');
  const record = {
    originalUsername: document.getElementById('fuOriginal').value,
    Username: document.getElementById('fuUsername').value.trim(),
    // Password TIDAK lagi dikirim lewat sini. Sejak password disimpan
    // dalam bentuk hash, kolom KodeUnik tidak lagi dipakai untuk login —
    // penggantian password memakai action resetPassword tersendiri.
    AlasanPemblokiran: document.getElementById('fuCatatan').value.trim()
  };
  setBtnLoading(btn);
  panggilServerAman('updateUserCredential', [record], (res) => {
    resetBtn(btn);
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      closeModal('modalGeneric');
      // Update cache lokal langsung (JANGAN simpan password baru ke cache —
      // tetap kosongkan demi keamanan, cukup update field lain).
      if (AppState.cache.users) {
        const idx = AppState.cache.users.findIndex(u => u.Username === record.originalUsername);
        if (idx > -1) {
          AppState.cache.users[idx].Username = record.Username;
          AppState.cache.users[idx].AlasanPemblokiran = record.AlasanPemblokiran;
        }
        renderUserAkses(AppState.cache.users);
      }
    }
    else showToast('Gagal', res.message, 'danger');
  }, () => {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan setelah beberapa percobaan. Data mungkin sudah tersimpan — silakan muat ulang untuk memeriksa.', 'danger');
  });
}

function toggleAkses(username, currentStatus) {
  const next = currentStatus === 'Allowed' ? 'Blocked' : 'Allowed';
  if (next === 'Blocked') {
    const body = `<div class="form-group"><label class="form-label">Alasan Pemblokiran</label><textarea class="form-control" id="alasanBlokir" placeholder="Contoh: Belum update omset 3 bulan"></textarea></div>`;
    const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button><button class="btn btn-danger" onclick="eksekusiToggleAkses('${username}','Blocked', document.getElementById('alasanBlokir').value)">Blokir Akses</button>`;
    openFormModal('Blokir Akses: ' + username, body, footer);
  } else {
    showConfirm('Buka kembali akses login untuk "' + username + '"?', () => eksekusiToggleAkses(username, 'Allowed', ''), 'Ya, Buka Akses');
  }
}
function eksekusiToggleAkses(username, status, alasan) {
  panggilServerAman('setStatusAksesLogin', [username, status, alasan], (res) => {
    closeModal('modalGeneric'); closeModal('modalConfirm');
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      if (AppState.cache.users) {
        const idx = AppState.cache.users.findIndex(u => u.Username === username);
        if (idx > -1) { AppState.cache.users[idx].StatusAksesLogin = status; AppState.cache.users[idx].AlasanPemblokiran = alasan || ''; }
        renderUserAkses(AppState.cache.users);
      }
    }
    else showToast('Gagal', res.message, 'danger');
  }, () => {
    closeModal('modalGeneric'); closeModal('modalConfirm');
    showToast('Error', 'Gagal mengubah akses setelah beberapa percobaan. Silakan muat ulang untuk memeriksa.', 'danger');
  });
}
function hapusUser(username) {
  showConfirm('Hapus akun "' + username + '" secara permanen?', () => {
    panggilServerAman('deleteUser', [username], (res) => {
      closeModal('modalConfirm');
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        if (AppState.cache.users) {
          AppState.cache.users = AppState.cache.users.filter(u => u.Username !== username);
          renderUserAkses(AppState.cache.users);
        }
      }
      else showToast('Gagal', res.message, 'danger');
    }, () => {
      closeModal('modalConfirm');
      showToast('Error', 'Gagal menghapus setelah beberapa percobaan. Silakan coba lagi.', 'danger');
    });
  }, 'Ya, Hapus');
}



// ════════════════════════════════════════════════════════
// PENGATURAN (Admin & UT — edit foto & alamat)
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
// AKTIFKAN / NONAKTIFKAN UMKM (Data Master)
// ════════════════════════════════════════════════════════
function ubahStatusAktifUMKM(kodeUnik, jadikanAktif) {
  const umkm = (AppState.cache.umkm || []).find(function (u) { return u.KodeUnik === kodeUnik; });
  const nama = umkm ? umkm.NamaUMKM : kodeUnik;

  const pesan = jadikanAktif
    ? 'Aktifkan kembali <b>' + esc(nama) + '</b>? UMKM ini akan kembali dihitung di Dashboard Utama.'
    : 'Nonaktifkan <b>' + esc(nama) + '</b>?<br><br>Seluruh datanya <b>tetap tersimpan</b> dan tidak ada yang dihapus — ' +
      'UMKM ini hanya tidak lagi dihitung pada widget Total UMKM (Aktif) di Dashboard.';

  showConfirm(pesan, function () {
    closeModal('modalConfirm');
    panggilServerAman('setStatusAktifUMKM', [kodeUnik, !!jadikanAktif], function (res) {
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        // Perbarui cache lokal agar tabel langsung ikut berubah
        if (umkm) umkm.StatusAktif = jadikanAktif ? 'Aktif' : 'Tidak Aktif';
        AppState.cache.dashboardOrganisasi = null;  // paksa dashboard hitung ulang
        renderMasterUmkmTabel(1);
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    }, function () {
      showToast('Error', 'Gagal mengubah status. Silakan coba lagi.', 'danger');
    });
  }, jadikanAktif ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan');
}


// ── Filter tahun pada Laporan CSR ──
let _laporanCsrKategori = '';
let _laporanCsrTahun = '';
let _laporanCsrIsAdmin = true;
function gantiTahunLaporanCsr(tahun) {
  // Tahun diingat supaya saringan kategori tidak menghapusnya, dan
  // sebaliknya — keduanya bisa dipakai bersamaan.
  _laporanCsrTahun = tahun || '';
  renderLaporanCsr(AppState.cache.laporanCsr || [], _laporanCsrIsAdmin, _laporanCsrTahun);
}

// ════════════════════════════════════════════════════════
// CLOSING PERIODE — Kunci Data Omset & Tenaga Kerja
// ════════════════════════════════════════════════════════
// Penguncian ditegakkan di SERVER. Tampilan di sini hanya cerminannya,
// sehingga walau tombol disembunyikan, server tetap jadi penentu akhir.

/** Muat status closing lalu tampilkan panelnya. */
function muatPanelClosing(kodeUmkm, tahun, jenis, idArea) {
  const area = document.getElementById(idArea);
  if (!area || !kodeUmkm) return;
  panggilServerAman('getStatusClosing', [kodeUmkm, tahun], function (res) {
    if (!res.success) { area.innerHTML = ''; return; }
    renderPanelClosing(kodeUmkm, tahun, jenis, idArea, res.data);
  }, function () { area.innerHTML = ''; });
}

const PENANDA_CLOSING_GLOBAL = '__SEMUA_UMKM__';

function renderPanelClosing(kodeUmkm, tahun, jenis, idArea, status) {
  const area = document.getElementById(idArea);
  if (!area) return;
  const terkunci = jenis === 'Omset' ? status.omset : status.tenagaKerja;
  const olehAdminSerentak = jenis === 'Omset' ? status.globalOmset : status.globalTenagaKerja;
  const isAdmin = AppState.session.role === 'Admin';
  const labelData = jenis === 'Omset' ? 'omset' : 'tenaga kerja';

  // ── Sudah terkunci ──
  if (terkunci) {
    const sumber = olehAdminSerentak
      ? 'Dikunci serentak oleh Admin untuk <b>seluruh UMKM</b>.'
      : 'Dikunci oleh UMKM ini sendiri (self closing).';
    area.innerHTML =
      '<div class="panel mt-3" style="background:var(--pramandiri-bg);border-left:4px solid var(--pramandiri-accent);">' +
        '<div class="d-flex flex-between align-center" style="flex-wrap:wrap;gap:10px;">' +
          '<div style="font-size:13px;color:var(--pramandiri-text);">' +
            '<b><i class="bi bi-lock-fill"></i> Periode ' + tahun + ' sudah dikunci (closing).</b><br>' +
            '<span style="font-size:12px;">' + sumber + ' Data ' + labelData + ' tahun ini tidak dapat diubah lagi.' +
            (isAdmin ? '' : ' Hubungi Admin bila ada yang perlu diperbaiki.') + '</span>' +
          '</div>' +
          (isAdmin
            ? '<div class="d-flex gap-2" style="flex-wrap:wrap;">' +
                (olehAdminSerentak
                  ? '<button class="btn btn-outline btn-sm" onclick="bukaClosingPeriode(\'' + PENANDA_CLOSING_GLOBAL + '\',' + tahun + ',\'' + jenis + '\',\'' + idArea + '\')">' +
                    '<i class="bi bi-unlock"></i> Buka Kunci Semua</button>'
                  : '<button class="btn btn-outline btn-sm" onclick="bukaClosingPeriode(\'' + kodeUmkm + '\',' + tahun + ',\'' + jenis + '\',\'' + idArea + '\')">' +
                    '<i class="bi bi-unlock"></i> Buka Kunci UMKM Ini</button>') +
              '</div>'
            : '') +
        '</div></div>';
    return;
  }

  // ── Belum terkunci ──
  // UMKM  : hanya bisa mengunci datanya sendiri
  // Admin : bisa mengunci UMKM terpilih, ATAU seluruh UMKM sekaligus
  area.innerHTML =
    '<div class="panel mt-3" style="background:var(--canvas);">' +
      '<div class="d-flex flex-between align-center" style="flex-wrap:wrap;gap:10px;">' +
        '<div style="font-size:12.5px;flex:1;min-width:220px;">' +
          '<b>Closing Periode ' + tahun + '</b><br>' +
          '<span class="text-muted" style="font-size:11.5px;">' +
            (isAdmin
              ? 'Kunci data ' + labelData + ' tahun ' + tahun + '. Pilih <b>UMKM Ini</b> untuk mengunci satu UMKM saja, ' +
                'atau <b>Seluruh UMKM</b> untuk mengunci semuanya sekaligus di akhir tahun.'
              : 'Kunci data ' + labelData + ' tahun ' + tahun + ' bila pengisian Anda sudah lengkap sampai Desember. ' +
                'Setelah dikunci, data tidak dapat diubah lagi kecuali dibuka oleh Admin.') +
          '</span>' +
        '</div>' +
        '<div class="d-flex gap-2" style="flex-wrap:wrap;">' +
          '<button class="btn btn-outline btn-sm" onclick="lakukanClosing(\'' + kodeUmkm + '\',' + tahun + ',\'' + jenis + '\',\'' + idArea + '\')">' +
            '<i class="bi bi-lock"></i> ' + (isAdmin ? 'Closing UMKM Ini' : 'Closing Periode') + '</button>' +
          (isAdmin
            ? '<button class="btn btn-danger btn-sm" onclick="lakukanClosing(\'' + PENANDA_CLOSING_GLOBAL + '\',' + tahun + ',\'' + jenis + '\',\'' + idArea + '\')">' +
              '<i class="bi bi-lock-fill"></i> Closing Seluruh UMKM</button>'
            : '') +
        '</div>' +
      '</div></div>';
}

function lakukanClosing(kodeUmkm, tahun, jenis, idArea) {
  const labelData = jenis === 'Omset' ? 'omset' : 'tenaga kerja';
  const global = kodeUmkm === PENANDA_CLOSING_GLOBAL;
  showConfirm(
    (global
      ? 'Kunci data <b>' + labelData + ' tahun ' + tahun + '</b> untuk <b>SELURUH UMKM</b>?<br><br>' +
        'Setelah ini, <b>tidak ada satu pun UMKM</b> yang dapat mengubah data tahun ' + tahun + ' — ' +
        'dan Admin pun ikut terkunci sampai membukanya kembali.<br><br>' +
        'Gunakan ini hanya saat tutup tahun, setelah memastikan seluruh UMKM selesai mengisi.'
      : 'Kunci data <b>' + labelData + ' tahun ' + tahun + '</b>?<br><br>' +
        'Setelah dikunci, data tahun ini <b>tidak dapat diubah lagi</b> — termasuk oleh Admin, ' +
        'kecuali Admin membukanya kembali.<br><br>' +
        'Pastikan pengisian sudah lengkap sampai bulan Desember sebelum melanjutkan.'),
    function () {
      closeModal('modalConfirm');
      panggilServerAman('setClosing', [kodeUmkm, tahun, jenis], function (res) {
        if (res.success) {
          showToast('Berhasil', res.message, 'success');
          muatPanelClosing(kodeUmkm, tahun, jenis, idArea);
          // Muat ulang form agar kolom isian ikut terkunci
          if (jenis === 'Omset') muatFormOmset(kodeUmkm, tahun);
          else muatTabelTenagaKerja(kodeUmkm, tahun);
        } else {
          showToast('Gagal', res.message, 'danger');
        }
      }, function () { showToast('Error', 'Gagal melakukan closing.', 'danger'); });
    }, global ? 'Ya, Kunci Semua' : 'Ya, Kunci Periode');
}

function bukaClosingPeriode(kodeUmkm, tahun, jenis, idArea) {
  showConfirm(
    'Buka kembali kunci data tahun ' + tahun + '?<br><br>' +
    'Setelah dibuka, data tahun ini <b>dapat diubah kembali</b>. ' +
    'Sebaiknya dikunci ulang setelah perbaikan selesai.',
    function () {
      closeModal('modalConfirm');
      panggilServerAman('bukaClosing', [kodeUmkm, tahun, jenis], function (res) {
        if (res.success) {
          showToast('Berhasil', res.message, 'success');
          muatPanelClosing(kodeUmkm, tahun, jenis, idArea);
          if (jenis === 'Omset') muatFormOmset(kodeUmkm, tahun);
          else muatTabelTenagaKerja(kodeUmkm, tahun);
        } else {
          showToast('Gagal', res.message, 'danger');
        }
      }, function () { showToast('Error', 'Gagal membuka kunci.', 'danger'); });
    }, 'Ya, Buka Kunci');
}


/** Reset password seorang pengguna — hanya Admin. */
function resetPasswordUser(username) {
  const btn = document.getElementById('btnResetPassword');
  const baru = document.getElementById('fuPasswordBaru').value.trim();
  if (baru.length < 6) {
    showToast('Peringatan', 'Password baru minimal 6 karakter.', 'warning');
    return;
  }
  showConfirm(
    'Ganti password <b>' + esc(username) + '</b> menjadi:<br><br>' +
    '<code style="background:var(--canvas);padding:4px 8px;border-radius:5px;">' + esc(baru) + '</code><br><br>' +
    'Catat password ini sekarang — setelah disimpan, <b>tidak akan bisa dibaca lagi</b> ' +
    'karena tersimpan dalam bentuk terenkripsi.',
    function () {
      closeModal('modalConfirm');
      setBtnLoading(btn, 'Menerapkan...');
      panggilServerAman('resetPassword', [username, baru], function (res) {
        resetBtn(btn);
        if (res.success) {
          showToast('Berhasil', res.message, 'success');
          document.getElementById('fuPasswordBaru').value = '';
        } else {
          showToast('Gagal', res.message, 'danger');
        }
      }, function () {
        resetBtn(btn);
        showToast('Error', 'Gagal mengubah password.', 'danger');
      });
    }, 'Ya, Ganti Password');
}



/** Ganti saringan kategori pada Laporan CSR. */
function gantiKategoriLaporanCsr(kategori) {
  _laporanCsrKategori = kategori || '';
  renderLaporanCsr(AppState.cache.laporanCsr || [], _laporanCsrIsAdmin, _laporanCsrTahun);
}


/**
 * Ubah keterangan laporan tanpa mengunggah ulang berkasnya.
 *
 * Berkas PDF-nya sengaja TIDAK bisa diganti di sini — bila berkasnya
 * yang salah, lebih jelas mengunggah ulang lalu menghapus yang lama,
 * supaya tidak ada tautan yang menunjuk berkas berbeda dari keterangannya.
 */
function formUbahLaporan(f) {
  const body = `
    <div class="d-flex align-center gap-2 mb-3" style="background:var(--canvas);padding:10px 12px;border-radius:8px;">
      <i class="bi bi-file-earmark-pdf-fill" style="color:var(--pemula-text);font-size:18px;"></i>
      <div style="font-size:12.5px;"><b>${esc(f.NamaFile)}</b>
        <div class="text-muted" style="font-size:11px;">Berkas PDF tidak diubah — hanya keterangannya.</div></div>
    </div>
    <div class="grid grid-2">
      <div class="form-group"><label class="form-label">Bulan</label>
        <select class="form-select" id="ubBulan">${optionsHtml(BULAN_LIST, f.Bulan)}</select></div>
      <div class="form-group"><label class="form-label">Tahun</label>
        <input type="number" class="form-control" id="ubTahun" value="${esc(f.Tahun)}"></div>
    </div>
    <div class="form-group"><label class="form-label">Kategori Laporan</label>
      <select class="form-select" id="ubKategori">${optionsHtml(DAFTAR_KATEGORI_LAPORAN, f.Kategori || 'Lainnya')}</select></div>
    <div class="form-group"><label class="form-label">Nama Tampilan</label>
      <input class="form-control" id="ubNama" value="${esc(f.NamaFile)}"></div>
    <div class="form-group"><label class="form-label">Deskripsi Laporan</label>
      <textarea class="form-control" id="ubDeskripsi">${esc(f.DeskripsiLaporan || '')}</textarea></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="ubStatus">${optionsHtml(['Draft','Final','Archived'], f.Status || 'Final')}</select></div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal('modalGeneric')">Batal</button>
    <button class="btn btn-primary" id="btnUbahLap" onclick="simpanUbahLaporan('${esc(f.ID)}')">
      <i class="bi bi-check-lg"></i> Simpan Perubahan</button>`;
  openModal('modalGeneric', 'Ubah Keterangan Laporan', body, footer);
}

function simpanUbahLaporan(id) {
  const nama = document.getElementById('ubNama').value.trim();
  if (!nama) { showToast('Peringatan', 'Nama tampilan wajib diisi.', 'warning'); return; }

  const data = {
    ID: id,
    Bulan: document.getElementById('ubBulan').value,
    Tahun: Number(document.getElementById('ubTahun').value) || new Date().getFullYear(),
    Kategori: document.getElementById('ubKategori').value,
    NamaFile: nama,
    DeskripsiLaporan: document.getElementById('ubDeskripsi').value.trim(),
    Status: document.getElementById('ubStatus').value
  };

  const btn = document.getElementById('btnUbahLap');
  setBtnLoading(btn, 'Menyimpan...');
  panggilServerAman('updateLaporanCSR', [data], function (res) {
    resetBtn(btn);
    if (res.success) {
      closeModal('modalGeneric');
      showToast('Berhasil', 'Keterangan laporan berhasil diperbarui.', 'success');
      AppState.cache.laporanCsr = null;
      loadLaporanCsrAdmin();
    } else {
      showToast('Gagal', res.message || 'Gagal menyimpan perubahan.', 'danger');
    }
  }, function () {
    resetBtn(btn);
    showToast('Error', 'Gagal menyimpan perubahan.', 'danger');
  });
}
