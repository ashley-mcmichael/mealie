import { CUSTOMARY_SYSTEMS, STANDARDIZED_UNITS, UNIT_SYSTEMS, type StandardizedUnit, type UnitRung, type UnitSystem } from "./unit-systems";
import type { CreateIngredientUnit, RecipeIngredient } from "~/lib/api/types/recipe";

interface ConvertibleIngredient {
  quantity: number;
  standardQuantity: number;
  standard: StandardizedUnit;
}

/**
 * How far a rounded quantity may sit from the true one, as a share of it: 0.025 is 2.5% out.
 *
 * A share rather than a fixed amount, because rounding to the nearest 5g is harmless on flour
 * and ruinous on yeast. Fractions get more room since customary measures are coarser — held to
 * the decimal threshold, 7/8 cup is rejected with nothing better to print in its place.
 */
const DECIMAL_ROUNDING_THRESHOLD = 0.025;
const FRACTION_ROUNDING_THRESHOLD = 0.05;

/** Leading digits a rounded decimal may land on, smallest first. */
const DECIMAL_STEPS = [1, 2, 5];

/** Denominators a rounded fraction may use, coarsest first. */
const FRACTION_DENOMINATORS = [1, 2, 3, 4, 8];
const FINEST_DENOMINATOR = Math.max(...FRACTION_DENOMINATORS);

/**
 * How far a tidied quantity may sit from the true one. Tidying restates a unit the author already
 * chose, so it has no excuse to be approximate: 2 1/4 cups must not become 2 1/3 (4% more sugar).
 */
const TIDY_ROUNDING_THRESHOLD = 0.01;

/**
 * Fractions each customary rung may show when tidying, coarsest first — the ones a set of
 * measuring spoons and cups can actually hold. There is no 1/3 tablespoon or 3/8 cup spoon, so
 * 4 tsp stays 4 tsp rather than becoming 1 1/3 tbsp, and 6 tbsp stays 6 tbsp rather than 3/8 cup.
 */
const TIDY_DENOMINATORS: Record<string, number[]> = {
  teaspoon: [1, 2, 4, 8],
  tablespoon: [1, 2],
  cup: [1, 2, 3, 4],
  quart: [1, 2, 4],
  gallon: [1, 2, 4],
  ounce: [1, 2, 4],
  pound: [1, 2, 4],
};

/**
 * Past this many spoonfuls a tidy count stops being easier than the scaled original: nobody
 * measures 22 1/2 tablespoons of sugar, so that falls back to plain scaling instead.
 */
const TIDY_MAX_SPOONS: Record<string, number> = { teaspoon: 8, tablespoon: 8 };

/**
 * Resolve the values needed to convert an ingredient, or null if it can't be converted.
 *
 * An ingredient is only convertible if its unit was matched to a standardized unit when it was
 * created. standardUnit is a free-form string on the wire, so it's checked against the table
 * rather than trusted. Volume never becomes weight — that needs a density per food, which we
 * don't store — so anything unrecognized is left alone rather than guessed at.
 */
function resolveConvertible(ingredient: RecipeIngredient): ConvertibleIngredient | null {
  const { quantity, unit } = ingredient;
  if (!quantity || !unit?.standardUnit || !unit.standardQuantity) {
    return null;
  }

  const standard = STANDARDIZED_UNITS[unit.standardUnit];
  if (!standard) {
    return null;
  }

  return { quantity, standardQuantity: unit.standardQuantity, standard };
}

export function canConvertIngredient(ingredient: RecipeIngredient): boolean {
  return resolveConvertible(ingredient) !== null;
}

/**
 * Pick the rung the magnitude falls on. Rungs are ordered smallest first, and each takes over
 * once the magnitude reaches its takeover multiple, so the last one that fits wins.
 *
 * Falls back to the smallest rung below the whole ladder. Every ladder in UNIT_SYSTEMS is
 * generated with at least two rungs, so there is always one to fall back to.
 */
function pickRung(rungs: UnitRung[], magnitude: number): UnitRung {
  let chosen = rungs[0]!;
  for (const rung of rungs) {
    if (magnitude >= rung.base * rung.takeover) {
      chosen = rung;
    }
  }

  return chosen;
}

/**
 * Round to the coarsest step of 1, 2 or 5 (at any power of ten) that stays within the
 * threshold: 56.699 becomes 56, 1133.98 becomes 1150, 4.929 becomes 5.
 *
 * The step is sized from the value itself, so grams and kilograms round to the same place.
 */
function roundDecimal(value: number, threshold = DECIMAL_ROUNDING_THRESHOLD): number {
  const target = value * threshold * 2;
  const power = 10 ** Math.floor(Math.log10(target));

  let step = power;
  for (const candidate of DECIMAL_STEPS) {
    if (target / power >= candidate) {
      step = candidate * power;
    }
  }

  return Math.round(value / step) * step;
}

/**
 * Snap to the coarsest fraction a kitchen actually measures in, so 3.527oz reads as 3 1/2 and
 * not the 3 5/10 the display's own fraction code would produce. Null when none is close enough,
 * which is a real answer: there is no useful fraction of a cup near 0.42 of one.
 */
function roundFraction(value: number): number | null {
  for (const denominator of FRACTION_DENOMINATORS) {
    const rounded = Math.round(value * denominator) / denominator;
    if (rounded > 0 && Math.abs(rounded - value) <= value * FRACTION_ROUNDING_THRESHOLD) {
      return rounded;
    }
  }

  return null;
}

/**
 * The finest fraction there is, for a value no coarser one was close enough to — "1 cup" is
 * what a reader wants for 250ml despite being 5% shy. Anything too small to reach even this is
 * left unrounded: zero renders as no quantity at all, losing the measurement entirely.
 */
function finestFraction(value: number): number {
  return Math.round(value * FINEST_DENOMINATOR) / FINEST_DENOMINATOR || value;
}

/**
 * Choose the rung a magnitude is displayed on, and round it for that rung.
 *
 * The rung below is tried only when the chosen one can't express the value at all — under a
 * whole unit of it, with no fraction close enough. Only cups reach that, being the one rung
 * that takes over below a whole unit, so 100ml reads as 7 tablespoons rather than 3/8 cup.
 */
function roundToRung(rungs: UnitRung[], magnitude: number): { rung: UnitRung; quantity: number } {
  const rung = pickRung(rungs, magnitude);
  const value = magnitude / rung.base;

  if (!rung.fraction) {
    return { rung, quantity: roundDecimal(value) };
  }

  const rounded = roundFraction(value);
  if (rounded !== null) {
    return { rung, quantity: rounded };
  }

  const below = rungs[rungs.indexOf(rung) - 1];
  if (below && value < 1) {
    const dropped = magnitude / below.base;
    return { rung: below, quantity: roundFraction(dropped) ?? finestFraction(dropped) };
  }

  return { rung, quantity: finestFraction(value) };
}

/**
 * Find the largest rung that states a magnitude exactly, as a kitchen would measure it, or null
 * when none does. Every rung but the smallest must reach its takeover multiple, so 1/2 tbsp is
 * never offered over 1 1/2 tsp.
 */
function findTidyRung(rungs: UnitRung[], magnitude: number): { rung: UnitRung; quantity: number } | null {
  for (let i = rungs.length - 1; i >= 0; i--) {
    const rung = rungs[i]!;
    const value = magnitude / rung.base;
    // Bases are irrational in each other's terms, so 3 tsp lands a hair under 1 tbsp
    if (i > 0 && value < rung.takeover * (1 - 1e-9)) {
      continue;
    }

    if (!rung.fraction) {
      return { rung, quantity: roundDecimal(value, TIDY_ROUNDING_THRESHOLD) };
    }

    for (const denominator of TIDY_DENOMINATORS[rung.unit] ?? [1]) {
      const rounded = Math.round(value * denominator) / denominator;
      if (rounded > 0 && Math.abs(rounded - value) <= value * TIDY_ROUNDING_THRESHOLD) {
        if (rounded > (TIDY_MAX_SPOONS[rung.unit] ?? Infinity)) {
          return null;
        }
        return { rung, quantity: rounded };
      }
    }
  }

  return null;
}

export function useUnitConversion() {
  const { t, te } = useI18n();

  /**
   * Names come from the ingredient unit seed data, which app/lang/locales/*.ts merge into the
   * messages under `unit-names`. That data is already translated into every locale Mealie
   * ships, so nothing here is authored per-locale.
   */
  function unitFromRung(rung: UnitRung): CreateIngredientUnit {
    const key = `unit-names.${rung.seedKey}`;
    const abbreviation = t(`${key}.abbreviation`);

    return {
      name: t(`${key}.name`),
      pluralName: t(`${key}.plural_name`),
      abbreviation,
      // Most seeded units have no distinct plural abbreviation, and a missing key would render
      // as the key itself rather than falling back to the singular
      pluralAbbreviation: te(`${key}.plural_abbreviation`) ? t(`${key}.plural_abbreviation`) : abbreviation,
      // A converted unit follows its own system's conventions rather than the source unit's
      // display settings: decimals for metric, fractions for customary, and both abbreviated.
      // Inheriting useAbbreviation put "ml" and "milliliters" in the same ingredient list.
      fraction: rung.fraction,
      useAbbreviation: true,
    };
  }

  /**
   * Restate an ingredient in the given unit system. Display only — nothing is written back.
   *
   * An ingredient already measured in the reader's own system is returned untouched, so
   * choosing a system only ever rewrites units that are foreign to it.
   *
   * Where conversion does happen, the unit and the rounding are both decided from the *scaled*
   * magnitude — rounding at 1x and scaling after would multiply the raggedness back in — then
   * the quantity is divided back out by the scale, so existing call sites still apply it
   * themselves. 4oz at 10x comes back as 1.15 kilogram rather than 1134 grams.
   *
   * Ingredients that can't be converted are returned unchanged, with the same object identity.
   */
  function convertIngredient(ingredient: RecipeIngredient, system: UnitSystem, scale = 1): RecipeIngredient {
    const convertible = resolveConvertible(ingredient);
    if (!convertible) {
      return ingredient;
    }

    const { quantity, standardQuantity, standard } = convertible;

    // Already written in the system the reader asked for, so leave it exactly as authored
    // rather than restating "1 pint" as "2 cups". Only genuinely foreign units get rewritten.
    if (standard.customary === CUSTOMARY_SYSTEMS.includes(system)) {
      return ingredient;
    }

    const magnitude = quantity * standardQuantity * standard.base;
    const rungs = UNIT_SYSTEMS[system][standard.dimension];
    const { rung, quantity: displayed } = roundToRung(rungs, magnitude * scale);

    return {
      ...ingredient,
      quantity: displayed / scale,
      unit: unitFromRung(rung),
    };
  }

  /**
   * Restate a scaled ingredient in the tidiest unit of the system it was written in, so 2 tsp at
   * 3x reads as 2 tbsp rather than 6 tsp. Display only — nothing is written back.
   *
   * At 1x the recipe is shown exactly as written. Otherwise the largest unit that states the
   * scaled amount exactly (within 1%) in measurable fractions wins; when none does, the
   * ingredient is returned unchanged, with the same object identity, and scales as it always has.
   * Volumes climb no higher than cups unless the author wrote in something bigger, since recipes
   * say "4 cups", not "1 quart".
   *
   * Like convertIngredient, the quantity handed back is unscaled so call sites apply scale.
   */
  function tidyScaledIngredient(ingredient: RecipeIngredient, scale = 1): RecipeIngredient {
    const convertible = scale !== 1 ? resolveConvertible(ingredient) : null;
    if (!convertible) {
      return ingredient;
    }

    const { quantity, standardQuantity, standard } = convertible;
    const system: UnitSystem = standard.customary ? "us" : "metric";
    const authoredBase = standardQuantity * standard.base;
    const cup = UNIT_SYSTEMS[system][standard.dimension].find(rung => rung.unit === "cup");
    const ceiling = cup ? Math.max(cup.base, authoredBase) * (1 + 1e-9) : Infinity;
    const rungs = UNIT_SYSTEMS[system][standard.dimension].filter(rung => rung.base <= ceiling);

    const tidy = findTidyRung(rungs, quantity * authoredBase * scale);
    if (!tidy) {
      return ingredient;
    }

    // Keep the author's own unit object when the tidy unit is the one they wrote, so its name and
    // display settings survive; only a genuinely different unit is swapped in.
    const sameUnit = Math.abs(tidy.rung.base - authoredBase) <= authoredBase * 1e-6;

    return {
      ...ingredient,
      quantity: tidy.quantity / scale,
      // A tidied unit stays in the author's system, so it keeps their choice of "tbsp" or
      // "tablespoons" rather than switching style mid-list the way a conversion does
      unit: sameUnit
        ? ingredient.unit
        : { ...unitFromRung(tidy.rung), useAbbreviation: ingredient.unit?.useAbbreviation ?? false },
    };
  }

  return { convertIngredient, tidyScaledIngredient };
}
