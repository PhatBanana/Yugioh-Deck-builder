import { describe, expect, it } from "vitest";
import { detectStrategy } from "../../shared/metaDecks/strategy";

describe("detectStrategy", () => {
  it("detects common strategies from deck names", () => {
    expect(detectStrategy("Goat Format - Burn")).toBe("Burn");
    expect(detectStrategy("Goat Control")).toBe("Control");
    expect(detectStrategy("Exodia FTK")).toBe("FTK/OTK");
    expect(detectStrategy("Lightsworn Mill")).toBe("Mill");
    expect(detectStrategy("Stun Control")).toBe("Stall"); // stun -> Stall, ranked first
  });

  it("prefers the more defining strategy in combined names", () => {
    // Burn is more defining than Control here
    expect(detectStrategy("Goat Burn/Control")).toBe("Burn");
  });

  it("returns null when no strategy keyword is present", () => {
    expect(detectStrategy("Snake-Eye Fire King")).toBeNull();
    expect(detectStrategy("Edison Teledad")).toBeNull();
  });
});
