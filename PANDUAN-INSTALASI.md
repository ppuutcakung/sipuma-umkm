# Panduan Instalasi SIPUMA (Versi API)

Panduan ini untuk memasang SIPUMA versi baru: backend di Google Apps Script, frontend di GitHub Pages.

> **SIPUMA lama jangan dimatikan dulu.** Biarkan tetap jalan sampai versi baru terbukti berfungsi penuh.

---

## BAGIAN A — Backend (Google Apps Script)

### A1. Buat project baru
1. Buka https://script.google.com → **New Project**
2. Beri nama: `SIPUMA API`
3. Ganti seluruh isi `Code.gs` dengan isi berkas **`Kode.gs`** yang diberikan terpisah

### A2. Hubungkan ke database yang sudah ada
1. Buka spreadsheet **`DB_SIPUMA`** Anda, salin ID dari URL:
   `https://docs.google.com/spreadsheets/d/`**`ID_DI_SINI`**`/edit`
2. Di Apps Script: **⚙️ Project Settings → Script Properties → Add script property**
   - Property: `spreadsheetId`
   - Value: *(tempel ID tadi)*
3. **Save script properties**

### A3. Siapkan keamanan (sekali saja)
1. Pilih fungsi **`siapkanKeamananAPI`** dari dropdown → **Run**
2. Izinkan akses Drive & Spreadsheet saat diminta
3. Cek Execution Log — pastikan muncul `✅ Sheet "Sesi" berhasil dibuat` dan daftar akun yang di-hash

> Password pengguna **tidak berubah** — semua tetap login seperti biasa.

### A4. Deploy sebagai Web App
1. **Deploy → New Deployment → ⚙️ → Web app**
2. Atur:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
3. **Deploy** → salin **Web app URL** (berakhiran `/exec`)

---

## BAGIAN B — Frontend (GitHub Pages)

### B1. Isi alamat server ⚠️ WAJIB SEBELUM PUSH
Ekstrak ZIP, buka berkas **`js/config.js`** dengan Notepad, ubah baris pertama:

```js
const GAS_URL = 'GANTI_DENGAN_URL_EXEC_ANDA';
```

menjadi URL `/exec` dari langkah A4:

```js
const GAS_URL = 'https://script.google.com/macros/s/AKfycb..../exec';
```

Simpan. **Kalau langkah ini terlewat, aplikasi akan menampilkan peringatan dan tidak bisa login.**

### B2. Pasang Git (sekali seumur komputer)
- **Windows:** unduh di https://git-scm.com/download/win → install dengan pengaturan bawaan → buka **PowerShell**
- **Mac:** buka Terminal, ketik `git --version` (macOS akan menawarkan instalasi)

Verifikasi:
```bash
git --version
```

### B3. Kenalkan identitas Anda ke Git (sekali saja)
```bash
git config --global user.name "Nama Lengkap Anda"
git config --global user.email "email@akun-github-anda.com"
```

### B4. Buat repository di GitHub
1. Di https://github.com → tombol **+** → **New repository**
2. Nama: **`sipuma-umkm`**
3. Pilih **Public** *(wajib untuk GitHub Pages gratis)*
4. **JANGAN** centang README / .gitignore / license
5. **Create repository** — biarkan halaman instruksinya terbuka

### B5. Masuk ke folder yang BENAR ⚠️ paling sering salah

Folder yang di-`git init` adalah folder yang **berisi `index.html` langsung**, bukan folder induknya.

```bash
cd $HOME\Documents\sipuma-umkm
dir
```
*(Mac/Linux/Git Bash: `cd ~/Documents/sipuma-umkm` lalu `ls`)*

**Pastikan hasil `dir` menampilkan:**
```
index.html     ← harus terlihat di sini
README.md
PANDUAN-INSTALASI.md
css
js
```

Kalau yang terlihat justru nama folder lain, Anda masih satu tingkat terlalu tinggi — masuk lebih dalam dulu. **Jangan lanjut sebelum `index.html` terlihat.**

### B6. Unggah pertama kali
```bash
git init
git add .
git commit -m "SIPUMA versi API - unggahan pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/sipuma-umkm.git
git push -u origin main
```
*(ganti `USERNAME` dengan username GitHub Anda)*

**Saat diminta password:**
GitHub **menolak password akun biasa**. Anda perlu **Personal Access Token**:
1. GitHub → foto profil → **Settings** → paling bawah **Developer settings**
2. **Personal access tokens → Tokens (classic) → Generate new token (classic)**
3. Centang scope **`repo`** → **Generate token** → salin tokennya
4. Tempel token itu sebagai password di terminal

> Saat mengetik/menempel token, **layar tidak menampilkan apa pun** — itu normal, bukan error. Tekan Enter saja.

### B7. Aktifkan GitHub Pages
1. Di repo → **Settings** → menu kiri **Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main`, folder: `/ (root)` → **Save**
4. Tunggu 1–2 menit

Alamat situs Anda:
```
https://USERNAME.github.io/sipuma-umkm/
```

---

## BAGIAN C — Pengujian

1. Buka alamat situs di atas
2. Login sebagai **Admin** → pastikan dashboard tampil
3. Login sebagai **CSR UT** dan **UMKM** → pastikan ketiganya bisa masuk
4. Buka **F12 → Console** → pastikan tidak ada error merah

### Setelah ketiga peran terbukti bisa login
Kembali ke Apps Script, jalankan fungsi:
```
kosongkanPasswordTeksBiasa()
```
Ini menghapus sisa password teks biasa dari spreadsheet. **Jangan dijalankan sebelum pengujian login berhasil.**

---

## Cara Memperbarui Situs Nanti

Setiap kali ada berkas yang diubah:
```bash
cd $HOME\Documents\sipuma-umkm
git add .
git commit -m "Keterangan singkat perubahan"
git push
```
Tunggu 1–2 menit, lalu **Ctrl+Shift+R** di browser.

---

## Masalah Umum

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Halaman tampil tanpa warna/tata letak | Folder `css/` & `js/` tidak ikut terkirim | Jangan upload lewat web GitHub — gunakan terminal (`git add .`) |
| 404 padahal semua perintah sukses | `git init` di folder yang salah | Cek `dir` menampilkan `index.html`; ulangi dari folder yang benar |
| "Alamat server belum diisi" | `GAS_URL` belum diganti | Edit `js/config.js`, lalu `git add . && git commit -m "isi config" && git push` |
| Login gagal terus | URL `/exec` salah, atau deploy belum `Anyone` | Cek ulang langkah A4 |
| `Password authentication is not supported` | GitHub menolak password akun | Buat Personal Access Token (langkah B6) |
| Situs masih versi lama | Cache browser | Ctrl+Shift+R atau buka Incognito |
| `LF will be replaced by CRLF` | Perbedaan format baris Windows | Abaikan — hanya peringatan, bukan error |
