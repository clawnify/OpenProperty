import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "./password-policy";

describe("password-policy", () => {
  it("pins creation minimum to 8 (signup/reset; login must not enforce)", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
