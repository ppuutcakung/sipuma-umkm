# Panduan Pemasangan — Perbaikan Riwayat Omset, Widget & Legalitas

**Waktu:** ± 10 menit
**Berkas yang diganti:** hanya **4 berkas** (2 backend-langkah, 3 berkas frontend)

## Yang diperbaiki
| No | Perbaikan |
|---|---|
| 1 | **Bug:** Riwayat Tahunan Omset kosong di akun UMKM |
| 2 | Widget Realisasi Omset — angka 2× lebih besar, target & status rata di dasar |
| 3 | Jenis legalitas **"Lainnya"** → muncul kolom ketik manual |
| 4 | Nomor legalitas dikunci sebagai teks (tidak berubah jadi tanggal) |

---

## DAFTAR BERKAS YANG DIGANTI

Hanya berkas berikut yang berubah. **Berkas lain tidak perlu disentuh.**

| Berkas | Lokasi |
|---|---|
| `Kode.gs` | Apps Script |
| `js/dashboard.js` | Repo GitHub |
| `js/halaman.js` | Repo GitHub |
| `js/legalitas.js` | Repo GitHub |

---

## BAGIAN A — Backend

### A1. Ganti Kode.gs
1. Buka https://script.google.com → project **`SIPUMA API`**
2. Klik berkas **`Kode.gs`** → **Ctrl+A** → **Delete**
3. Tempel isi `Kode.gs` yang baru → **Ctrl+S**

### A2. Kunci kolom nomor legalitas
1. Pilih fungsi **`siapkanSheetLegalitas`** dari dropdown → **Run**
2. Periksa Execution log, harus muncul:

```
ℹ️  Sheet "Legalitas" sudah ada, tidak dibuat ulang.
✅ Kolom NomorLegalitas dikunci sebagai teks (nomor tidak akan diubah otomatis).
```

> Aman dijalankan ulang — **data legalitas yang sudah ada tidak terhapus**. Fungsi ini hanya mengubah format kolom.

### A3. Deploy ulang ⚠️ WAJIB
**Deploy** → **Manage deployments** → ikon **pensil** → **Version: New version** → **Deploy** → **Done**

---

## BAGIAN B — Frontend

### B1. Salin 3 berkas saja
Dari ZIP, ambil **hanya** ketiga berkas ini dan timpa yang lama di folder repo Anda:

```
js/dashboard.js
js/halaman.js
js/legalitas.js
```

> **`js/config.js` JANGAN disentuh** kali ini — dengan begitu `GAS_URL` Anda tetap aman dan tidak perlu diisi ulang.

### B2. Kirim ke GitHub
```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Perbaikan riwayat omset UMKM, widget omset, jenis legalitas lainnya"
git push
```

Tunggu 1–2 menit → buka situs → **Ctrl+Shift+R**.

---

## BAGIAN C — Pengujian

### C1. Riwayat Tahunan Omset (bug utama)
1. Login sebagai **UMKM**
2. **Update Omset** → lihat panel **Riwayat Tahunan Omset Saya**
3. **Yang benar:** tabel terisi data omset tahun-tahun sebelumnya

**Kalau masih kosong:** buka **F12 → Console**, lihat apakah ada pesan penolakan. Kirimkan ke saya.

### C2. Widget Realisasi Omset
Buka **Dashboard Saya**, perhatikan widget tengah:
- Angka rupiah **jauh lebih besar** dari sebelumnya
- Baris "dari target Rp..." dan lencana **Tercapai/Belum Tercapai** berada di **paling dasar** widget
- Sejajar dengan baris "Dinilai ..." pada widget Status Kemandirian di kirinya

### C3. Jenis legalitas "Lainnya"
1. Login **Admin** → **Legalitas UMKM** → **Tambah Legalitas**
2. Pada **Jenis Legalitas**, pilih **Lainnya**
3. **Yang benar:** muncul kolom kosong di bawahnya, kursor otomatis masuk ke situ
4. Ketik jenis bebas, misalnya `Sertifikat SNI`
5. Lengkapi lalu **Simpan** → di tabel harus tertulis `Sertifikat SNI`
6. Klik **Ubah** pada data itu → dropdown harus otomatis kembali ke **Lainnya**, dan kolom manual sudah terisi

### C4. Nomor legalitas dengan karakter khusus
Tambah legalitas dengan nomor yang mengandung kombinasi, misalnya:

```
NIB-1234/PIRT_2024
12/2024
0012345
```

Simpan, lalu **buka spreadsheet `DB_SIPUMA` tab Legalitas**. Periksa kolom Nomor:
- `12/2024` harus tetap `12/2024` — **bukan** berubah jadi tanggal
- `0012345` harus tetap ada **nol di depannya**

> Kalau data lama Anda sudah terlanjur berubah jadi tanggal sebelum perbaikan ini, perbaiki manual di spreadsheet atau lewat tombol Ubah di aplikasi.

### C5. Pastikan tidak ada yang rusak
Buka sekilas akun **Admin** (Data Master, Omset, Legalitas) dan **CSR UT** (Dashboard) — pastikan semua masih normal.

---

## Bila Ada Masalah

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Riwayat omset masih kosong | Deploy belum diperbarui | Ulangi A3 |
| Kolom "Lainnya" tidak muncul | `legalitas.js` belum tersalin | Cek folder `js/`, push ulang |
| "Alamat server belum dikonfigurasi" | `config.js` ikut tertimpa | Isi ulang `GAS_URL`, push lagi |
| Nomor legalitas masih berubah | Langkah A2 terlewat | Ulangi A2 lalu A3 |
| Tampilan widget belum berubah | Cache browser | Ctrl+Shift+R atau Incognito |

**Mengambil keterangan error:** **F12** → tab **Console** → salin tulisan merah.

---

## Catatan

Yang masih ditahan — **`kosongkanPasswordTeksBiasa()`** belum boleh dijalankan sampai ketiga peran terpakai normal beberapa hari.
