# Dokumentasi Arsitektur Hephaestus DevOps Portal v2.0.0

Dokumen ini menjelaskan rancangan sistem, struktur kode, skema database, serta alur data teknis dari **Hephaestus DevOps Portal**.

---

## 1. Tinjauan Umum Sistem

Hephaestus adalah portal DevOps kontrol panel mandiri yang digunakan untuk:
*   Memonitoring status layanan Grafana dan Prometheus.
*   Mengelola konfigurasi Prometheus target (`prometheus.yml`) secara langsung lewat UI web (lokal maupun remote via SSH/SFTP).
*   Menghasilkan perintah instalasi otomatis untuk berbagai eksportir metrik (`node_exporter`, `blackbox_exporter`, `snmp_exporter`).
*   Menelusuri metrik *time-series* dari datasource Grafana.
*   Melakukan query dan walk SNMP secara dinamis dengan bantuan translasi OID berbasis modul MIB yang diunggah.

---

## 2. Diagram Arsitektur Teknis

```mermaid
graph TD
    subgraph Frontend (Klien)
        UI[index.html / CSS / JS SPA]
    end

    subgraph Backend (Express.js Server)
        R[Routes] --> C[Controllers]
        C --> S[Services]
        
        S -->|SSH & SFTP Tunnel| RemoteProm[Remote Prometheus Servers]
        S -->|Local fs read/write| LocalProm[Local /etc/prometheus/prometheus.yml]
        S -->|Axios HTTP Proxy| Grafana[Grafana API Engine]
        S -->|exec CLI snmpget/walk| SNMP[SNMP Devices]
        
        S -->|Query / Insert| DB[(PostgreSQL Database)]
    end
    
    UI -->|REST API / HTTP| R
```

---

## 3. Struktur Direktori dan Komponen Utama

Aplikasi menggunakan pola pemisahan tugas (*Separation of Concerns*) yang jelas pada struktur folder berikut:

```
hephaestus/
├── src/                      # Source Code Backend (TypeScript)
│   ├── index.ts              # Entry point utama Express server, inisialisasi awal DB & SNMP
│   ├── config/               # Modul konfigurasi global & koneksi database
│   │   ├── db.ts             # Manajemen connection pool PostgreSQL, skema DDL, & migrasi
│   │   └── env.ts            # Handler environment variables & dynamic config cache
│   ├── controllers/          # Kontroler untuk memproses HTTP request, validasi body, & logging
│   ├── routes/               # Deklarasi endpoint REST API sistem
│   ├── services/             # Layer core business logic (Grafana, Prometheus SSH, SNMP, Query Engine)
│   └── types/                # Tipe TypeScript kustom & deklarasi modul eksternal
├── public/                   # Static Frontend Web Assets
│   ├── css/                  # Styling & Token warna HSL (style.css)
│   ├── js/                   # Logical Controller & State SPA (app.js)
│   ├── index.html            # Markup HTML template utama
│   └── fullscreen.html       # Mode layar penuh visualisasi slideshow dashboard
├── data/                     # Folder persisten lokal (cadangan legacy konfigurasi JSON)
└── .github/                  # Konfigurasi repositori dan otomatisasi GitHub CI/CD
```

---

## 4. Desain Skema Database (PostgreSQL)

Hephaestus menggunakan PostgreSQL untuk menyimpan seluruh data operasional portal. Modul inisialisasi skema terletak pada [db.ts](file:///e:/HOME/github-repo/hephaestus/src/config/db.ts).

### 4.1. Tabel-Tabel Utama

1.  **`grafana_configs`**
    *   Menyimpan profil koneksi ke server Grafana.
    *   Kolom: `id` (PK), `name`, `host`, `token`, `datasource_uid`, `is_active`.
2.  **`prometheus_configs`**
    *   Menyimpan profil target Prometheus. Mendukung tipe lokal atau SSH remote tunnel.
    *   Kolom: `id` (PK), `name`, `mode`, `path`, `reload_url`, `ssh_host`, `ssh_port`, `ssh_user`, `ssh_password`, `ssh_key`, `is_active`.
3.  **`monitoring_views`**
    *   Menyimpan konfigurasi tayangan slideshow multi-dashboard.
    *   Kolom: `id` (PK), `name`, `description`, `interval`, `mode`, `panels` (JSONB).
4.  **`imported_mibs`**
    *   Daftar modul MIB SNMP yang diunggah oleh operator.
    *   Kolom: `name` (PK), `node_count`, `imported_at`.
5.  **`oid_registry`**
    *   Daftar objek OID hasil pemindaian isi berkas MIB untuk translasi.
    *   Kolom: `oid` (PK), `name`, `mib_name` (FK), `syntax`, `access`, `description`.
6.  **`users` & `system_roles`**
    *   Otorisasi & Otentikasi login portal. Default user: `sysadmin` (password: `hephaestus`).
7.  **`activity_logs`**
    *   Audit trail untuk merekam setiap aktivitas perubahan konfigurasi atau eksekusi perintah penting.

### 4.2. Pengoptimalan Indeks
Tabel `oid_registry` dilengkapi dengan indeks performa untuk pencarian translasi berbasis *prefix matching*:
```sql
CREATE INDEX IF NOT EXISTS idx_oid_registry_mib_name ON oid_registry(mib_name);
CREATE INDEX IF NOT EXISTS idx_oid_registry_lower_name ON oid_registry(lower(name));
CREATE INDEX IF NOT EXISTS idx_oid_registry_lower_oid ON oid_registry(lower(oid));
```

---

## 5. Implementasi Alur Bisnis (Core Services)

### 5.1. Prometheus SSH & Reload Configuration
Layanan [prometheus.service.ts](file:///e:/HOME/github-repo/hephaestus/src/services/prometheus.service.ts) menangani pembaruan file target `prometheus.yml`:
*   Apabila profil aktif diatur ke **Lokal**, file langsung diperbarui di filesystem server backend.
*   Apabila profil aktif diatur ke **SSH**, koneksi terenkripsi dibuka melalui `ssh2`. SFTP stream digunakan untuk mentransfer data config, lalu perintah reload dipicu jarak jauh menggunakan curl ke HTTP reload endpoint Prometheus target.
*   Validasi keabsahan struktur sintaksis YAML dilakukan dengan meluncurkan `promtool check config` pada file temporer sebelum disimpan.

### 5.2. SNMP Query & MIB Translation
Layanan [snmp.service.ts](file:///e:/HOME/github-repo/hephaestus/src/services/snmp.service.ts) menggunakan perintah CLI host untuk menjaga kestabilan request:
*   Mengeksekusi command `snmpget` dan `snmpwalk` melalui modul `child_process.exec` bawaan Node.js.
*   OID numerik hasil query diterjemahkan kembali ke nama objek MIB menggunakan query SQL yang dioptimalkan:
    ```sql
    SELECT oid, name FROM oid_registry WHERE $1 LIKE oid || '%' ORDER BY length(oid) DESC LIMIT 1
    ```
    Teknik di atas mencari kecocokan prefiks terpanjang untuk memetakan child-nodes OID SNMP secara dinamis.

### 5.3. Query Explorer Alignment
Layanan [query-explorer.service.ts](file:///e:/HOME/github-repo/hephaestus/src/services/query-explorer.service.ts) bertindak sebagai jembatan data metrik:
*   Menghubungi endpoint API query range milik datasource Grafana melalui token bearer kustom.
*   Data metrik mentah yang memiliki rentang waktu berbeda diselaraskan berdasarkan kesamaan *epoch timestamp* sebelum dikirimkan ke UI dalam representasi baris tabular.

---

## 6. Arsitektur Frontend Single Page Application (SPA)

Frontend dirancang menggunakan arsitektur Vanilla SPA pada berkas [index.html](file:///e:/HOME/github-repo/hephaestus/public/index.html) dan [app.js](file:///e:/HOME/github-repo/hephaestus/public/js/app.js):
*   **Routing Klien**: Menggunakan perubahan hash URL browser (`#overview`, `#settings`, `#prometheus`, dll). Event handler `window.addEventListener("hashchange", ...)` menangkap navigasi, memicu penutupan panel aktif, dan merender panel baru.
*   **Aesthetics & Theme**: Seluruh antarmuka menggunakan token warna kustom HSL, font Inter & Outfit, efek *glassmorphism*, dan animasi transisi CSS mikro untuk menciptakan kesan premium dan modern tanpa ketergantungan library visual luar.
*   **State Management**: Konfigurasi koneksi yang aktif disimpan di memori frontend saat inisialisasi awal aplikasi agar dapat dengan cepat merutekan endpoint AJAX query ke modul yang sedang disorot.
