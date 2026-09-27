# Panduan Pemasangan Pembaruan SIPUMA

Panduan ini khusus untuk **pembaruan** (bukan pemasangan dari nol). Repo GitHub dan project Apps Script Anda sudah ada — yang dilakukan hanya mengganti isinya.

**Perkiraan waktu:** 15–20 menit
**Perlu disiapkan:** berkas `Kode.gs` dan `sipuma-umkm.zip` yang baru

> ⚠️ **Jangan lompati Bagian A.** Upload foto tidak akan berfungsi tanpa langkah A3 dan A4, berapa kali pun Anda mencoba.

---

## BAGIAN A — Backend (Google Apps Script)

### A1. Buka project yang sudah ada
1. Buka https://script.google.com
2. Pilih project **`SIPUMA API`** *(bukan project SIPUMA yang lama)*

> Kalau ragu project mana yang benar: yang benar adalah yang berisi fungsi `siapkanKeamananAPI`. Cek lewat dropdown fungsi di atas tombol Run.

### A2. Ganti isi Kode.gs
1. Klik berkas **`Kode.gs`** di panel kiri
2. Klik di dalam area kode → tekan **Ctrl+A** → **Delete** (kosongkan seluruhnya)
3. Buka berkas `Kode.gs` yang baru → salin **seluruh isinya**
4. **Ctrl+V** di Apps Script
5. Tekan **Ctrl+S** untuk menyimpan

**Cara memastikan salinannya utuh:** scroll ke paling bawah, baris terakhir harus berupa penutup fungsi `siapkanKeamananAPI` — bukan potongan kode yang menggantung.

### A3. Berikan izin Drive ⚠️ WAJIB — ini penyebab "Akses ditolak"
1. Pada dropdown fungsi di atas (biasanya tertulis `doGet`), pilih **`otorisasiDrive`**
2. Klik **Run**
3. Akan muncul jendela izin:
   - **Review permissions** → pilih akun Google Anda
   - Muncul "Google hasn't verified this app" → klik **Advanced** (kiri bawah)
   - Klik **Go to SIPUMA API (unsafe)**
   - Klik **Allow**

> Tulisan "unsafe" itu normal — muncul karena aplikasi ini buatan sendiri dan tidak didaftarkan ke Google. Bukan tanda bahaya.

4. Lihat **Execution log** di bawah. Yang benar terlihat seperti ini:

```
✅ Izin Drive berhasil diberikan.
   Foto profil: [nama folder] — dapat diakses ✓
   Laporan CSR: [nama folder] — dapat diakses ✓
```

**Kalau ada tanda ❌** pada salah satu folder, berhenti di sini dan kabari saya — jangan lanjut ke A4.

### A4. Deploy ulang ⚠️ WAJIB — izin baru tidak berlaku tanpa ini
1. **Deploy** → **Manage deployments**
2. Klik ikon **pensil (Edit)** di kanan atas
3. Pada **Version**, pilih **New version**
4. Klik **Deploy**
5. Klik **Done**

> **Jangan pilih "New deployment".** Itu membuat URL baru, dan `GAS_URL` di frontend Anda jadi salah alamat.
>
> URL `/exec` Anda **tidak berubah** dengan cara ini — tidak perlu mengubah `config.js`.

---

## BAGIAN B — Frontend (GitHub)

### B1. Ekstrak ZIP menimpa folder lama
1. Ekstrak `sipuma-umkm.zip`
2. Salin isinya menimpa folder repo lama Anda (biasanya `Documents\sipuma-umkm`)
3. Saat ditanya, pilih **Ganti/Replace semua**

### B2. Isi kembali GAS_URL ⚠️ PALING SERING TERLEWAT
Berkas `js/config.js` dari ZIP berisi nilai kosong — **isian lama Anda tertimpa**.

1. Buka `js/config.js` dengan Notepad
2. Baris paling atas akan berbunyi:
   ```js
   const GAS_URL = 'GANTI_DENGAN_URL_EXEC_ANDA';
   ```
3. Ganti dengan URL `/exec` Anda:
   ```js
   const GAS_URL = 'https://script.google.com/macros/s/AKfycb..../exec';
   ```
4. Simpan

**Cara mendapatkan URL-nya kembali:** Apps Script → **Deploy → Manage deployments** → salin **Web app URL**.

### B3. Kirim ke GitHub
Buka PowerShell (Windows) atau Terminal (Mac), lalu:

```bash
cd $HOME\Documents\sipuma-umkm
```
*(Mac/Linux: `cd ~/Documents/sipuma-umkm`)*

Pastikan Anda di folder yang benar:
```bash
dir
```
Harus terlihat **`index.html`** langsung di daftar. Kalau tidak, Anda salah folder.

Lalu kirim:
```bash
git add .
git commit -m "Pembaruan: status aktif UMKM, identitas aplikasi, indikator server"
git push
```

Tunggu 1–2 menit, lalu buka situs dan tekan **Ctrl+Shift+R**.

---

## BAGIAN C — Pengujian Berurutan

Ikuti urutan ini. Kalau satu langkah gagal, berhenti dan kabari — jangan lanjut, agar penyebabnya tidak tercampur.

### C1. Upload foto (penanda utama keberhasilan Bagian A)
1. Login sebagai **Admin** → **Pengaturan Akun**
2. Pilih berkas foto → **Unggah Foto**
3. **Yang benar:** notifikasi hijau, foto muncul di lingkaran profil dan di pojok kanan atas

**Kalau masih "Akses ditolak: DriveApp"** → langkah A3 atau A4 belum berhasil. Ulangi keduanya.

### C2. Hapus foto
1. Tombol **Hapus Foto** muncul di bawah tombol Unggah
2. Klik → konfirmasi → foto hilang, kembali ke inisial nama
3. Cek folder foto di Google Drive — berkas lamanya sudah masuk **Trash**

### C3. Ganti foto (uji anti-menumpuk)
1. Unggah foto A → unggah foto B
2. Cek Drive: foto A sudah di Trash, hanya foto B yang tersisa

### C4. Indikator server
Lihat sidebar di bawah "Sesi Aktif" — harus muncul **"Server Terhubung"** hijau beserta waktu respons.

### C5. Dashboard Utama
- Widget pertama berjudul **"Total UMKM (Aktif)"**
- **Pra Mandiri sudah terisi** (tidak lagi 0) — cocokkan dengan tab Asesmen Kemandirian
- Ada **dua grafik bersebelahan**: Tren Omset dan Perkembangan Tenaga Kerja
- Distribusi Kelas Kemandirian di bawahnya, berbentuk 4 kartu
- **Filter Tahun** di kanan atas — coba ganti tahunnya

### C6. Data Master UMKM
- Urutan UMKM dari **binaan terbaru**
- Ada kolom **Status** bertuliskan "Aktif"
- Coba tombol sakelar → nonaktifkan satu UMKM → status berubah "Tidak Aktif"
- Kembali ke Dashboard → angka **Total UMKM (Aktif) berkurang 1**
- Aktifkan kembali → angka kembali semula

### C7. Tolak nama ganda
1. **Tambah UMKM** → isi nama yang mirip dengan yang sudah ada
   *(contoh: kalau ada "D'Shafa", coba ketik "D Shafa" atau "dshafa")*
2. **Yang benar:** ditolak, dengan pesan menyebut nama dan kode UMKM yang bentrok

### C8. Identitas Aplikasi
1. **Pengaturan Akun** → panel **Identitas Aplikasi** (hanya terlihat oleh Admin)
2. Ubah **Warna Utama** → **Simpan** → warna aplikasi langsung berubah
3. Ubah **Judul** dan **Tagline** → cek tulisan di sidebar ikut berubah
4. Klik **Kembalikan ke Bawaan** → **Simpan** untuk mengembalikan

---

## Setelah Semua Pengujian Berhasil

Lanjutkan memeriksa akun **CSR UT** dan **UMKM** (belum diperiksa sejak migrasi).

### Yang masih ditahan — jangan dijalankan dulu

```
kosongkanPasswordTeksBiasa()
```

Fungsi ini menghapus sisa password teks biasa dari spreadsheet. **Begitu dijalankan, SIPUMA versi lama mati total** — tidak ada seorang pun bisa login ke sana lagi.

Selama belum dijalankan, aplikasi lama masih bisa dipakai sebagai cadangan kalau versi baru bermasalah. Jalankan hanya setelah **ketiga peran** terbukti berfungsi penuh selama beberapa hari pemakaian nyata.

---

## Bila Ada Masalah

| Yang terlihat | Kemungkinan penyebab | Solusi |
|---|---|---|
| "Akses ditolak: DriveApp" | Langkah A3/A4 terlewat | Ulangi A3 lalu A4 |
| "Alamat server belum dikonfigurasi" | `GAS_URL` tertimpa ZIP | Ulangi B2, lalu push ulang |
| Situs masih tampilan lama | Cache browser | Ctrl+Shift+R, atau coba Incognito |
| Halaman tanpa warna/tata letak | Folder `css`/`js` tidak terkirim | Jangan upload lewat web GitHub — pakai `git add .` |
| "Server Terputus" merah | URL salah / deploy belum diperbarui | Cek A4 dan B2 |
| Semua UMKM jadi "Tidak Aktif" | Seharusnya tidak terjadi | Hentikan pemakaian, kabari saya segera |
| Pra Mandiri masih 0 | Frontend lama masih ter-cache | Ctrl+Shift+R |

**Cara mengambil keterangan error:** tekan **F12** → tab **Console** → salin tulisan merah yang muncul.
