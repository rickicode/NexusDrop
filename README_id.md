# NexusDrop

<div align="center">
<h2><a href="https://nexusdrop.hijitoko.com">🚀 Visit NexusDrop Here</a></h2>
</div>

NexusDrop adalah aplikasi pengakselerasi unduhan berkecepatan tinggi yang memanfaatkan server mirror untuk mengunduh file dengan cepat dan efisien. Ketika pengguna memasukkan URL, server akan mengubah URL tersebut untuk menggunakan mirror (melalui [0ms.dev](https://0ms.dev/mirrors)) sehingga proses unduhan menjadi lebih cepat. Aplikasi ini sangat berguna untuk koneksi lambat atau tidak stabil dan untuk mengunduh file berukuran besar.

## Fitur

- **Unduhan Mirror:** Secara otomatis mengonversi URL yang dimasukkan menjadi URL mirror menggunakan `https://get.0ms.dev/` untuk unduhan yang lebih cepat.
- **Pemantauan Progres:** Memantau progres unduhan dan menangani kesalahan.
- **Pembersihan Otomatis:** Menghapus unduhan yang telah kedaluwarsa atau macet agar penyimpanan tetap bersih.
- **Antarmuka Responsif:** Tampilan antarmuka yang modern dengan visual partikel layaknya awan.
- **Open Source:** Mudah untuk diinstal dan dikembangkan lebih lanjut.

## Opsi Deployment

### 1. Instalasi Lokal

#### Prasyarat

- [Node.js](https://nodejs.org/) (disarankan versi 14 atau lebih tinggi)
- [npm](https://www.npmjs.com/)

#### Langkah-langkah

### 2. Deployment Cloud (Dalam Pengembangan)

Untuk mendeploy aplikasi ini ke platform cloud seperti Vercel, diperlukan konfigurasi tambahan:

**Perubahan yang Diperlukan untuk Deployment Cloud:**
1. Integrasi dengan layanan penyimpanan cloud (contoh: AWS S3, Google Cloud Storage)
2. Database untuk menyimpan status unduhan (contoh: MongoDB Atlas, Supabase)
3. Konfigurasi environment untuk layanan cloud

Status: Dukungan deployment cloud sedang dalam pengembangan. Untuk saat ini, silakan gunakan metode instalasi lokal.

**Solusi Penyimpanan yang Direncanakan:**
- Penyimpanan File: AWS S3 atau layanan penyimpanan objek serupa
- Manajemen Status: MongoDB Atlas atau layanan database serupa
- Variabel Environment: Konfigurasi spesifik platform cloud

### Pengembangan Lokal

1. **Clone Repository:**

   ```bash
   git clone https://github.com/rickicode/NexusDrop.git
   cd NexusDrop
   ```

2. **Instal Dependensi:**

   ```bash
   npm install
   ```

3. **Jalankan Server:**

   Mulai server dengan menjalankan:

   ```bash
   node server.js
   ```

   Secara default, server berjalan pada port `3001`.

4. **Akses Aplikasi:**

   Buka browser dan kunjungi:

   ```url
   http://localhost:3001
   ```

## Penggunaan

1. **Masukkan URL:** Pada halaman utama, masukkan URL file yang ingin diunduh.
   
2. **Pilih Waktu Kedaluwarsa:** Pilih berapa lama tautan unduhan harus tersedia (mulai dari 1 jam hingga 3 hari).

3. **Mulai Unduhan:** Klik tombol Download. Server akan mengubah URL menjadi versi mirror menggunakan `https://get.0ms.dev`, memulai unduhan, dan menampilkan progres unduhan.

4. **Pantau Unduhan:** Halaman akan menampilkan daftar unduhan yang sedang aktif beserta statusnya. Unduhan yang telah selesai akan muncul di bagian "Downloads".

## Tujuan Aplikasi

NexusDrop dibuat untuk menyederhanakan dan mempercepat proses mengunduh file melalui koneksi internet yang lambat atau tidak stabil. Dengan memanfaatkan kekuatan server mirror, aplikasi ini memastikan pengguna dapat mengakses file dengan lebih cepat dan pengalaman unduhan yang lebih baik. Aplikasi ini sangat ideal untuk file berukuran besar, transfer antar server, atau situasi di mana unduhan langsung tradisional mengalami keterlambatan.

## Kontribusi

Kontribusi sangat diterima! Silahkan fork repository ini dan ajukan pull request dengan perubahan Anda. Untuk perubahan besar, mohon diskusikan terlebih dahulu melalui issue.

## Lisensi

Proyek ini dilisensikan di bawah Lisensi MIT.
