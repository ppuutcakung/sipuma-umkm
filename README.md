# SIPUMA — Sistem Informasi Pendataan & Manajemen UMKM

Aplikasi web pemantauan UMKM binaan **PPU UT Cakung** (Program CSR United Tractors).

- **Frontend:** HTML/CSS/JS vanilla — di-host di GitHub Pages
- **Backend:** Google Apps Script sebagai REST API (JSON)
- **Basis data:** Google Sheets (`DB_SIPUMA`) + Google Drive

## Struktur

```
index.html          Kerangka aplikasi (WAJIB di root repo)
css/style.css       Seluruh tampilan
js/config.js        ⚠️ Isi GAS_URL di sini sebelum push
js/api.js           Komunikasi ke server + token sesi
js/ui.js            Toast, modal, format, dropdown pencarian
js/auth.js          Login / logout / pemulihan sesi
js/dashboard.js     Dashboard 3 peran
js/app.js           Router navigasi + Pengaturan Akun
```

## Keamanan

- Password disimpan sebagai **hash SHA-256 + salt** (tidak terbaca di spreadsheet)
- Setiap permintaan data wajib membawa **token sesi** yang diverifikasi di server
- Token berlaku **5 jam**, lalu otomatis kedaluwarsa
- Endpoint dibatasi per peran; pengguna UMKM hanya bisa mengakses datanya sendiri
- Login gagal 5 kali → terkunci 15 menit

> Repo ini publik, tetapi **tidak memuat kredensial apa pun** — hanya tampilan dan alamat API. Seluruh pemeriksaan hak akses dilakukan di sisi server.

## Peran Pengguna

| Peran | Akses |
|---|---|
| Admin / PIC | Seluruh pengelolaan data |
| CSR United Tractors | Pemantauan (hanya lihat) |
| UMKM Binaan | Pelaporan & data usahanya sendiri |
