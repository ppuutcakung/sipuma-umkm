# Panduan — Perbaikan Username Stakeholder & Header Admin

**Waktu:** ± 10 menit · **Berkas:** 1 backend + 2 frontend

---

## Penjelasan Masalah yang Anda Temukan

Username diganti, muncul pesan berhasil, tapi ternyata **tidak tersimpan** dan sesi Anda malah terputus.

Penyebabnya: server **masih mengunci** username untuk akun sistem, sedangkan tampilannya sudah saya buka. Jadi:
- Nama baru yang Anda ketik diabaikan server
- Pesan sukses tetap muncul dan menyatakan username berubah — padahal tidak
- Sesi ikut diakhiri karena dikira ada perubahan

Sesuai keputusan Anda, username kini **dikunci kembali** — di tampilan **dan** di server, supaya keduanya sejalan. Penggantian nama dilakukan sekali lewat kode.

---

## BERKAS YANG DIGANTI

| Berkas | Lokasi |
|---|---|
| `Kode.gs` | Apps Script |
| `js/app.js` | repo |
| `js/halaman.js` | repo |

---

## BAGIAN A — Backend

### A1. Ganti Kode.gs
Project **`SIPUMA API`** → `Kode.gs` → **Ctrl+A** → **Delete** → tempel isi baru → **Ctrl+S**

### A2. Ganti username Stakeholder
1. Pilih fungsi **`gantiUsernameStakeholder`** → **Run**
2. Log yang benar:
```
✅ Username Stakeholder diubah: "Tim CSR UT" → "Tim CSR"
   Password TIDAK berubah — tetap yang terakhir Anda tetapkan.
   Sesi lama diakhiri; login ulang memakai username baru.
```

> **Password tidak tersentuh.** Password baru yang tadi Anda buat tetap berlaku.

> Bila suatu saat ingin nama lain, buka `Kode.gs`, cari baris `const NAMA_BARU = 'Tim CSR';` di dalam fungsi itu, ubah nilainya, simpan, lalu jalankan ulang.

### A3. Deploy ulang
**Deploy** → **Manage deployments** → **pensil** → **Version: New version** → **Deploy** → **Done**

---

## BAGIAN B — Frontend

Salin `js/app.js` dan `js/halaman.js`, lalu:

```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Kunci username akun sistem, header Admin PPU/LPB"
git push
```

Tunggu 1–2 menit → **Ctrl+Shift+R**

---

## BAGIAN C — Pengujian

### C1. Login dengan username baru ⚠️ paling penting
1. Logout
2. Tab **Stakeholder** → username **`Tim CSR`** → password yang tadi Anda buat
3. Harus **berhasil masuk**

> Bila gagal: buka sheet `UserCredentials` di `DB_SIPUMA`, periksa isi kolom Username pada baris berperan `UT`.

### C2. Header Admin
Login **Admin** → header kiri atas kini berbunyi **UMKM Binaan PPU/LPB**

### C3. Username terkunci & keterangannya jujur
1. **Manajemen User & Akses** → **Edit** akun Stakeholder
2. Kolom Username **tidak dapat diubah**, dengan keterangan bahwa penggantian dilakukan lewat Apps Script
3. Ubah **Catatan** saja → **Simpan** → tersimpan normal tanpa klaim keliru

### C4. Reset password masih berfungsi
Pada form Edit yang sama, panel **Reset Password** tetap bisa dipakai untuk semua akun.

### C5. Akun Stakeholder tetap netral
Login sebagai Stakeholder, pastikan masih seperti sebelumnya: **UMKM Binaan**, **Panel Pemantauan Program**, lencana **Stakeholder**, tagline **read-only**.

---

## Keamanan — Tidak Ada yang Berkurang

| Lapisan | Keadaan |
|---|---|
| Password | SHA-256 + salt, tidak terbaca siapa pun |
| Sesi | Token 5 jam, diverifikasi server tiap permintaan |
| Hak akses | Per peran; UMKM hanya datanya sendiri |
| Brute-force | 5 kali gagal → terkunci 15 menit |
| Username akun sistem | Dikunci di tampilan **dan** server |
| Akun sistem | Tidak dapat dihapus (berdasarkan peran) |
| Ekspor & cadangan | Tanpa Kode Unik, tanpa password |

Perubahan ini justru **menutup satu celah**: sebelumnya server bisa melaporkan keberhasilan yang tidak sesuai kenyataan. Laporan seperti itu berbahaya karena membuat pengelola mengira perubahan sudah berlaku.

---

## Bila Ada Masalah

| Yang terlihat | Solusi |
|---|---|
| Tidak bisa login dengan `Tim CSR` | Periksa sheet `UserCredentials`, kolom Username baris peran `UT` |
| Log A2: "Akun peran UT tidak ditemukan" | Peran di sheet mungkin tertulis lain — kabari saya |
| Log A2: "sudah dipakai akun lain" | Pilih nama lain di `NAMA_BARU` |
| Header Admin belum berubah | Ctrl+Shift+R; pastikan `app.js` tersalin |
| Kolom Username masih bisa diketik | `halaman.js` belum tersalin — push ulang |

---

`kosongkanPasswordTeksBiasa()` tetap **belum dijalankan** sampai masa uji pakai selesai.
