import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@ui/components/ui/tabs";

describe("Tabs line variant (underline treatment)", () => {
  function renderLineTabs(activeValue = "a") {
    return render(
      <Tabs value={activeValue} onValueChange={() => {}}>
        <TabsList variant="line">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>,
    );
  }

  it("TabsList line variant has no background fill", () => {
    const { container } = renderLineTabs();
    const list = container.querySelector('[data-slot="tabs-list"]');
    expect(list).toHaveClass("bg-transparent");
    expect(list).not.toHaveClass("bg-muted");
  });

  it("active trigger in line variant has no card-style background", () => {
    const { container } = renderLineTabs("a");
    const activeTrigger = container.querySelector(
      '[data-slot="tabs-trigger"][data-state="active"]',
    );
    expect(activeTrigger).not.toBeNull();
    // The line variant gates the bg-transparent override via the group data attribute.
    expect(activeTrigger?.className).toContain(
      "group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
    );
    // Shadow is nullified for the line variant.
    expect(activeTrigger?.className).toContain(
      "group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
    );
    // Shadow is gated to the default variant only (not unconditional).
    expect(activeTrigger?.className).toContain(
      "group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm",
    );
  });

  it("active trigger in line variant uses primary-colored underline (after: element)", () => {
    const { container } = renderLineTabs("a");
    const trigger = container.querySelector('[data-slot="tabs-trigger"]');
    expect(trigger?.className).toContain("after:bg-primary");
  });

  it("line variant trigger has rounded-none override", () => {
    const { container } = renderLineTabs("a");
    const trigger = container.querySelector('[data-slot="tabs-trigger"]');
    expect(trigger?.className).toContain(
      "group-data-[variant=line]/tabs-list:rounded-none",
    );
  });
});
