# Panduan Pemasangan — Fitur Legalitas & Perbaikan Dashboard UMKM

Pembaruan ini menambahkan **tab Legalitas** (Admin & UMKM), menata ulang **Dashboard UMKM**, dan memperbaiki **bug input omset/tenaga kerja** di akun UMKM.

**Perkiraan waktu:** 15 menit
**Berkas yang dibutuhkan:** `Kode.gs` dan `sipuma-umkm.zip` yang baru

> ⚠️ Ada **satu langkah baru** yang tidak ada di pembaruan sebelumnya: menjalankan `siapkanSheetLegalitas` (langkah A3). Tanpa ini, tab Legalitas akan menampilkan error karena sheet-nya belum ada.

---

## BAGIAN A — Backend (Google Apps Script)

### A1. Buka project `SIPUMA API`
Buka https://script.google.com → pilih project **`SIPUMA API`**.

### A2. Ganti isi Kode.gs
1. Klik berkas **`Kode.gs`**
2. Klik di area kode → **Ctrl+A** → **Delete**
3. Salin **seluruh isi** berkas `Kode.gs` yang baru → **Ctrl+V**
4. **Ctrl+S** untuk menyimpan

### A3. Buat sheet Legalitas ⚠️ LANGKAH BARU
1. Pada dropdown fungsi di atas, pilih **`siapkanSheetLegalitas`**
2. Klik **Run**
3. Periksa **Execution log**, harus muncul:

```
✅ Sheet "Legalitas" berhasil dibuat.
```

> Kalau muncul `ℹ️ Sheet "Legalitas" sudah ada` — itu juga aman, berarti sudah pernah dibuat. Fungsi ini boleh dijalankan berkali-kali tanpa merusak data.

**Cara memastikan:** buka spreadsheet `DB_SIPUMA` Anda, harus ada tab baru bernama **Legalitas** dengan 11 kolom berlatar biru.

### A4. Deploy ulang ⚠️ WAJIB
1. **Deploy** → **Manage deployments**
2. Klik ikon **pensil (Edit)**
3. **Version** → pilih **New version**
4. **Deploy** → **Done**

> Tetap pilih **"Edit → New version"**, jangan "New deployment". URL `/exec` Anda tidak berubah, jadi `config.js` tidak perlu diubah alamatnya.

---

## BAGIAN B — Frontend (GitHub)

### B1. Ekstrak ZIP menimpa folder lama
Ekstrak `sipuma-umkm.zip` → salin isinya menimpa folder repo Anda → pilih **Replace semua**.

Ada **satu berkas baru** di pembaruan ini: `js/legalitas.js`. Pastikan ikut tersalin.

### B2. Isi kembali GAS_URL ⚠️ SELALU TERLEWAT
Buka `js/config.js` dengan Notepad. Baris paling atas:

```js
const GAS_URL = 'GANTI_DENGAN_URL_EXEC_ANDA';
```

Ganti dengan URL `/exec` Anda, lalu simpan.

> Ambil URL-nya dari: Apps Script → **Deploy → Manage deployments** → salin **Web app URL**.

### B3. Kirim ke GitHub
```bash
cd $HOME\Documents\sipuma-umkm
dir
```
Pastikan **`index.html`** terlihat di daftar. Lalu:

```bash
git add .
git commit -m "Tambah fitur Legalitas, perbaikan dashboard UMKM"
git push
```

Tunggu 1–2 menit, buka situs, tekan **Ctrl+Shift+R**.

---

## BAGIAN C — Pengujian Berurutan

Ikuti urutannya. Bila satu langkah gagal, berhenti dan kabari — jangan lanjut agar penyebabnya tidak tercampur.

### C1. Bug input UMKM (paling penting — ini yang tadi gagal)
1. Logout → login sebagai **salah satu UMKM**
2. **Update Omset** → isi omset satu bulan → **Simpan**
3. **Yang benar:** notifikasi hijau, data masuk ke tabel
4. **Update Tenaga Kerja** → isi jumlah → **Simpan** → harus berhasil juga

**Kalau masih muncul "Anda hanya dapat mengakses data usaha Anda sendiri"** → langkah A2 atau A4 belum berhasil. Ulangi keduanya.

### C2. Admin — tambah legalitas
1. Login sebagai **Admin** → tab **Legalitas UMKM** (di atas Catatan Prestasi)
2. **Tambah Legalitas** → pilih UMKM → jenis **NIB** → isi nomor
3. Isi **Tanggal Kadaluarsa** dengan tanggal **lebih dari 1 tahun** dari sekarang
4. **Simpan** → status harus muncul **Aktif** (hijau)

### C3. Uji ketiga aturan status
Tambahkan tiga data pada UMKM yang sama untuk menguji semua aturan:

| Isi tanggal kadaluarsa | Status yang benar |
|---|---|
| 2 tahun dari sekarang | **Aktif** (hijau) |
| 6 bulan dari sekarang | **Perlu Diperbarui** (kuning) |
| Tahun lalu (sudah lewat) | **Kadaluarsa** (merah) |
| Centang "seumur hidup" | **Aktif** (hijau) |

Perhatikan juga: saat mencentang **"Berlaku seumur hidup"**, kolom tanggal kadaluarsa otomatis terkunci.

### C4. Urutan & filter
- Daftar harus terurut **Kadaluarsa di atas**, lalu Perlu Diperbarui, lalu Aktif
- Coba **filter status** dan **kolom pencarian**
- Coba **Ubah** dan **Hapus** satu data

### C5. UMKM — lihat legalitasnya
1. Login sebagai UMKM yang tadi diberi data legalitas
2. Tab **Legalitas Usaha Saya** (di atas Profil Usaha Saya)
3. Harus tampil 3 kartu ringkasan + tabel
4. Kalau ada yang Perlu Diperbarui/Kadaluarsa → muncul **spanduk peringatan kuning**
5. Pastikan **hanya legalitas miliknya** yang terlihat (bukan UMKM lain)

### C6. Dashboard UMKM — tata letak baru
Masih di akun UMKM, buka **Dashboard Saya**:

- **Baris 1:** tiga widget sejajar dan sama tinggi — Status Kemandirian, Realisasi Omset, Status Legalitas
- Widget Kemandirian: Produksi / Pemasaran / Keuangan **bertumpuk ke bawah**, bukan menyamping
- Widget Legalitas: tiga angka (Aktif / Perbarui / Lewat) + daftar yang perlu perhatian
- Klik **"Lihat Detail Legalitas"** → harus pindah ke tab Legalitas

### C7. Grafik tenaga kerja
- **Baris 2:** dua grafik bersebelahan
- Kanan = **grafik batang** tenaga kerja per bulan (ungu)
- Di bawahnya tertulis jumlah bulan terakhir

### C8. Catatan hasil asesmen
- **Baris 3:** panel **Catatan Hasil Asesmen**
- Berisi catatan Pilar Produksi, Pemasaran, Keuangan, dan Rekomendasi Program
- Paling bawah: **nama asesor**

> Panel ini **hanya muncul bila ada isinya**. Kalau UMKM tersebut belum pernah diasesmen atau catatannya kosong, panel tidak ditampilkan — itu memang disengaja, bukan error.

---

## Setelah Berhasil

Periksa juga akun **CSR UT** sekilas — pastikan tidak ada yang rusak akibat pembaruan ini (dashboard dan tab-tabnya).

### Yang masih ditahan

```
kosongkanPasswordTeksBiasa()
```

**Belum boleh dijalankan.** Fungsi ini mematikan SIPUMA versi lama secara permanen. Tunggu sampai versi baru terpakai normal beberapa hari.

### Saran perawatan

Bila sudah stabil, pasang pembersih sesi otomatis agar sheet `Sesi` tidak menumpuk:
**Triggers** → **Add Trigger** → fungsi `bersihkanSesiKedaluwarsa` → **Time-driven** → **Day timer**

---

## Bila Ada Masalah

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Tab Legalitas error / kosong terus | Sheet belum dibuat | Ulangi langkah A3 |
| "Anda hanya dapat mengakses data usaha Anda sendiri" saat simpan | `Kode.gs` lama masih terpakai | Ulangi A2 lalu A4 |
| Tab Legalitas tidak muncul di menu | `legalitas.js` tidak tersalin | Cek folder `js/`, lalu push ulang |
| "Alamat server belum dikonfigurasi" | `GAS_URL` tertimpa ZIP | Ulangi B2 |
| Status legalitas terasa salah | Tanggal kadaluarsa salah isi | Buka Ubah, periksa tanggalnya |
| Widget Legalitas kosong di dashboard | UMKM itu memang belum punya data | Tambahkan dulu dari akun Admin |
| Catatan Asesmen tidak muncul | Belum pernah diasesmen / catatan kosong | Normal — isi dulu dari tab Asesmen Kemandirian |
| Tampilan lama masih muncul | Cache browser | Ctrl+Shift+R atau Incognito |

**Mengambil keterangan error:** tekan **F12** → tab **Console** → salin tulisan merah.
