# JStore Digital — stok, penjualan, dan garansi

Workspace internal untuk admin produk digital: akun, link aktivasi, lisensi, dan varian langganan. Data toko disimpan pada Cloudflare D1; mode contoh memakai data simulasi terpisah.

## Alur kerja

1. Owner menetapkan produk/varian, harga reguler, harga reseller opsional, modal default, minimum stok, dan masa garansi dalam jam.
2. Admin menempel pesan supplier atau mengunggah `.txt`. Parser menampilkan stok valid, duplikat, header, dan baris belum terbaca. Admin menggunakan modal default; owner dapat memasukkan modal batch sebenarnya.
3. Setelah pembayaran dipastikan, admin memilih produk, jumlah, dan jenis harga lalu menekan **Ambil, catat terjual & salin**. Akun dengan batas jual terdekat diprioritaskan. Akun kedaluwarsa dan bermasalah dikecualikan.
4. Satu pengambilan atomik mengalokasikan akun, menyimpan penjualan dan modal aktual, serta mencatat admin. Permintaan ulang dengan ID yang sama mengembalikan akun yang sama. Salin ulang dan unduh tidak membuat penjualan tambahan.
5. Pada menu **Garansi**, admin mencari pesanan asal, memilih akun bermasalah, dan mengisi kendala. Penggantian memakai produk/varian yang sama, omzet tambahan nol, dan modal akun pengganti tercatat sebagai biaya garansi.

## Kebijakan bisnis

- Harga reguler/reseller berasal dari pengaturan server. Hanya owner boleh memakai harga khusus.
- Omzet = total penjualan. Laba kotor = omzet − modal aktual akun yang terjual. Hasil setelah penggantian = laba kotor − modal akun pengganti. Belum mencakup biaya operasional, biaya marketplace, pajak, atau refund.
- Pengambilan menandakan penjualan selesai; aplikasi belum terhubung dengan verifikasi pembayaran atau marketplace.
- Batas jual stok berlaku sampai akhir tanggal yang dipilih dalam WIB. Masa garansi pelanggan dimulai saat penjualan dan merupakan aturan yang berbeda.
- Masa garansi disimpan pada pesanan. Mengubah produk tidak mengubah garansi pesanan lama. Penggantian mengikuti tenggat asli, bukan memperpanjangnya.
- Nilai garansi 0 dan transaksi lama tanpa tenggat memerlukan pemeriksaan owner. Pengecualian hanya dapat dilakukan owner secara eksplisit dan dicatat pada klaim.
- Setiap akun bermasalah hanya bisa diproses sekali. Akun pengganti dapat diproses kembali bila bermasalah selama tenggat asal masih berlaku. Maksimal 25 akun per proses garansi.
- Akun identik pada produk yang sama tidak bisa diimpor dua kali, termasuk yang sudah terjual. Password dan token tidak dinormalisasi sembarangan.

## Akses dan penyimpanan

Site menggunakan autentikasi dan pembatasan pengunjung dari Sites. Tetap gunakan akses privat dan hanya berikan akses kepada tim toko. Setel secret `JSTORE_OWNER_EMAIL` ke email terverifikasi pemilik Site; pengunjung lain yang telah diberi akses Site berperan sebagai admin. Membuat role admin di aplikasi tidak otomatis membagikan Site.

API menolak pengunjung tanpa identitas. Konfigurasi owner yang kosong menutup akses sampai diperbaiki. Modal dan laba tidak dikirim kepada admin. Kredensial stok yang belum dialokasikan hanya dapat dilihat owner; admin memperoleh kredensial melalui transaksi yang telah dialokasikan. Semua respons data memakai `Cache-Control: no-store`.

`sessionStorage` hanya menyimpan metadata permintaan yang perlu dipulihkan setelah koneksi terputus, tanpa kredensial akun. `localStorage` hanya menyimpan pilihan mode tampilan. Produk, stok, transaksi, dan klaim selalu bersumber dari D1.

## Paket deploy

Lihat [DEPLOY.md](DEPLOY.md) untuk target runtime, konfigurasi akses owner/admin, pembaruan database, dan penggunaan paket unduhan.

## Pengembangan

Gunakan Node.js 22.13+ dan lockfile npm yang tersedia. Binding `DB` serta identitas project dideklarasikan dalam `.openai/hosting.json`. Nilai hosted runtime dikelola melalui Sites. Selaraskan `.env` dengan `.env.example`; jangan commit nilai secret.

- `npm run dev`: pengembangan lokal.
- `npm run db:generate`: menghasilkan migrasi setelah perubahan schema.
- `node --test tests/inventory-workflow.test.mjs`: pengujian dengan SQLite nyata dan adapter transaksi D1.
- `./node_modules/.bin/tsc --noEmit`: pemeriksaan TypeScript.
- Build dan paket hosting mengikuti workflow Sites.

Migrasi `0000` mempertahankan data versi awal. Migrasi tambahan menambahkan atribut pengambilan, harga reseller, tenggat garansi, serta tabel klaim dan indeks unik. Jangan menjalankan perubahan schema saat menangani permintaan API.

Pengujian mencakup harga dan modal aktual, deduplikasi, 30 permintaan bersamaan, pengambilan ulang dengan ID sama, hak akses, stok kedaluwarsa, penggantian bertingkat, benturan klaim, serta batch garansi 25 akun. Ini pengujian kebenaran alur pada SQLite, bukan benchmark kapasitas hosted server. Daftar inventaris dan riwayat saat ini dimuat sebagai snapshot; kapasitas untuk volume data historis besar perlu diukur sebelum menetapkan target throughput operasional.

Perbaikan debugging tambahan: parser mendukung Email/User, tautan mailto yang ter-escape, dan pesan Telegram satu baris; akun tidak lengkap tidak diimpor. Permintaan jaringan dibatasi 20 detik dan pengambilan yang belum pasti mempertahankan ID pemulihan. Akun hasil pengambilan ditampilkan segera tanpa menunggu pemuatan ulang seluruh dashboard. Pengujian hasil build menggunakan runtime Workers beserta D1 dan aset JavaScript/CSS, bukan loader Node biasa.
