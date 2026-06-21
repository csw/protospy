import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

import { Button } from "@ui/components/ui/button";
import { Toggle } from "@ui/components/ui/toggle";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui/components/ui/dialog";
import { Command, CommandItem, CommandList } from "@ui/components/ui/command";

/**
 * PRO-321 (design-system T2): the vendored primitives must conform to
 * docs/ui/design-system.md §2.2 / §2.3 / §3.2 — neutral interaction surfaces
 * key off protospy elevation tokens, and `accent` is reserved for
 * brand-structural use only (never a neutral hover/selected surface).
 *
 * These guard the token MAPPING at the class layer. The computed-color and
 * real-interaction behaviour live in browser/design-tokens.spec.ts (which
 * exercises the rendered CSS the way the suite can't in jsdom).
 */
describe("primitive design-system conformance (PRO-321)", () => {
  beforeAll(() => {
    // cmdk calls scrollIntoView on its auto-selected item; jsdom lacks it.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function () {};
    }
  });

  it("Toggle default variant: primary-soft on-state, no cursor-pointer, rounded", () => {
    render(
      <Toggle aria-label="trace" pressed>
        x
      </Toggle>,
    );
    const el = screen.getByLabelText("trace");
    // On-state keyed off aria-pressed (standalone Toggle is tooltip-wrapped).
    expect(el).toHaveClass(
      "aria-pressed:bg-primary/10",
      "aria-pressed:text-primary",
    );
    expect(el).toHaveClass("rounded");
    // §2.5 cursor: default cursor, never cursor-pointer.
    expect(el.className).not.toContain("cursor-pointer");
    // No longer keyed off data-[state=on] for the default variant.
    expect(el.className).not.toContain("data-[state=on]:bg-card");
  });

  it("Button ghost/outline hover is neutral bg-hover, not brand accent", () => {
    const { rerender } = render(<Button variant="ghost">ghost</Button>);
    let el = screen.getByRole("button", { name: "ghost" });
    expect(el).toHaveClass("hover:bg-hover", "hover:text-foreground");
    expect(el.className).not.toContain("hover:bg-accent");
    expect(el.className).not.toContain("hover:text-accent-foreground");

    rerender(<Button variant="outline">outline</Button>);
    el = screen.getByRole("button", { name: "outline" });
    expect(el).toHaveClass("hover:bg-hover", "hover:text-foreground");
    expect(el.className).not.toContain("hover:bg-accent");
  });

  it("Tabs line variant carries the primary underline (call sites need not override)", () => {
    render(
      <Tabs value="a">
        <TabsList variant="line">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole("tab", { name: "A" });
    // Primary (brand blue) underline carried by the `line` variant's ::after bar,
    // 2px tall (h-0.5) in the horizontal orientation, positioned at bottom-0.
    expect(trigger).toHaveClass("after:bg-primary");
    expect(trigger.className).toContain(
      "group-data-[orientation=horizontal]/tabs:after:h-0.5",
    );
    expect(trigger.className).toContain(
      "group-data-[orientation=horizontal]/tabs:after:bottom-[-5px]",
    );
    expect(trigger.className).not.toContain("after:bg-accent");
    expect(trigger.className).not.toContain("after:bg-foreground");
  });

  it("DropdownMenu item focus surface uses the selected surface token", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const item = screen.getByRole("menuitem", { name: "Item" });
    expect(item).toHaveClass("focus:bg-accent", "focus:text-accent-foreground");
    expect(item.className).not.toContain("focus:text-foreground");
  });

  it("CommandItem selected surface uses the selected surface token", () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>Run</CommandItem>
        </CommandList>
      </Command>,
    );
    const item = screen.getByText("Run").closest('[data-slot="command-item"]');
    expect(item).toHaveClass(
      "data-[selected=true]:bg-accent",
      "data-[selected=true]:text-accent-foreground",
    );
    expect(item?.className).not.toContain(
      "data-[selected=true]:text-foreground",
    );
  });

  it("Dialog close button open-state surface uses the selected surface token", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>title</DialogTitle>
          <DialogDescription>desc</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("data-[state=open]:bg-accent");
  });
});
