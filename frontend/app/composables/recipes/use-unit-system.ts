import { useLocalStorage } from "@vueuse/core";
import type { UnitSystem } from "./unit-systems";

/**
 * Whether scaled ingredients are restated in their tidiest unit (2 tsp at 3x reads as 2 tbsp)
 * until the reader says otherwise. A recipe at 1x always reads exactly as written either way.
 */
export const TIDY_SCALED_UNITS_DEFAULT = true;

/**
 * The unit system recipes are displayed in, or null to show them exactly as they were written.
 *
 * Null is the default and stays the default: a recipe reads as its author typed it until the
 * reader opts in. Nothing is inferred from their locale, because guessing wrong silently
 * rewrites every quantity on the page.
 *
 * Stored per browser rather than on the account — there's no household or user setting for
 * this, so it doesn't sync across devices.
 */
export function useUnitSystem() {
  const preference = useLocalStorage<{ unitSystem: UnitSystem | null; tidyScaledUnits: boolean }>(
    "recipe-unit-system-preferences",
    { unitSystem: null, tidyScaledUnits: TIDY_SCALED_UNITS_DEFAULT },
    { mergeDefaults: true },
  );

  const unitSystem = computed<UnitSystem | null>({
    get: () => preference.value.unitSystem,
    set: (value) => {
      preference.value.unitSystem = value;
    },
  });

  const tidyScaledUnits = computed<boolean>({
    get: () => preference.value.tidyScaledUnits,
    set: (value) => {
      preference.value.tidyScaledUnits = value;
    },
  });

  /** Whether quantities are being rewritten at all, as opposed to shown as authored. */
  const isConverting = computed(() => unitSystem.value !== null);

  function showAsWritten() {
    preference.value.unitSystem = null;
  }

  return { unitSystem, tidyScaledUnits, isConverting, showAsWritten };
}
