import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_WIDTH,
  INSPECTOR_MIN_WIDTH,
  LIST_MAX_WIDTH,
  LIST_MIN_WIDTH,
} from "@ui/components/paneBounds";

const LIST_MAX_FRACTION = parseFloat(LIST_MAX_WIDTH) / 100;
const NARROWEST_VIEWPORT = 1280;

describe("paneBounds", () => {
  describe("LIST_MIN_WIDTH", () => {
    it("rows floor is lower than table floor", () => {
      expect(LIST_MIN_WIDTH.rows).toBeLessThan(LIST_MIN_WIDTH.table);
    });

    it("rows floor is below the rows default width", () => {
      expect(LIST_MIN_WIDTH.rows).toBeLessThan(DEFAULT_LIST_WIDTH.rows);
    });

    it("table floor is below the table default width", () => {
      expect(LIST_MIN_WIDTH.table).toBeLessThan(DEFAULT_LIST_WIDTH.table);
    });

    it("table floor accommodates the grid intrinsic minimum (458px)", () => {
      // TABLE_COLUMNS: 54 + 42 + 100 (minmax floor) + 54 + 120 + 88 = 458px
      // Plus 3px border-l on each row, 1px border-r on container = ~462px.
      // The floor should be above the intrinsic minimum.
      const gridIntrinsicMin = 54 + 42 + 100 + 54 + 120 + 88;
      expect(LIST_MIN_WIDTH.table).toBeGreaterThan(gridIntrinsicMin);
    });
  });

  describe("mutual consistency at narrowest viewport", () => {
    it("both floors can be honored simultaneously at 1280px", () => {
      // table mode has the wider floor, so check that one
      const requiredWidth = LIST_MIN_WIDTH.table + INSPECTOR_MIN_WIDTH + 1; // +1 for separator
      expect(requiredWidth).toBeLessThan(NARROWEST_VIEWPORT);
    });

    it("LIST_MAX_WIDTH leaves enough room for INSPECTOR_MIN_WIDTH at 1280px", () => {
      const maxListWidth = NARROWEST_VIEWPORT * LIST_MAX_FRACTION;
      const remainingForInspector = NARROWEST_VIEWPORT - maxListWidth - 1;
      expect(remainingForInspector).toBeGreaterThanOrEqual(INSPECTOR_MIN_WIDTH);
    });
  });
});
