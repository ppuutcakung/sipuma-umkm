// ════════════════════════════════════════════════════════
// KONFIGURASI SIPUMA
// ════════════════════════════════════════════════════════
// ⚠️ WAJIB DIISI SEBELUM PUSH PERTAMA KE GITHUB.
// Tempel URL Web App Apps Script Anda (yang berakhiran /exec) di bawah ini.
// Cara mendapatkannya: Apps Script Editor → Deploy → Manage Deployments →
// salin "Web app URL".
//
// Kalau baris ini masih berisi 'GANTI_DENGAN_URL_EXEC_ANDA', aplikasi akan
// menampilkan peringatan dan tidak akan mencoba menghubungi server.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw96R4kj6zWvXG74W7S50gNWdWSs9u-gMVKslPXn7rIxmaPm4JlT5ccRAARtTEeojQjpg/exec';

// ── Konstanta aplikasi (disamakan dengan backend) ──
const SEKTOR_LIST = ['Kuliner', 'Kerajinan', 'Pertanian', 'Manufaktur'];

const BULAN_LIST = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const KATEGORI_PRESTASI = [
  'Peningkatan Omset',
  'Penyerapan Tenaga Kerja',
  'Inovasi Produk',
  'Perluasan Pasar',
  'Sertifikasi / Legalitas',
  'Penghargaan Eksternal',
  'Lainnya'
];

const TIER_LIST = ['Pemula', 'Madya', 'Pra Mandiri', 'Mandiri'];

// Kunci penyimpanan sesi di browser
const KUNCI_SESI = 'sipuma_sesi_v3';

// ════════════════════════════════════════════════════════
// STATE APLIKASI
// ════════════════════════════════════════════════════════
const AppState = {
  session: null,        // { token, username, role, idUmkm, fotoURL, alamat }
  config: {},           // konfigurasi dari server (tahunAktif, target, dll)
  currentSection: null,
  cabangDipilih: null,      // cabang yang sedang dilihat (peran lintas cabang)
  daftarCabang: [],         // daftar cabang untuk pemilih di topbar
  cache: {
    umkm: null,
    users: null,
    omsetAll: null,
    tenagaKerjaAll: null,
    kemandirianAll: null,
    kemandirianPerUmkm: {},
    tenagaKerjaPerUmkmTahun: {},
    fasilitasi: null,
    prestasi: null,
    laporanCsr: null,
    dashboardOrganisasi: null,
    legalitas: null
  }
};

/** Kosongkan seluruh cache data (dipakai saat logout). */
function resetCache() {
  AppState.cache = {
    umkm: null, users: null, omsetAll: null, tenagaKerjaAll: null,
    kemandirianAll: null, kemandirianPerUmkm: {}, tenagaKerjaPerUmkmTahun: {},
    fasilitasi: null, prestasi: null, laporanCsr: null, dashboardOrganisasi: null, legalitas: null
  };
}

// ── Daftar menu per peran ──
const MENU_PER_ROLE = {
  Admin: [
    { id: 'dashboard',          label: 'Dashboard Utama',        icon: 'bi-grid-1x2-fill' },
    { id: 'masterUmkm',         label: 'Data Master UMKM',       icon: 'bi-building' },
    { id: 'omset',              label: 'Input & Monitoring Omset', icon: 'bi-graph-up-arrow' },
    { id: 'tenagaKerja',        label: 'Input Tenaga Kerja',     icon: 'bi-people-fill' },
    { id: 'kemandirian',        label: 'Asesmen Kemandirian',    icon: 'bi-award-fill' },
    { id: 'fasilitasi',         label: 'Fasilitasi Pemasaran',   icon: 'bi-megaphone-fill' },
    { id: 'legalitas',          label: 'Legalitas UMKM',         icon: 'bi-patch-check-fill', badge: 'Baru' },
    { id: 'prestasi',           label: 'Catatan Prestasi UMKM',  icon: 'bi-star-fill' },
    { id: 'fileLaporan',        label: 'Laporan CSR (PDF)',      icon: 'bi-file-earmark-pdf-fill' },
    { id: 'userAkses',          label: 'Manajemen User & Akses', icon: 'bi-shield-lock-fill' }
  ],
  UT: [
    { id: 'dashboard',          label: 'Dashboard Ringkasan',    icon: 'bi-grid-1x2-fill' },
    { id: 'omsetUT',            label: 'Omset UMKM',             icon: 'bi-graph-up' },
    { id: 'tenagaKerjaUT',      label: 'Tenaga Kerja UMKM',      icon: 'bi-people-fill' },
    { id: 'fasilitasiUT',       label: 'Fasilitasi Pemasaran UMKM', icon: 'bi-megaphone-fill' },
    { id: 'performaTerbaik',    label: 'Performa UMKM Terbaik',  icon: 'bi-star-fill' },
    { id: 'fileLaporan',        label: 'File Laporan PPU',       icon: 'bi-file-earmark-pdf-fill' }
  ],
  UMKM: [
    { id: 'dashboard',          label: 'Dashboard Saya',         icon: 'bi-grid-1x2-fill' },
    { id: 'updateOmset',        label: 'Update Omset',           icon: 'bi-graph-up-arrow', badge: 'Baru' },
    { id: 'updateTenagaKerja',  label: 'Update Tenaga Kerja',    icon: 'bi-people-fill' },
    { id: 'fasilitasiSaya',     label: 'Fasilitasi Pemasaran',   icon: 'bi-megaphone-fill' },
    { id: 'legalitasSaya',      label: 'Legalitas Usaha Saya',   icon: 'bi-patch-check-fill', badge: 'Baru' },
    { id: 'profilSaya',         label: 'Profil Usaha Saya',      icon: 'bi-shop' },
    { id: 'bantuan',            label: 'Bantuan & Support',      icon: 'bi-question-circle-fill' }
  ]
};
