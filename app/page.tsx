"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { loadData } from "@/lib/storage";

export default function Home() {
  const [data] = useState(() => loadData());

  const stats = useMemo(
    () => [
      { label: "Guru", value: data.teachers.length, href: "/guru" },
      { label: "Kelas", value: data.classes.length, href: "/kelas" },
      { label: "Mapel", value: data.subjects.length, href: "/mapel" },
      { label: "Jadwal", value: data.schedules.length, href: "/jadwal" },
      { label: "Ujian", value: data.examSchedules.length, href: "/ujian" },
    ],
    [data],
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Dashboard</h1>
        <p>
          Kelola data master, atur jadwal guru dengan drag-and-drop, lalu backup data lewat JSON,
          Excel, atau PDF tanpa database. Sekarang juga mendukung jadwal ujian.
        </p>
      </div>

      <div className="stats-grid">
        {stats.map((item) => (
          <Link key={item.label} href={item.href} className="stat-card stat-link">
            <h3>{item.value}</h3>
            <p>{item.label}</p>
          </Link>
        ))}
      </div>

      <div className="dashboard-grid">
        <article className="hint-card">
          <h2>Alur Cepat</h2>
          <ol>
            <li>Isi Guru, Kelas, dan Mata Pelajaran.</li>
            <li>Atur aturan jam khusus guru jika perlu.</li>
            <li>Buat kartu jadwal dan seret ke slot yang sesuai.</li>
            <li>Gunakan export JSON, Excel, atau PDF untuk backup.</li>
          </ol>
        </article>

        <article className="hint-card accent">
          <h2>Shortcut Menu</h2>
          <div className="shortcut-list">
            <Link href="/guru" className="shortcut-btn">Data Guru</Link>
            <Link href="/kelas" className="shortcut-btn">Data Kelas</Link>
            <Link href="/mapel" className="shortcut-btn">Data Mapel</Link>
            <Link href="/aturan-guru" className="shortcut-btn">Aturan Guru</Link>
            <Link href="/jadwal" className="shortcut-btn">Susun Jadwal</Link>
            <Link href="/ujian" className="shortcut-btn">Jadwal Ujian</Link>
            <Link href="/data" className="shortcut-btn">Backup Data</Link>
          </div>
        </article>
      </div>
    </section>
  );
}
