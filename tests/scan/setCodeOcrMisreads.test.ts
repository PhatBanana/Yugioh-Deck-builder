import { describe, expect, it } from "vitest";
import { canonSetCode, extractSetCode } from "../../shared/scan/setCode";

// Feedback loop for the "set code never resolves" bug: the code is ~2mm
// gold-on-dark print, exactly where OCR swaps O↔0 and I/l↔1. A misread that
// slips through extractSetCode but canonicalises differently from the
// catalog's real code resolves to NOTHING — the scan files edition-only,
// indistinguishable in a backup from "code not read at all".
//
// Each case asserts the full contract: the OCR line must extract AND
// canonicalise to the same canon as the true printed code.

function resolved(line: string): string | null {
  const raw = extractSetCode([line]);
  return raw ? canonSetCode(raw) : null;
}

describe("extractSetCode tolerates common OCR misreads of the number part", () => {
  it("O read for 0 inside the card number (modern region codes)", () => {
    expect(resolved("SDAZ-ENO18")).toBe(canonSetCode("SDAZ-EN018"));
    expect(resolved("LOB-ENOO1")).toBe(canonSetCode("LOB-EN001"));
  });

  it("O read for 0 in old digits-only numbers", () => {
    expect(resolved("SDY-OO6")).toBe(canonSetCode("SDY-006"));
    expect(resolved("MRL-O47")).toBe(canonSetCode("MRL-047"));
  });

  it("I / l read for 1 inside the card number", () => {
    expect(resolved("RA01-ENOI6")).toBe(canonSetCode("RA01-EN016"));
    expect(resolved("LOB-EN0I2")).toBe(canonSetCode("LOB-EN012"));
  });

  it("never rewrites the set prefix — LOB, IOC stay letters", () => {
    expect(resolved("LOB-EN001")).toBe(canonSetCode("LOB-EN001"));
    expect(resolved("IOC-EN105")).toBe(canonSetCode("IOC-EN105"));
  });

  it("clean codes still pass through untouched", () => {
    expect(resolved("SDCB-EN001")).toBe(canonSetCode("SDCB-EN001"));
    expect(resolved("RA01-EN008")).toBe(canonSetCode("RA01-EN008"));
  });

  it("still rejects hyphenated words — a token needs a real digit", () => {
    expect(resolved("BLUE-EYES WHITE DRAGON")).toBeNull();
    expect(resolved("SOME-LINE OF EFFECT TEXT")).toBeNull();
    expect(resolved("XYZ-DRAGON CANNON")).toBeNull();
  });

  it("keeps letter suffixes and non-region letter runs intact", () => {
    // ENC01-style numbers: the C is real, only O/I/L are misread candidates.
    expect(resolved("HAC1-ENC01")).toBe(canonSetCode("HAC1-ENC01"));
  });
});
