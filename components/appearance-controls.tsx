"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light" | "comfort";

const themes: Array<{ value: Theme; label: string; icon: string }> = [
  { value: "dark", label: "داكن", icon: "◐" },
  { value: "light", label: "فاتح", icon: "○" },
  { value: "comfort", label: "مريح", icon: "◒" },
];

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  localStorage.setItem("moataz-theme", theme);
}

export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("moataz-theme");
    const next: Theme =
      stored === "light" || stored === "comfort" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    const frame = requestAnimationFrame(() => {
      setTheme(next);
      applyTheme(next);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function cycleTheme() {
    const current = themes.findIndex((item) => item.value === theme);
    const next = themes[(current + 1) % themes.length].value;
    setTheme(next);
    applyTheme(next);
  }

  const active = themes.find((item) => item.value === theme) ?? themes[0];

  return (
    <button
      className={`appearance-control${compact ? " compact" : ""}`}
      type="button"
      onClick={cycleTheme}
      aria-label={`المظهر الحالي: ${active.label}. اضغط للتبديل`}
      title={`المظهر: ${active.label}`}
    >
      <span aria-hidden="true">{active.icon}</span>
      {!compact && <b>{active.label}</b>}
    </button>
  );
}
