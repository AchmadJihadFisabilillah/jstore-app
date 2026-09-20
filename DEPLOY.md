# Panduan deploy JStore Digital

## Target paket

Paket ini disiapkan untuk **Sites**, dengan runtime **Cloudflare Workers** dan database **Cloudflare D1**. Aplikasi memakai identitas pengunjung yang diverifikasi oleh Sites. Gunakan jalur ini untuk menjalankan login owner/admin dan database tanpa mengganti arsitektur aplikasi.

Paket berisi kode sumber lengkap, migrasi database, pengujian, dan arsip hasil build. Isi stok atau akun pelanggan dari database produksi tidak disertakan.

## Deploy toko yang sudah ada

1. Gunakan Site **JStore Digital · Manajemen Stok** yang sama. Identitas Site ada di `.openai/hosting.json`; pertahankan agar pembaruan memakai database toko yang sama.
2. Pastikan binding database bernama `DB` tersedia. Konfigurasi ini sudah dideklarasikan dalam manifest; Sites memasang binding sebenarnya.
3. Atur secret `JSTORE_OWNER_EMAIL` ke email akun pemilik Site. Pada toko yang disiapkan dalam percakapan ini, secret tersebut sudah dikonfigurasi. File `.env.example` sengaja tidak memuat nilai pribadi.
4. Gunakan akses privat Site dan berikan akses hanya kepada tim toko. Email owner mendapat peran owner; pengunjung lain yang sudah diizinkan Site mendapat peran admin.
5. Gunakan versi tersimpan yang tercantum di `release.json` dalam paket, atau kirim ZIP ini ke percakapan Sites dan minta publikasi ke Site JStore yang sama. Versi tersebut sudah memiliki arsip build; tidak perlu membuat ulang toko.
6. Deploy melalui Sites. Workflow deployment menerapkan migrasi yang belum dijalankan dan memasang hasil build serta asetnya. Pertahankan migrasi `0000`, `0001`, dan `0002` beserta metadata; jangan menghapus data lama atau menjalankan SQL reset.
7. Setelah aktif, owner mengisi harga, modal, harga reseller opsional, batas stok, dan masa garansi tiap varian. Tambahkan satu batch kecil stok milik toko untuk memeriksa alur operasional sebelum impor besar.

Contoh instruksi untuk memakai paket ini kembali:

> Deploy paket JStoreDigital-Siap-Deploy.zip ini ke Site JStore Digital yang sama. Gunakan versi dan project pada release.json, pertahankan database serta akses privat yang ada, lalu cek status deployment sampai selesai.

## Menjalankan pemeriksaan dari kode sumber

Gunakan Linux atau WSL2 dengan Node.js 24 LTS, npm, Bash, dan GNU coreutils. Node.js minimal 22.13. Paket mempertahankan versi dependensi dalam `package-lock.json`.

Di direktori `source` dari ZIP:

```bash
npm ci
npm run build
node --test tests/*.test.mjs
npx tsc --noEmit
```

`npm test` juga menjalankan build dan semua pengujian. Pengujian memakai data dummy pada SQLite dan runtime Workers lokal; tidak menulis database toko aktif.

Untuk membuka pengembangan lokal:

```bash
npm run dev
```

Mode contoh dapat dicoba dari sidebar. Data toko nyata memerlukan identitas dari Sites dan binding D1 yang berisi migrasi. Jangan menambahkan cara melewati pemeriksaan identitas ke kode produksi untuk sekadar mencoba lokal.

Jika memakai workflow Sites untuk membangun kembali, jalankan helper `build-site.mjs` dari plugin Sites pada checkout ini. Paketkan output melalui `package-site.mjs`; arsip deployment memuat hasil build, bukan direktori kode sumber.

## Batas kompatibilitas yang perlu diketahui

- Modul `cloudflare:workers`, D1, dan identitas pengunjung Sites merupakan kebutuhan runtime aplikasi. Memindahkan ke penyedia lain memerlukan penyesuaian database serta autentikasi server.
- Jangan menjalankan Worker langsung di endpoint publik dengan mempercayai header identitas yang bisa dikirim pengunjung. Paket ini mengandalkan dispatcher Sites yang memasang identitas terverifikasi.
- Omzet dan laba kotor dicatat saat admin menandai stok terjual; verifikasi pembayaran tetap dilakukan admin. Perhitungan belum mencakup biaya operasional, pajak, biaya marketplace, atau refund.
- Pengujian bersamaan memverifikasi konsistensi alokasi stok, bukan jaminan kapasitas tertentu pada jaringan produksi. Snapshot riwayat yang sangat besar perlu diukur dan dipaginasi sebelum menetapkan target beban jangka panjang.
