# Panduan Pemasangan — Generalisasi Nama & Ganti Username Stakeholder

**Waktu:** ± 10 menit · **Berkas diganti:** 1 backend + 4 frontend

Sebutan "CSR United Tractors" diganti menjadi **Stakeholder** pada **halaman login** dan **akun Stakeholder saja** — agar akun ini dapat dipakai lembaga mana pun (mis. Yayasan Astra) tanpa terkesan khusus satu pihak.

**Akun Admin dan UMKM tidak diubah** — identitas internalnya tetap seperti semula.

---

## BERKAS YANG DIGANTI

| Berkas | Lokasi |
|---|---|
| `Kode.gs` | Apps Script |
| `index.html` | root repo |
| `js/auth.js` | repo |
| `js/app.js` | repo |
| `js/halaman.js` | repo |

> `config.js`, `dashboard.js`, `legalitas.js`, `ekspor.js`, `ui.js`, `api.js`, `compat.js`, `css/style.css` **tidak berubah**.

---

## BAGIAN A — Backend

1. Project **`SIPUMA API`** → `Kode.gs` → **Ctrl+A** → **Delete** → tempel isi baru → **Ctrl+S**
2. **Deploy** → **Manage deployments** → **pensil** → **Version: New version** → **Deploy** → **Done**

> Tidak ada sheet baru. Tidak perlu menjalankan fungsi penyiapan apa pun.

## BAGIAN B — Frontend

Salin `index.html` dan 3 berkas di `js/`, lalu:

```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Generalisasi nama peran jadi Stakeholder, username dapat diubah"
git push
```

Tunggu 1–2 menit → **Ctrl+Shift+R**

---

## BAGIAN C — Pengujian

### C1. Halaman login
- Lencana "Program CSR United Tractors" di kiri atas **sudah hilang**
- Poin ke-4 kini berbunyi **"Pelaporan UMKM berprestasi"**
- Tab ketiga bertuliskan **Stakeholder** (bukan "CSR United Tractors")
- Klik tab **Stakeholder** → label kolom berubah jadi "Username Stakeholder"

### C2. Tampilan di akun Stakeholder
Login dengan akun tersebut, periksa:

| Letak | Seharusnya |
|---|---|
| Header kiri | **UMKM Binaan** |
| Header, sebelah kanannya | **Panel Pemantauan Program** |
| Lencana dekat ikon lonceng | **Stakeholder** |
| Bawah nama pengguna (pojok kanan atas) | **read-only** |
| Sidebar, bawah logo | **Sesi Aktif — Stakeholder** |

Nama yang tampil di pojok kanan atas otomatis mengikuti username yang terdaftar.

### C3. Ganti username Stakeholder ⚠️ uji dengan hati-hati
1. Login **Admin** → **Manajemen User & Akses**
2. **Edit** pada akun Stakeholder → kolom **Username kini dapat diubah**
3. Ganti namanya (misal `Tim CSR UT` → `Stakeholder UT`) → **Simpan**
4. Pesan yang muncul akan menyebutkan bahwa yang bersangkutan perlu login ulang
5. **Logout**, lalu login memakai **username baru** → harus berhasil

> **Catat username barunya sebelum menyimpan.** Bila lupa, buka sheet `UserCredentials` di `DB_SIPUMA` untuk melihatnya.

### C4. Sesi lama otomatis berakhir
Bila akun itu sedang login di perangkat lain saat username diganti, sesinya langsung diakhiri dan diminta login ulang. Ini disengaja — sesi lama masih menyimpan nama lama, dan bila dibiarkan sebagian operasi profil akan gagal diam-diam.

### C5. Akun sistem tetap terlindungi
Di Manajemen User, akun **Admin** dan **Stakeholder** menampilkan ikon gembok di kolom Aksi, bukan tombol hapus.

> Perlindungan ini kini berdasarkan **peran**, bukan nama tetap. Sebelumnya dikunci dengan nama `Tim CSR UT` — perlindungannya akan hilang begitu namanya diganti.

### C6. Username Admin tetap dikunci
Edit akun Admin → kolom Username tetap tidak dapat diubah, dengan keterangannya.

### C7. Akun Admin TIDAK ikut berubah
Login sebagai **Admin**, pastikan tampilannya **tetap seperti semula**:

| Letak | Seharusnya tetap |
|---|---|
| Header kiri | **UMKM Binaan CSR United Tractors** |
| Header, sebelah kanannya | **Panel Administrasi & Pengelolaan Data** |
| Lencana dekat lonceng | **Admin / PIC** |

Generalisasi memang **hanya berlaku untuk akun Stakeholder** dan halaman login.

---

## Bila Ada Masalah

| Yang terlihat | Solusi |
|---|---|
| Masih tertulis "CSR United Tractors" | Ctrl+Shift+R; pastikan `index.html`, `app.js`, `auth.js` tersalin |
| Kolom Username masih terkunci | `halaman.js` belum tersalin — push ulang |
| Tidak bisa login setelah ganti username | Pakai username baru; bila lupa, lihat sheet `UserCredentials` |
| Tombol hapus muncul pada akun sistem | `halaman.js` belum tersalin |

**Keterangan error:** **F12** → **Console** → salin tulisan merah.

---

## Catatan

Perubahan ini **tidak menyentuh data** — hanya label tampilan dan aturan penyuntingan username. Seluruh data UMKM, omset, tenaga kerja, asesmen, legalitas, dan closing tetap utuh.

`kosongkanPasswordTeksBiasa()` tetap **belum dijalankan** sampai masa uji pakai selesai.
