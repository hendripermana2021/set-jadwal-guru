"use client";

import { useEffect } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "app-theme-mode";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    document.documentElement.setAttribute("data-theme", initialTheme);
    window.localStorage.setItem(STORAGE_KEY, initialTheme);
  }, []);

  function toggleTheme() {
    const currentTheme =
      document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const nextTheme: ThemeMode = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="Ganti tema terang atau gelap"
      title="Ganti tema"
    >
      <span aria-hidden="true">THEME</span>
      <span>Light / Dark</span>
    </button>
  );
}
