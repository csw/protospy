import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      aria-label="Toggle theme"
      className="font-family-ui text-xs font-black tracking-[0.16em] uppercase px-3 py-1 border border-border text-dim hover:text-mid transition-colors"
    >
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}
