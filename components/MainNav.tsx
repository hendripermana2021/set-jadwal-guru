"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  { href: "/", label: "Beranda" },
  { href: "/guru", label: "Guru" },
  { href: "/kelas", label: "Kelas" },
  { href: "/mapel", label: "Mata Pelajaran" },
  { href: "/aturan-guru", label: "Aturan Guru" },
  { href: "/jam-pelajaran", label: "Jam Pelajaran" },
  { href: "/jadwal", label: "Jadwal" },
  { href: "/ujian", label: "Ujian" },
  { href: "/data", label: "Import / Export" },
];

export default function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="top-nav">
      {menus.map((menu) => {
        const active = pathname === menu.href;
        return (
          <Link key={menu.href} href={menu.href} className={active ? "nav-link active" : "nav-link"}>
            {menu.label}
          </Link>
        );
      })}
    </nav>
  );
}
