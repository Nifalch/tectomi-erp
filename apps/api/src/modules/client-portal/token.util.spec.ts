import { generateToken, sha256, safeEqualHex } from "./token.util";

describe("token util", () => {
  it("generates 43+ char base64url tokens with matching sha256 hash", () => {
    const { raw, hash } = generateToken();
    expect(raw.length).toBeGreaterThanOrEqual(43);
    expect(hash).toBe(sha256(raw));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("safeEqualHex returns false for different lengths", () => {
    expect(safeEqualHex("ab", "abcd")).toBe(false);
  });

  it("safeEqualHex returns true for equal strings", () => {
    const h = sha256("hello");
    expect(safeEqualHex(h, h)).toBe(true);
  });
});
