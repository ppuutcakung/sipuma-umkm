# Panduan Finalisasi SIPUMA

Panduan penutup migrasi. Berisi **1 perbaikan penting** yang harus dipasang lebih dulu, lalu langkah-langkah mengamankan data dan memensiunkan aplikasi lama.

---

## ⚠️ BACA DULU — Celah yang Harus Ditutup

Saat memeriksa kesiapan, saya menemukan **dua celah** yang saling berkaitan:

1. Fungsi ganti password sudah ada di backend, tetapi **tidak pernah didaftarkan** — Admin tak bisa memakainya
2. Kolom "Password Baru" di form Edit User masih menulis ke kolom lama (`KodeUnik`), yang **sudah tidak dipakai untuk login** sejak password di-hash

Akibatnya bila dibiarkan: begitu `kosongkanPasswordTeksBiasa()` dijalankan, **pengguna yang lupa password tidak punya jalan pemulihan sama sekali** — tidak lewat aplikasi, tidak lewat spreadsheet.

Karena itu **Bagian A wajib diselesaikan sebelum Bagian C.**

---

## BERKAS YANG DIGANTI

| Berkas | Lokasi |
|---|---|
| `Kode.gs` | Apps Script |
| `js/halaman.js` | repo |

---

## BAGIAN A — Pasang Perbaikan Reset Password

### A1. Backend
1. Project **`SIPUMA API`** → `Kode.gs` → **Ctrl+A** → **Delete** → tempel isi baru → **Ctrl+S**
2. **Deploy** → **Manage deployments** → **pensil** → **Version: New version** → **Deploy** → **Done**

### A2. Frontend
Salin `js/halaman.js`, lalu:
```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Perbaikan reset password oleh Admin"
git push
```

### A3. Uji reset password ⚠️ jangan dilewati
1. Login **Admin** → **Manajemen User & Akses**
2. Klik **Edit** pada salah satu UMKM → muncul panel **Reset Password**
3. Isi password baru (minimal 6 karakter) → **Terapkan** → catat passwordnya
4. **Logout**, lalu login sebagai UMKM itu dengan password baru
5. Pastikan **berhasil masuk**

> Bila langkah A3 gagal, **hentikan** dan kabari saya. Jangan lanjut ke Bagian C.

---

## BAGIAN B — Amankan Data

### B1. Unduh cadangan
**Admin** → **Pengaturan Akun** → **Cadangan Data** → unduh **keduanya** (Excel dan JSON).
Simpan di tempat yang tidak mudah hilang.

### B2. Salin cadangan spreadsheet
Buka `DB_SIPUMA` di Google Sheets → **File → Make a copy** → beri nama:
```
DB_SIPUMA - Cadangan Sebelum Finalisasi (tanggal hari ini)
```

> Langkah ini penting karena cadangan aplikasi **tidak menyertakan password**. Salinan spreadsheet inilah satu-satunya arsip yang masih memuat kolom `PasswordHash` — bila suatu saat diperlukan.

### B3. Arsipkan berkas program
Simpan di folder terpisah (komputer atau Drive):
- `Kode.gs` versi terbaru
- Seluruh isi repo `sipuma-umkm`
- Berkas SIPUMA **versi lama** (`Index.html`, `JSPart1–13`, `Stylesheet.html`)

---

## BAGIAN C — Kunci Password (Tidak Dapat Dibatalkan)

> **Syarat:** Bagian A3 berhasil, Bagian B selesai, dan aplikasi sudah dipakai normal oleh pengguna sungguhan **beberapa hari** — bukan sekadar lolos pengujian.
>
> Alasannya: masalah yang hanya muncul di pemakaian nyata (koneksi bermasalah, HP tertentu, kebiasaan pengguna) belum tentu tertangkap saat pengujian. Selama langkah ini belum dijalankan, SIPUMA lama masih bisa dipakai sebagai cadangan.

### C1. Ganti password default lebih dulu
Password bawaan berikut masih berlaku dan sebaiknya diganti:

| Akun | Password bawaan |
|---|---|
| Admin | `admin#2026` |
| Tim CSR UT | `csrut#2026` |

Ganti lewat **Manajemen User & Akses → Edit → Reset Password**.

### C2. Jalankan penguncian
1. Apps Script → pilih fungsi **`kosongkanPasswordTeksBiasa`** → **Run**
2. Log akan menampilkan jumlah password yang dihapus

**Setelah langkah ini:**
- Password tidak lagi terbaca siapa pun dari spreadsheet — termasuk Anda
- **SIPUMA versi lama mati total**, tidak ada yang bisa login ke sana lagi
- Pemulihan password hanya lewat **Reset Password** di Manajemen User

### C3. Uji ulang login ketiga peran
Login sebagai Admin, CSR UT, dan satu UMKM. Pastikan semuanya masih bisa masuk.

---

## BAGIAN D — Perawatan Rutin

### D1. Pembersih sesi otomatis
Sheet `Sesi` bertambah setiap kali ada yang login. Pasang pembersih:

**Apps Script → Triggers (ikon jam) → Add Trigger**
- Function: `bersihkanSesiKedaluwarsa`
- Event source: **Time-driven**
- Type: **Day timer**
- Waktu: **00:00 – 01:00**
- **Save**

### D2. Pensiunkan SIPUMA lama
Lakukan **hanya setelah** Bagian C selesai dan aplikasi berjalan lancar:
1. Buka project Apps Script SIPUMA **lama**
2. **Deploy → Manage deployments** → ikon **pensil** → **Archive**

> Jangan hapus projectnya — cukup diarsipkan, agar riwayatnya masih ada bila sewaktu-waktu diperlukan.

### D3. Cadangan berkala
Unduh cadangan lewat **Pengaturan → Cadangan Data** secara rutin — misalnya setiap akhir bulan, atau setiap selesai closing periode.

---

## Ringkasan Keamanan Saat Ini

| Lapisan | Keadaan |
|---|---|
| Password | SHA-256 + salt unik per akun |
| Sesi | Token 5 jam, diverifikasi server tiap permintaan |
| Hak akses | Dibatasi per peran; UMKM hanya menyentuh datanya sendiri |
| Brute-force | 5 kali gagal → terkunci 15 menit |
| Berkas ekspor | Tanpa Kode Unik |
| Cadangan | Tanpa password maupun token sesi |
| Repo publik | Hanya tampilan; seluruh pemeriksaan di server |

---

## Bila Ada Masalah

| Yang terlihat | Solusi |
|---|---|
| Panel Reset Password tidak muncul | `halaman.js` belum tersalin — push ulang, Ctrl+Shift+R |
| "Action tidak dikenal: resetPassword" | Deploy belum diperbarui — ulangi A1 langkah 2 |
| Password baru ditolak | Minimal 6 karakter |
| Ada yang tidak bisa login setelah C2 | Reset passwordnya lewat Manajemen User |
| **Admin sendiri tidak bisa login setelah C2** | Buka salinan spreadsheet dari B2, lalu kabari saya |

**Keterangan error:** **F12** → **Console** → salin tulisan merah.
