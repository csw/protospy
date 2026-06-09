// src/components/protospy/shortcuts-overlay.tsx
// The keyboard help sheet. Store-driven open state (`helpOpen`, same pattern as
// `cmdKOpen`): opened by the `?` key, the status-bar "? shortcuts" hint, and the
// command palette's "Show keyboard shortcuts" command; dismissed by Esc (Dialog
// handles it) or clicking outside. Pure reference — it triggers no actions.

import { useStore } from "@ui/state/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Shortcut {
  keys: string[];
  label: string;
}
interface ShortcutGroup {
  heading: string;
  items: Shortcut[];
}

// Single source of truth for the key map — also reflected by app-shell's handler.
export const SHORTCUTS: ShortcutGroup[] = [
  {
    heading: "Navigate",
    items: [
      { keys: ["j"], label: "Next request" },
      { keys: ["k"], label: "Previous request" },
      { keys: ["↓"], label: "Next request" },
      { keys: ["↑"], label: "Previous request" },
    ],
  },
  {
    heading: "Search & filter",
    items: [
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["/"], label: "Focus the filter" },
      { keys: ["esc"], label: "Clear filter / active trace" },
    ],
  },
  {
    heading: "View",
    items: [{ keys: ["?"], label: "This help" }],
  },
];

export function ShortcutsOverlay() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-sm font-semibold">
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto p-2">
          {SHORTCUTS.map((g) => (
            <section key={g.heading} className="mb-1 last:mb-0">
              <h3 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.heading}
              </h3>
              {g.items.map((s) => (
                <div
                  key={s.label + s.keys.join()}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-secondary-foreground"
                >
                  <span>{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-b-2 bg-secondary px-1.5 py-px font-mono text-[10.5px] text-muted-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
