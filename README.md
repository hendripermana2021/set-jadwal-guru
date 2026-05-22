# Roster Guru Next.js

Aplikasi penjadwalan guru berbasis Next.js untuk membantu tata usaha menyusun roster tanpa proses Excel manual.

## Fitur

- CRUD data Guru pada menu terpisah.
- CRUD data Kelas pada menu terpisah.
- CRUD data Mata Pelajaran pada menu terpisah.
- Penyusunan jadwal dengan drag-and-drop ke slot hari dan jam.
- Deteksi bentrok otomatis:
	- Guru bentrok di slot yang sama.
	- Kelas bentrok di slot yang sama.
	- Duplikasi entri jadwal.
- Import dan Export JSON untuk backup/restore data.
- Tanpa database: semua data disimpan di local storage browser.

## Menjalankan Aplikasi

```bash
npm run dev
```

Buka http://localhost:3000

## Build Production

```bash
npm run lint
npm run build
npm run start
```

## Catatan Penyimpanan Data

- Data tersimpan lokal pada browser/perangkat yang dipakai.
- Jika cache browser dihapus, data bisa hilang.
- Gunakan menu Import / Export untuk backup berkala.
