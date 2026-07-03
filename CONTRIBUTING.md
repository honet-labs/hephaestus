# Panduan Kontribusi Pengembang (Contributing Guidelines)

Terima kasih telah tertarik untuk berkontribusi pada proyek **Hephaestus DevOps Portal**. Dokumen ini berisi panduan alur kerja, standar penulisan kode, serta konvensi repositori untuk memastikan pengembangan bersama berjalan secara teratur dan kolaboratif.

---

## 1. Standar Kualitas Kode (Clean Code Standards)

Untuk menjaga keberlanjutan dan kerapian kode program, harap ikuti aturan dasar berikut:

### 1.1. Pemisahan Tanggung Jawab (Separation of Concerns)
*   **Controller Layer** (`src/controllers/`): Hanya menangani parsing input parameters, validasi skema body payload, HTTP response format (status code), dan pencatatan audit log via `logActivity`.
*   **Service Layer** (`src/services/`): Tempat utama seluruh logika bisnis, operasi filesystem lokal, pembukaan tunnel SSH/SFTP, pemrosesan kueri database, serta komunikasi HTTP client.
*   **Routing Layer** (`src/routes/`): Hanya berfungsi untuk mendeklarasikan endpoint HTTP dan menyematkan middleware otentikasi serta controller handler yang sesuai.

### 1.2. Penanganan Error yang Aman (Error Safety)
*   Semua fungsi asinkron (`async/await`) **wajib** dibungkus menggunakan blok `try/catch`.
*   Log detail kesalahan pada konsol server menggunakan `console.error` dengan format context yang jelas:
    ```typescript
    console.error("[ModuleName/Context] Error description: ", error.message);
    ```
*   Pastikan response error yang dikirimkan ke client memiliki format seragam, tidak membocorkan *stack trace* mentah ke pengguna, dan menyertakan deskripsi masalah yang bisa ditindaklanjuti.

### 1.3. Penulisan Tipe TypeScript yang Ketat
*   Hindari penggunaan tipe data `any` jika memungkinkan. Deklarasikan `interface` atau `type` baru di file terkait atau folder `src/types/`.
*   Jaga kebersihan compiler dengan memastikan tidak ada warning linter sisa sebelum melakukan commit.

---

## 2. Format Penulisan Kode & Tooling

Kami menggunakan linter dan formatter otomatis untuk menjaga konsistensi format penulisan antar pengembang.

*   **EditorConfig**: Pengaturan indentasi diatur menggunakan spasi (size 2), utf-8, dan line endings LF (Unix). Pastikan editor Anda mendukung atau telah memasang ekstensi `.editorconfig`.
*   **Prettier**: Kode wajib diformat sebelum dikirim ke repositori.
    *   Jalankan pemeriksaan format: `npm run format:check`
    *   Format otomatis semua berkas: `npm run format`
*   **ESLint**: Linter akan memverifikasi keselarasan gaya penulisan TypeScript.
    *   Jalankan linter: `npm run lint`
    *   Perbaiki warning linter secara otomatis: `npm run lint:fix`

---

## 3. Alur Kerja Git (Git Workflow)

Kami menerapkan strategi branching sederhana untuk mempermudah integrasi kode:

### 3.1. Struktur Cabang (Branching Strategy)
*   **`main`**: Cabang utama yang selalu berada dalam kondisi stabil dan siap dideploy ke server produksi.
*   **`feature/*`**: Digunakan untuk mengembangkan fitur baru (contoh: `feature/snmp-v3-support`).
*   **`bugfix/*`**: Digunakan untuk perbaikan bug (contoh: `bugfix/ssh-timeout-handling`).
*   **`docs/*`**: Digunakan khusus untuk perbaikan atau penulisan dokumentasi baru (contoh: `docs/contributing-guide`).

### 3.2. Prosedur Pengiriman Kode
1.  Lakukan *fork* atau buat cabang baru dari branch `main` terbaru (`git checkout -b feature/nama-fitur`).
2.  Tulis kode program Anda dan pastikan fitur berjalan dengan baik.
3.  Jalankan penjamin mutu lokal sebelum commit:
    ```bash
    ./local-ci.sh
    ```
    *Pastikan seluruh pengecekan static assets, linter, formatter, dan build kompilasi TypeScript lulus tanpa kesalahan.*
4.  Lakukan commit dengan pesan terstruktur (lihat bagian format commit).
5.  Push cabang Anda ke remote repository dan ajukan **Pull Request (PR)** ke branch `main`.

---

## 4. Konvensi Pesan Commit (Commit Messages)

Pesan commit wajib mengikuti standar **Conventional Commits** agar riwayat repositori mudah dibaca dan dianalisis:

Format penulisan: `<type>(<scope>): <subject>`

Beberapa `<type>` yang umum digunakan:
*   `feat`: Menambahkan fitur baru ke dalam kode.
*   `fix`: Memperbaiki bug atau kesalahan sistem.
*   `docs`: Perubahan atau penambahan pada dokumentasi (README, ARCHITECTURE).
*   `style`: Perubahan gaya penulisan kode tanpa memengaruhi logika bisnis (spasi, formatting, semi-colon).
*   `refactor`: Restrukturisasi kode tanpa mengubah fungsionalitas sistem.
*   `chore`: Pembaruan tugas-tugas build, dependensi package, konfigurasi linter, dll.

Contoh pesan commit:
*   `feat(prometheus): add dry-run validation using promtool over SSH`
*   `fix(snmp): resolve OID prefix matching database transaction crash`
*   `docs(architecture): add diagram structure and schema table layouts`
*   `chore(deps): update axios package version for security patch`
