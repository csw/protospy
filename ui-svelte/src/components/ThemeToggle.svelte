<script lang="ts">
  type Theme = "light" | "dark";

  function readTheme(): Theme {
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "dark" ? "dark" : "light";
  }

  let theme = $state<Theme>(readTheme());

  $effect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  });
</script>

<button
  onclick={() => {
    theme = theme === "light" ? "dark" : "light";
  }}
  aria-label="Toggle theme"
  class="font-family-ui text-xs font-black tracking-[0.16em] uppercase px-3 py-1 border border-border text-dim hover:text-mid transition-colors"
>
  {theme === "light" ? "Dark" : "Light"}
</button>
