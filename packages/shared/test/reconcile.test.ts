import { describe, expect, test } from "bun:test";
import { reconcile } from "../src/reconcile";

describe("client reconciliation by revision (ADR-0007)", () => {
  test("with nothing local, any event applies", () => {
    expect(reconcile(null, 7)).toBe("apply");
  });

  test("the same or the next revision applies (a non-queue change keeps the revision)", () => {
    expect(reconcile(4, 4)).toBe("apply");
    expect(reconcile(4, 5)).toBe("apply");
  });

  test("an older revision is dropped", () => {
    expect(reconcile(4, 3)).toBe("drop");
  });

  test("a gap means missed mutations: refetch the snapshot instead", () => {
    expect(reconcile(4, 6)).toBe("refetch");
  });
});
