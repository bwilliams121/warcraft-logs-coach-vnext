/**
 * The class/spec mapper, and the one mistake it must never make.
 *
 * Returning an error is cheap and recoverable. Returning `rogue/assassination`
 * for a player who was not an Assassination Rogue is neither: it runs Rogue
 * rules over someone else's fight and produces a confident, well-formed report
 * about the wrong game, with nothing downstream able to notice.
 *
 * So most of this file is about what does NOT resolve. Every near-miss a
 * forgiving mapper would "helpfully" repair — a typo, a prefix, an extra word,
 * the right spec under the wrong class — is written down and pinned as a
 * refusal, because each one is a way the dangerous outcome could arrive later
 * disguised as a convenience.
 */

import { describe, expect, it } from "vitest";

import {
  SUPPORTED_SPEC_IDENTITIES,
  resolveSpecIdentity,
  type SpecIdentityResolution,
} from "../../src/services/spec-identity.js";

function resolve(className: string, specName: string): SpecIdentityResolution {
  return resolveSpecIdentity({ className, specName });
}

/** Compact assertion helper, so a failure names the input that produced it. */
function outcome(className: string, specName: string): string {
  const result = resolve(className, specName);
  return result.ok ? result.specId : result.reason;
}

describe("the supported identities", () => {
  it("maps Rogue/Assassination to the Assassination spec id", () => {
    expect(outcome("Rogue", "Assassination")).toBe("rogue/assassination");
  });

  it("maps Paladin/Protection to the Protection spec id (public since M10-D)", () => {
    expect(outcome("Paladin", "Protection")).toBe("paladin/protection");
    // The same normalization as Assassination: casing and surrounding
    // whitespace only.
    expect(outcome("paladin", "protection")).toBe("paladin/protection");
    expect(outcome("  Paladin ", " Protection")).toBe("paladin/protection");
    expect(outcome("PALADIN", "PROTECTION")).toBe("paladin/protection");
  });

  it("resolves Paladin/Retribution to paladin/retribution (M11-A5)", () => {
    // The canonical module identity (`wclClassName`/`wclSpecName` of
    // RETRIBUTION_PALADIN_MODULE), under the same normalization as the others.
    expect(outcome("Paladin", "Retribution")).toBe("paladin/retribution");
    expect(outcome("paladin", "retribution")).toBe("paladin/retribution");
    expect(outcome("  Paladin ", " Retribution")).toBe("paladin/retribution");
    expect(outcome("PALADIN", "RETRIBUTION")).toBe("paladin/retribution");
  });

  it("resolves DeathKnight/Blood to deathknight/blood (M11-B12)", () => {
    // The canonical module identity (`wclClassName`/`wclSpecName` of
    // BLOOD_DEATH_KNIGHT_MODULE), under the same normalization as the others.
    // The class string has no space and no hyphen: it is the one Warcraft
    // Logs reports as `subType`, and the table matches it exactly.
    expect(outcome("DeathKnight", "Blood")).toBe("deathknight/blood");
    expect(outcome("deathknight", "blood")).toBe("deathknight/blood");
    expect(outcome("  DeathKnight ", " Blood")).toBe("deathknight/blood");
    expect(outcome("DEATHKNIGHT", "BLOOD")).toBe("deathknight/blood");
    // Neither a spaced nor a hyphenated class name is the canonical string,
    // and no other Death Knight specialization resolves.
    expect(outcome("Death Knight", "Blood")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Death-Knight", "Blood")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("DeathKnight", "Frost")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("DeathKnight", "Unholy")).toBe("UNSUPPORTED_SPECIALIZATION");
    // Right spec name, wrong class: a Blood Elf is not a specialization and a
    // Warrior has no Blood spec.
    expect(outcome("Warrior", "Blood")).toBe("UNSUPPORTED_SPECIALIZATION");
  });

  it("resolves Monk/Brewmaster to monk/brewmaster (M11-C4j) and Monk/Mistweaver to monk/mistweaver (HEAL-B1P), and no other Monk specialization", () => {
    // The canonical module identity (`wclClassName`/`wclSpecName` of
    // BREWMASTER_MONK_MODULE), under the same normalization as the others.
    expect(outcome("Monk", "Brewmaster")).toBe("monk/brewmaster");
    expect(outcome("monk", "brewmaster")).toBe("monk/brewmaster");
    expect(outcome("  Monk ", " Brewmaster")).toBe("monk/brewmaster");
    expect(outcome("MONK", "BREWMASTER")).toBe("monk/brewmaster");
    // HEAL-B1P: Mistweaver resolves only to itself.
    expect(outcome("Monk", "Mistweaver")).toBe("monk/mistweaver");
    expect(outcome(" monk ", "MISTWEAVER")).toBe("monk/mistweaver");
    // The same class never stands for a promoted specialization, and no
    // repair makes a near-miss supported.
    expect(outcome("Monk", "Windwalker")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Monk", "Mist weaver")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Monk", "Brew master")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Monk", "Brewmasterr")).toBe("UNSUPPORTED_SPECIALIZATION");
    // Right spec name, wrong class.
    expect(outcome("Paladin", "Brewmaster")).toBe("UNSUPPORTED_SPECIALIZATION");
  });

  it("recognizes exactly nine specializations", () => {
    // Pinned. This table is the entire definition of "which specializations this
    // build recognizes", and it should be impossible to grow by accident.
    expect(Object.keys(SUPPORTED_SPEC_IDENTITIES)).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
      "deathknight/blood",
      "monk/brewmaster",
      "evoker/augmentation",
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
    ]);
  });

  it("resolves Evoker/Augmentation to evoker/augmentation (M13-F), and no other Evoker specialization", () => {
    expect(outcome("Evoker", "Augmentation")).toBe("evoker/augmentation");
    expect(outcome(" evoker ", "AUGMENTATION")).toBe("evoker/augmentation");
    expect(outcome("Evoker", "Devastation")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Evoker", "Preservation")).toBe("UNSUPPORTED_SPECIALIZATION");
  });

  it("does not let one Paladin specialization stand for another", () => {
    // Same class, different spec: each supported Paladin spec resolves only to
    // itself (Holy since HEAL-B1P), and there is no nearest-match.
    expect(outcome("Paladin", "Retribution")).toBe("paladin/retribution");
    expect(outcome("Paladin", "Protection")).toBe("paladin/protection");
    expect(outcome("Paladin", "Holy")).toBe("paladin/holy");
    expect(outcome("Paladin", "Holyy")).toBe("UNSUPPORTED_SPECIALIZATION");
    // Right spec name, wrong class: a Holy Priest is not a Holy Paladin.
    expect(outcome("Priest", "Holy")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Paladin", "Protection ")).toBe("paladin/protection");
    expect(outcome("Paladin", "Protectionn")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Paladin", "Retributionn")).toBe("UNSUPPORTED_SPECIALIZATION");
    // Right spec name, wrong class: a Protection Warrior is not a Paladin, and
    // no other class has a Retribution spec.
    expect(outcome("Warrior", "Protection")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Warrior", "Retribution")).toBe("UNSUPPORTED_SPECIALIZATION");
  });

  it("maps the id to itself, never to a different spec", () => {
    for (const [key, specId] of Object.entries(SUPPORTED_SPEC_IDENTITIES)) {
      expect(`${key}->${specId}`).toBe(`${key}->${key}`);
    }
  });
});

describe("casing is normalized, and only casing", () => {
  it("accepts Warcraft Logs' own capitalization", () => {
    expect(outcome("Rogue", "Assassination")).toBe("rogue/assassination");
  });

  it("accepts any casing of the same words", () => {
    // Capitalization of these fields is a presentation choice upstream, not a
    // contract, and `rogue` and `Rogue` are the same class by any reading.
    for (const [className, specName] of [
      ["rogue", "assassination"],
      ["ROGUE", "ASSASSINATION"],
      ["RoGuE", "aSsAsSiNaTiOn"],
    ]) {
      expect(`${className}/${specName}`).toBe(`${className}/${specName}`);
      expect(outcome(className as string, specName as string)).toBe("rogue/assassination");
    }
  });
});

describe("surrounding whitespace is trimmed, and only surrounding whitespace", () => {
  it("accepts padded values", () => {
    expect(outcome("  Rogue  ", "\tAssassination\n")).toBe("rogue/assassination");
  });

  it("does not collapse interior whitespace", () => {
    // Trimming removes something that carries no meaning. Rewriting the inside
    // of a word is repair, and repair is how a typo becomes a supported spec.
    expect(outcome("Rogue", "Assassin ation")).toBe("UNSUPPORTED_SPECIALIZATION");
    expect(outcome("Ro gue", "Assassination")).toBe("UNSUPPORTED_SPECIALIZATION");
  });

  it("treats a whitespace-only value as unusable rather than unsupported", () => {
    expect(outcome("   ", "Assassination")).toBe("IDENTITY_NOT_USABLE");
    expect(outcome("Rogue", "\t\n ")).toBe("IDENTITY_NOT_USABLE");
  });
});

describe("nothing missing resolves", () => {
  it("refuses an empty class", () => {
    expect(outcome("", "Assassination")).toBe("IDENTITY_NOT_USABLE");
  });

  it("refuses an empty spec", () => {
    expect(outcome("Rogue", "")).toBe("IDENTITY_NOT_USABLE");
  });

  it("refuses both empty", () => {
    expect(outcome("", "")).toBe("IDENTITY_NOT_USABLE");
  });

  it("keeps an unusable identity distinct from an unsupported one", () => {
    // One is a data problem, the other a coverage limit. They need different
    // remedies, so they must not share a reason.
    expect(outcome("", "Assassination")).not.toBe(outcome("Warrior", "Arms"));
  });
});

describe("no unsupported identity falls through to a supported specialization", () => {
  const unsupported: readonly (readonly [string, string])[] = [
    // The other two Rogue specs — the nearest misses, sharing a class.
    ["Rogue", "Outlaw"],
    ["Rogue", "Subtlety"],
    // Holy, with the class another Holy specialization belongs to (HEAL-B1P
    // made Paladin/Holy supported, so it is no longer a nearest miss here).
    // Holy Priest is also registered INTERNAL_ONLY since HEAL-B2: never
    // publicly resolvable.
    ["Priest", "Holy"],
    // Restoration Druid: registered INTERNAL_ONLY, never publicly resolvable.
    ["Druid", "Restoration"],
    // The canonical captured unsupported identity: A7R6 fight 7, actor 4.
    ["Warrior", "Arms"],
    // Other real specs.
    ["Evoker", "Devastation"],
    ["Priest", "Discipline"],
    ["Death Knight", "Blood"],
    ["Warrior", "Fury"],
    // Right spec, wrong class.
    ["Paladin", "Assassination"],
    ["Mage", "Assassination"],
    ["Warrior", "Protection"],
    ["Rogue", "Protection"],
    ["Rogue", "Retribution"],
    ["Evoker", "Retribution"],
    // Right class, no spec that exists.
    ["Rogue", "Assassinationn"],
    ["Rogue", "Assassin"],
    // Neither exists.
    ["Bard", "Jazz"],
  ];

  for (const [className, specName] of unsupported) {
    it(`refuses ${className}/${specName}`, () => {
      expect(outcome(className, specName)).toBe("UNSUPPORTED_SPECIALIZATION");
    });
  }

  it("never returns a supported id for any of them", () => {
    for (const [className, specName] of unsupported) {
      const result = resolve(className, specName);
      expect(`${className}/${specName}:${result.ok}`).toBe(`${className}/${specName}:false`);
    }
  });
});

describe("no fuzzy, prefix or substring matching exists", () => {
  const nearMisses: readonly (readonly [string, string])[] = [
    // Misspellings. A forgiving mapper would "fix" these.
    ["Rouge", "Assassination"],
    ["Rogue", "Assasination"],
    ["Rogue", "Assassinaton"],
    // Prefixes and extensions of the real words.
    ["Rog", "Assassination"],
    ["Rogue", "Assass"],
    ["Rogues", "Assassination"],
    ["Rogue", "Assassinations"],
    // The combined display name, which is how a UI would render it.
    ["Rogue", "Assassination Rogue"],
    ["Assassination", "Rogue"],
    // The internal id arriving where display strings belong.
    ["rogue/assassination", "rogue/assassination"],
    // Punctuation and separators.
    ["Rogue-", "Assassination"],
    ["Rogue", "Assassination."],
  ];

  for (const [className, specName] of nearMisses) {
    it(`does not repair "${className}" / "${specName}"`, () => {
      const result = resolve(className, specName);
      expect(`${className}|${specName}:${result.ok ? result.specId : "refused"}`).toBe(
        `${className}|${specName}:refused`,
      );
    });
  }

  it("does not accept the key format as a class name", () => {
    // The lookup key is an internal detail. A caller supplying it would be
    // bypassing the translation this module exists to perform.
    expect(outcome("rogue/assassination", "")).toBe("IDENTITY_NOT_USABLE");
  });
});

describe("prototype keys cannot masquerade as a specialization", () => {
  // A plain-object lookup finds inherited members. `constructor` and
  // `toString` would otherwise "resolve" to something that is not a SpecId.
  for (const [className, specName] of [
    ["constructor", "constructor"],
    ["toString", "toString"],
    ["__proto__", "__proto__"],
    ["hasOwnProperty", "hasOwnProperty"],
  ]) {
    it(`refuses ${className}/${specName}`, () => {
      expect(outcome(className as string, specName as string)).toBe("UNSUPPORTED_SPECIALIZATION");
    });
  }
});

describe("a refusal discloses what it saw", () => {
  it("reports the normalized pair that failed", () => {
    const result = resolve("  Warrior ", "Arms");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.observed).toEqual({ className: "warrior", specName: "arms" });
  });

  it("carries no spec id on the failure branch", () => {
    // Structural: there is no variant returning a usable id alongside a
    // failure, so a caller cannot read one out of a refusal.
    const result = resolve("Warrior", "Arms");

    expect("specId" in result).toBe(false);
  });
});
