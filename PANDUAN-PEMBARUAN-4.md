# Panduan Pemasangan — Periode, Closing, Ekspor & Filter Tahun

**Waktu:** ± 15 menit
**Berkas yang diganti:** 1 backend + 6 frontend (`index.html` ikut berubah karena ada berkas baru)

## Yang dikerjakan
| No | Perubahan |
|---|---|
| 1 | Tahun dihapus dari semua judul widget — mengacu pada filter Tahun Data |
| 1b | Filter Tahun Data ditambahkan di dashboard **CSR UT** dan **UMKM** |
| 2 | Ekspor **Excel & PDF** di 5 tab (berlaku untuk Admin & CSR UT) |
| 3 | **Closing periode** — kunci data omset & tenaga kerja |
| 4 | **Pengaturan Periode Aktif** di akun Admin |
| 5 | Filter tahun di tab **Laporan CSR** |

---

## DAFTAR BERKAS YANG DIGANTI

| Berkas | Lokasi | Keterangan |
|---|---|---|
| `Kode.gs` | Apps Script | |
| `index.html` | root repo | ada berkas skrip baru |
| `js/ekspor.js` | repo | **BERKAS BARU** |
| `js/dashboard.js` | repo | |
| `js/halaman.js` | repo | |
| `js/legalitas.js` | repo | |
| `js/app.js` | repo | |

> **`js/config.js` tidak diganti** — `GAS_URL` Anda tetap aman.

---

## BAGIAN A — Backend

### A1. Ganti Kode.gs
Buka project **`SIPUMA API`** → berkas **`Kode.gs`** → **Ctrl+A** → **Delete** → tempel isi baru → **Ctrl+S**

### A2. Buat sheet PeriodeClosing ⚠️ LANGKAH BARU
1. Pilih fungsi **`siapkanSheetClosing`** → **Run**
2. Log harus menampilkan:
```
✅ Sheet "PeriodeClosing" berhasil dibuat.
```

> Aman dijalankan ulang. Data lama tidak tersentuh.

### A3. Deploy ulang ⚠️ WAJIB
**Deploy** → **Manage deployments** → ikon **pensil** → **Version: New version** → **Deploy** → **Done**

---

## BAGIAN B — Frontend

### B1. Salin berkas
Dari ZIP, timpa berkas-berkas ini di folder repo Anda:
```
index.html
js/ekspor.js        ← berkas baru
js/dashboard.js
js/halaman.js
js/legalitas.js
js/app.js
```

### B2. Kirim ke GitHub
```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Periode aktif, closing, ekspor Excel/PDF, filter tahun"
git push
```
Tunggu 1–2 menit → buka situs → **Ctrl+Shift+R**

---

## BAGIAN C — Pengujian

### C1. Judul tanpa tahun
Login **Admin** → Dashboard. Pastikan judul-judul ini **tidak lagi mencantumkan angka tahun**:
- "Tren Omset Bulanan" (bukan "...2026")
- "Perkembangan Tenaga Kerja"
- "Total Omset (YTD)"
- "Target: Rp ..." pada widget Fasilitasi

Ganti **Tahun Data** ke tahun lain → angka berubah, judul tetap bersih.

### C2. Filter tahun di CSR UT & UMKM
- Login **CSR UT** → Dashboard → harus ada **Tahun Data** di kanan atas
- Login **UMKM** → Dashboard Saya → juga harus ada, dan pilihan tahunnya sesuai data usaha itu sendiri

### C3. Ekspor Excel
Login **Admin**, coba di setiap tab berikut — klik tombol **Excel**:

| Tab | Letak tombol |
|---|---|
| Data Master UMKM | kanan atas, samping "Tambah UMKM" |
| Input & Monitoring Omset | panel "Rekap Omset Seluruh UMKM" |
| Input Tenaga Kerja | panel "Rekap Tenaga Kerja Seluruh UMKM" |
| Asesmen Kemandirian | panel "Rekap Kelas Kemandirian UMKM" |
| Legalitas UMKM | kanan atas, samping "Tambah Legalitas" |

Buka berkas hasil unduhan, periksa:
- Baris 1: **judul sesuai tab**, di tengah
- Baris 2: **PPU UT Cakung**, di tengah
- Baris 3: **Periode Download: <tanggal & jam>**, di tengah
- Judul kolom berlatar biru, lebar kolom proporsional, isi tidak menumpuk

### C4. Ekspor PDF
Klik tombol **PDF** pada salah satu tab. Jendela cetak akan terbuka.
- Pada **Destination/Tujuan**, pilih **Save as PDF**
- Tabel dengan kolom banyak otomatis **mendatar (landscape)**
- Judul kolom **berulang di tiap halaman**

> Kalau tidak ada jendela terbuka, browser memblokir pop-up. Izinkan pop-up untuk situs ini, lalu ulangi.

### C5. Ekspor dari akun CSR UT
Login **CSR UT** → tab Omset UMKM, Tenaga Kerja UMKM → tombol ekspor harus ada dan berfungsi sama.

### C6. Closing Periode ⚠️ uji dengan hati-hati
1. Login **UMKM** → **Update Omset**
2. Di bawah tombol Simpan, muncul panel **"Closing Periode"**
3. Klik **Closing Periode** → baca konfirmasinya → **Ya, Kunci Periode**
4. Panel berubah jadi hijau: *"Periode ... sudah dikunci"*
5. Coba **Simpan Omset** lagi → harus **ditolak** dengan pesan bahwa data sudah dikunci

### C7. Penguncian berlaku juga untuk Admin
1. Login **Admin** → **Input & Monitoring Omset** → pilih UMKM yang tadi dikunci
2. Coba simpan → harus **ditolak juga**
3. Ini disengaja: closing mengunci data bagi semua orang

### C8. Buka kunci (hanya Admin)
1. Masih di akun Admin, pada panel hijau ada tombol **Buka Kunci**
2. Klik → konfirmasi → panel kembali ke keadaan semula
3. Coba simpan → sekarang berhasil lagi

> Tombol **Buka Kunci tidak muncul** di akun UMKM — memang disengaja.

### C9. Periode Aktif
1. Login **Admin** → **Pengaturan Akun**
2. Panel paling atas: **Periode Aktif Aplikasi**
3. Pilih tahun berikutnya (misal 2027) → **Terapkan Periode**
4. Buka Dashboard → tahun bawaan kini 2027, kolom isian siap untuk tahun itu
5. **Penting:** ganti **Tahun Data** kembali ke 2026 → **data lama harus masih utuh**

### C10. Yang tidak boleh terpengaruh periode
Setelah mengganti periode, pastikan tetap normal dan lengkap:
- Data Master UMKM
- Asesmen Kemandirian
- Legalitas UMKM
- Manajemen User & Akses
- Pengaturan

### C11. Filter Laporan CSR
Tab **Laporan CSR** → ada pemilih **Tahun Data** di kanan atas, berisi "Semua Tahun" + tahun yang punya laporan.

---

## Catatan Penting soal Closing

**Closing ditegakkan di server, bukan sekadar menyembunyikan tombol.** Artinya walau seseorang mencoba mengirim data lewat cara lain, server tetap menolak. Ini juga berarti:

- Menghapus riwayat omset yang sudah dikunci **juga ditolak**
- Hanya Admin yang dapat membuka kunci
- Closing bersifat **per UMKM per tahun per jenis data** — mengunci omset tidak otomatis mengunci tenaga kerja

**Saran:** sebelum mengunci secara luas, coba dulu pada **satu UMKM uji** dan pastikan alur buka-kuncinya berjalan, agar Anda yakin bisa memulihkannya bila ada salah input.

---

## Bila Ada Masalah

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Tombol ekspor tidak muncul | `ekspor.js` belum tersalin / `index.html` lama | Cek `js/ekspor.js` ada, push ulang |
| Panel closing tidak muncul | Sheet belum dibuat | Ulangi A2 lalu A3 |
| PDF tidak terbuka | Pop-up diblokir | Izinkan pop-up untuk situs ini |
| Excel terbuka berantakan | Dibuka di aplikasi tak sesuai | Buka dengan Excel / WPS / LibreOffice |
| Judul masih ada tahun | Cache browser | Ctrl+Shift+R |
| Data hilang setelah ganti periode | Seharusnya tidak terjadi | Ganti Tahun Data kembali; bila tetap hilang, kabari saya segera |
| Tidak bisa simpan padahal belum closing | Periode terkunci di tahun lain | Cek panel closing pada tahun yang sedang dipilih |

**Mengambil keterangan error:** **F12** → tab **Console** → salin tulisan merah.

---

## Yang Masih Ditahan

`kosongkanPasswordTeksBiasa()` — belum boleh dijalankan sampai seluruh fitur baru ini terpakai normal beberapa hari.
