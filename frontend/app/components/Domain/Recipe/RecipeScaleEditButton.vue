<template>
  <!-- display: contents lets these controls wrap inside the parent row, so on a phone the quick picks drop to their own line -->
  <div v-if="yieldDisplay" class="scale-controls">
    <div class="scale-controls">
      <div>
        <v-menu
          v-model="menu"
          :disabled="!canEditScale"
          offset-y
          top
          nudge-top="6"
          :close-on-content-click="false"
        >
          <template #activator="{ props: activatorProps }">
            <v-tooltip
              v-if="canEditScale"
              size="small"
              location="top"
              color="secondary-darken-1"
            >
              <template #activator="{ props: tooltipProps }">
                <v-card
                  class="pa-1 px-2"
                  dark
                  color="secondary-darken-1"
                  size="small"
                  v-bind="{ ...activatorProps, ...tooltipProps }"
                  :style="{ cursor: canEditScale ? '' : 'default' }"
                >
                  <v-icon
                    v-if="canEditScale"
                    size="small"
                    class="mr-2"
                  >
                    {{ $globals.icons.edit }}
                  </v-icon>
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <span v-html="yieldDisplay" />
                </v-card>
              </template>
              <span> {{ $t("recipe.edit-scale") }} </span>
            </v-tooltip>
            <v-card
              v-else
              class="pa-1 px-2"
              dark
              color="secondary-darken-1"
              size="small"
              v-bind="activatorProps"
              :style="{ cursor: canEditScale ? '' : 'default' }"
            >
              <v-icon
                v-if="canEditScale"
                size="small"
                class="mr-2"
              >
                {{ $globals.icons.edit }}
              </v-icon>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-html="yieldDisplay" />
            </v-card>
          </template>
          <v-card min-width="300px">
            <v-card-title class="mb-0">
              {{ $t("recipe.servings") }}
            </v-card-title>
            <v-card-text class="mt-n5">
              <div class="mt-4 d-flex align-center">
                <v-number-input
                  :model-value="yieldQuantity"
                  :precision="null"
                  :min="0"
                  variant="underlined"
                  control-variant="hidden"
                  @update:model-value="recalculateScale($event || 0)"
                />
                <v-tooltip
                  location="end"
                  color="secondary-darken-1"
                >
                  <template #activator="{ props: resetTooltipProps }">
                    <v-btn
                      v-bind="resetTooltipProps"
                      icon
                      flat
                      class="mx-1"
                      size="small"
                      @click="scale = 1"
                    >
                      <v-icon>
                        {{ $globals.icons.undo }}
                      </v-icon>
                    </v-btn>
                  </template>
                  <span> {{ $t("recipe.reset-servings-count") }} </span>
                </v-tooltip>
              </div>
            </v-card-text>
          </v-card>
        </v-menu>
      </div>
      <BaseButtonGroup
        v-if="canEditScale"
        :large="false"
        :buttons="[
          {
            icon: $globals.icons.minus,
            text: $t('recipe.decrease-scale-label'),
            event: 'decrement',
            disabled: disableDecrement,
          },
          {
            icon: $globals.icons.createAlt,
            text: $t('recipe.increase-scale-label'),
            event: 'increment',
          },
        ]"
        @decrement="recalculateScale(yieldQuantity - 1)"
        @increment="recalculateScale(yieldQuantity + 1)"
      />
      <!-- quick picks: tap 2x/3x/4x; tap the lit one again to go back to as written -->
      <v-btn-toggle
        v-if="canEditScale"
        :model-value="quickPick"
        color="primary"
        density="compact"
        variant="text"
        divided
        @update:model-value="scale = $event || 1"
      >
        <v-btn
          v-for="multiplier in quickMultipliers"
          :key="multiplier"
          :value="multiplier"
          size="small"
          :aria-label="$t('recipe.scale-by-multiplier', { multiplier })"
        >
          {{ multiplier }}x
        </v-btn>
      </v-btn-toggle>
    </div>
  </div>
</template>

<script setup lang="ts">
import { calculateScaleFromYield, useScaledAmount } from "~/composables/recipes/use-scaled-amount";

interface Props {
  recipeServings?: number;
  editScale?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  recipeServings: 0,
  editScale: false,
});

const scale = defineModel<number>({ required: true });

const i18n = useI18n();
const menu = ref<boolean>(false);
const canEditScale = computed(() => props.editScale && props.recipeServings > 0);

function recalculateScale(newYield: number) {
  const newScale = calculateScaleFromYield(newYield, props.recipeServings);
  if (newScale !== null) {
    scale.value = newScale;
  }
}

const recipeYieldAmount = computed(() => {
  return useScaledAmount(props.recipeServings, scale.value);
});
const yieldQuantity = computed(() => recipeYieldAmount.value.scaledAmount);
const yieldDisplay = computed(() => {
  return yieldQuantity.value
    ? i18n.t(
      "recipe.serves-amount", { amount: recipeYieldAmount.value.scaledAmountDisplay },
    ) as string
    : "";
});

const quickMultipliers = [2, 3, 4];
const quickPick = computed(() => quickMultipliers.find(m => Math.abs(scale.value - m) < 1e-9) ?? null);

const disableDecrement = computed(() => {
  return yieldQuantity.value <= 1;
});
</script>

<style scoped>
.scale-controls {
  display: contents;
}
</style>
