import { describe, it, expect } from "vitest";
import { buildProfilePatch, MAX_AVATAR_CHARS } from "../utils/profileInput.js";

// What PATCH /me will and will not accept. No database: this is the rule set
// on its own, which is the half of the endpoint worth being certain about —
// it decides whether a profile form can reach a field it has no business
// touching.

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function accept(body: unknown) {
  const result = buildProfilePatch(body);
  if (!result.ok) throw new Error(`expected accept, got: ${result.error}`);
  return result.patch;
}

function reject(body: unknown) {
  const result = buildProfilePatch(body);
  if (result.ok) throw new Error("expected reject, but it was accepted");
  return result.error;
}

describe("which fields get written", () => {
  it("writes only the keys it was sent", () => {
    expect(accept({ bio: "hi" })).toEqual({ bio: "hi" });
  });

  it("writes nothing for an empty body", () => {
    expect(accept({})).toEqual({});
  });

  it("treats a missing body as empty rather than failing", () => {
    expect(accept(null)).toEqual({});
    expect(accept(undefined)).toEqual({});
  });

  it("carries all five editable fields", () => {
    expect(
      accept({ bio: "b", studentNumber: "s", degree: "d", yearOfStudy: "y", avatar: PIXEL })
    ).toEqual({ bio: "b", studentNumber: "s", degree: "d", yearOfStudy: "y", avatar: PIXEL });
  });
});

describe("clearing and trimming", () => {
  it("trims what the student typed", () => {
    expect(accept({ degree: "  BA Law  " })).toEqual({ degree: "BA Law" });
  });

  it("treats an empty string as clearing the field", () => {
    expect(accept({ studentNumber: "" })).toEqual({ studentNumber: null });
  });

  it("treats whitespace alone as clearing the field", () => {
    expect(accept({ bio: "   " })).toEqual({ bio: null });
  });

  it("treats null as clearing the field", () => {
    expect(accept({ bio: null })).toEqual({ bio: null });
    expect(accept({ avatar: null })).toEqual({ avatar: null });
  });

  it("does not let trailing spaces push a field over its limit", () => {
    expect(accept({ bio: `${"x".repeat(280)}    ` })).toEqual({ bio: "x".repeat(280) });
  });
});

describe("length limits match the columns", () => {
  it("accepts a bio at exactly the limit", () => {
    expect(accept({ bio: "x".repeat(280) })).toEqual({ bio: "x".repeat(280) });
  });

  it.each([
    ["bio", 281, /280/],
    ["studentNumber", 33, /32/],
    ["degree", 121, /120/],
    ["yearOfStudy", 33, /32/],
  ])("refuses a %s that is one character too long", (field, length, message) => {
    expect(reject({ [field]: "x".repeat(length) })).toMatch(message);
  });
});

describe("the avatar", () => {
  it("accepts a PNG, JPEG or WebP data URL", () => {
    expect(accept({ avatar: PIXEL })).toEqual({ avatar: PIXEL });
    expect(accept({ avatar: "data:image/jpeg;base64,AAAA" })).toBeTruthy();
    expect(accept({ avatar: "data:image/webp;base64,AAAA" })).toBeTruthy();
  });

  it.each([
    ["a remote URL", "https://example.com/a.png"],
    ["a javascript: URL", "javascript:alert(1)"],
    // SVG can carry script, so it is not in the allowed list even though it
    // is an image type.
    ["an SVG data URL", "data:image/svg+xml;base64,AAAA"],
    ["an HTML data URL", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
    ["non-base64 payload", "data:image/png;base64,<script>"],
  ])("refuses %s", (_label, value) => {
    expect(reject({ avatar: value })).toBeTruthy();
  });

  it("refuses one over the size cap", () => {
    const huge = `data:image/png;base64,${"A".repeat(MAX_AVATAR_CHARS + 1)}`;
    expect(reject({ avatar: huge })).toMatch(/too large/i);
  });
});

describe("fields the profile form must never reach", () => {
  it.each(["email", "passwordHash", "twoFactorSecret", "isTwoFactorEnabled", "id"])(
    "drops %s instead of writing it",
    (field) => {
      expect(accept({ [field]: "anything" })).toEqual({});
    }
  );

  it("lets a whole profile object be posted back without carrying anything dangerous", () => {
    // fullName is editable and comes through; nothing authentication owns does.
    expect(
      accept({
        id: "x",
        email: "attacker@example.com",
        passwordHash: "h",
        memberSince: "2020-01-01",
        bio: "only this moves",
      })
    ).toEqual({ bio: "only this moves" });
  });
});

describe("the display name", () => {
  it("is written when sent", () => {
    expect(accept({ fullName: "Thandi M" })).toEqual({ fullName: "Thandi M" });
  });

  it("is trimmed", () => {
    expect(accept({ fullName: "  Thandi M  " })).toEqual({ fullName: "Thandi M" });
  });

  it("is left alone when not sent", () => {
    expect(accept({ bio: "hi" })).toEqual({ bio: "hi" });
  });

  it.each([["an empty string", ""], ["whitespace alone", "   "]])(
    "refuses %s, because the column is NOT NULL and a blank name breaks the sidebar",
    (_label, value) => {
      expect(reject({ fullName: value })).toMatch(/cannot be empty/i);
    }
  );

  it("refuses null, which would mean clearing it", () => {
    expect(reject({ fullName: null })).toBeTruthy();
  });

  it("refuses one longer than the column", () => {
    expect(reject({ fullName: "n".repeat(256) })).toMatch(/255/);
  });
});

describe("wrong types are refused, not coerced", () => {
  it.each([
    ["a number", { bio: 42 }],
    ["an array", { bio: ["a"] }],
    ["an object", { degree: { value: "x" } }],
    ["a boolean", { degree: true }],
  ])("refuses %s", (_label, body) => {
    expect(reject(body)).toBeTruthy();
  });
});
