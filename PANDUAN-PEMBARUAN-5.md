# Panduan Pemasangan — Filter Status, Backup, Closing Global & Ekspor Aman

**Waktu:** ± 12 menit · **Berkas diganti:** 1 backend + 3 frontend

| No | Perubahan |
|---|---|
| 1 | Filter **Aktif / Tidak Aktif** di Data Master UMKM |
| 2 | Ekspor Excel & PDF di tab **Omset UMKM** (akun CSR UT) |
| 3 | Kolom **Kode Unik dibuang** dari semua berkas unduhan |
| 4 | **Unduh Cadangan (Backup)** data di tab Pengaturan |
| 5 | **Closing global** oleh Admin + keterangan sumber penguncian |

---

## DAFTAR BERKAS YANG DIGANTI

| Berkas | Lokasi |
|---|---|
| `Kode.gs` | Apps Script |
| `js/halaman.js` | repo |
| `js/ekspor.js` | repo |
| `js/app.js` | repo |

> `index.html`, `config.js`, `dashboard.js`, `legalitas.js` **tidak berubah** — tidak perlu disentuh.

---

## BAGIAN A — Backend

1. Buka project **`SIPUMA API`** → berkas **`Kode.gs`** → **Ctrl+A** → **Delete** → tempel isi baru → **Ctrl+S**
2. **Deploy** → **Manage deployments** → ikon **pensil** → **Version: New version** → **Deploy** → **Done**

> Tidak ada sheet baru kali ini — tidak perlu menjalankan fungsi penyiapan apa pun.

## BAGIAN B — Frontend

Salin 3 berkas ke folder `js/` di repo Anda, lalu:

```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Filter status UMKM, backup data, closing global, ekspor tanpa kode unik"
git push
```

Tunggu 1–2 menit → **Ctrl+Shift+R**

---

## BAGIAN C — Pengujian

### C1. Filter status UMKM
**Admin** → **Data Master UMKM** → ada pemilih baru **Semua Status / Hanya Aktif / Hanya Tidak Aktif**.
Coba ketiganya, dan gabungkan dengan filter Sektor serta kolom pencarian.

### C2. Ekspor di Omset UMKM (CSR UT)
Login **CSR UT** → **Omset UMKM** → tombol **Excel** dan **PDF** ada di samping pemilih Tahun.
Ganti tahun lebih dulu, lalu ekspor — isinya harus mengikuti tahun yang dipilih.

### C3. Kode Unik tidak ikut terunduh ⚠️ penting
Unduh Excel dari **kelima** tab (Data Master, Omset, Tenaga Kerja, Asesmen, Legalitas).
Pastikan **tidak ada kolom Kode Unik** di semua berkas.

> Ini disengaja: kode unik adalah password login UMKM. Kalau ikut terunduh, berkas yang beredar bisa dipakai masuk ke akun UMKM.

### C4. Unduh Cadangan
**Admin** → **Pengaturan Akun** → panel **Cadangan Data (Backup)**

1. Klik **Unduh Cadangan (Excel)** → buka berkasnya → harus ada **banyak lembar** (DataMasterUMKM, OmsetBulanan, TenagaKerja, dll)
2. Klik **Unduh Cadangan (JSON)** → berkas `.json` terunduh
3. **Buka lembar UserCredentials di berkas Excel** → pastikan **tidak ada kolom** `PasswordHash`, `Salt`, maupun `KodeUnik`

### C5. Self closing oleh UMKM
1. Login **UMKM** → **Update Omset**
2. Panel closing menampilkan keterangan: *"Kunci data omset tahun ... bila pengisian Anda sudah lengkap..."*
3. Klik **Closing Periode** → setelah terkunci, keterangannya berbunyi **"Dikunci oleh UMKM ini sendiri (self closing)"**
4. Cek juga di **Update Tenaga Kerja** — panelnya serupa

### C6. Closing global oleh Admin
1. Login **Admin** → **Input & Monitoring Omset** → pilih UMKM mana pun
2. Ada **dua tombol**: **Closing UMKM Ini** dan **Closing Seluruh UMKM** (merah)
3. Klik **Closing Seluruh UMKM** → baca konfirmasinya → setujui
4. Pilih **UMKM lain** → panelnya harus menampilkan **"Dikunci serentak oleh Admin untuk seluruh UMKM"**
5. Login sebagai **UMKM mana pun** → coba simpan omset → harus **ditolak**

### C7. Buka kunci global
1. Kembali ke **Admin** → panel hijau menampilkan tombol **Buka Kunci Semua**
2. Klik → seluruh UMKM dapat mengisi lagi
3. Pastikan UMKM yang tadi melakukan **self closing tetap terkunci** — membuka kunci global tidak ikut membatalkan penguncian mandiri

> Dua lapis ini memang terpisah: kunci global milik Admin, kunci mandiri milik UMKM. Keduanya harus dibuka sendiri-sendiri.

---

## Bila Ada Masalah

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Tombol Closing Seluruh UMKM tidak ada | Masuk sebagai non-Admin | Login sebagai Admin |
| UMKM masih bisa simpan padahal sudah closing global | Deploy belum diperbarui | Ulangi Bagian A langkah 2 |
| Kode Unik masih muncul di unduhan | `ekspor.js` belum tersalin | Cek berkasnya, push ulang |
| Cadangan Excel hanya satu lembar | Dibuka di aplikasi yang tak mendukung | Buka dengan Excel / WPS / LibreOffice |
| Panel backup tidak muncul | `app.js` belum tersalin | Cek berkasnya, push ulang |
| Filter status tidak ada | `halaman.js` belum tersalin | Cek berkasnya, push ulang |

**Keterangan error:** **F12** → **Console** → salin tulisan merah.

---

## Yang Masih Ditahan

`kosongkanPasswordTeksBiasa()` — tetap belum dijalankan sampai seluruh fitur terpakai normal beberapa hari.
