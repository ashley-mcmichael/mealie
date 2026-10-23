import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RecipeScaleEditButton from "./RecipeScaleEditButton.vue";

const slotStub = { template: "<div><slot /><slot name=\"activator\" :props=\"{}\" /></div>" };
const QuickPicks = {
  name: "QuickPicks",
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: "<div class=\"quick-picks\" :data-lit=\"modelValue\"><slot /></div>",
};

function mountButton(scale: number) {
  return mount(RecipeScaleEditButton, {
    props: {
      "modelValue": scale,
      "onUpdate:modelValue": () => {},
      "recipeServings": 10,
      "editScale": true,
    },
    global: {
      mocks: { $globals: { icons: { edit: "edit", undo: "undo", minus: "minus", createAlt: "plus" } } },
      stubs: {
        VMenu: slotStub,
        VTooltip: slotStub,
        VCard: slotStub,
        VCardTitle: slotStub,
        VCardText: slotStub,
        VIcon: slotStub,
        VNumberInput: { template: "<input>" },
        BaseButtonGroup: { template: "<div />" },
        VBtnToggle: QuickPicks,
        VBtn: { props: ["value"], template: "<button type=\"button\" :data-value=\"value\"><slot /></button>" },
      },
    },
  });
}

describe("RecipeScaleEditButton quick picks", () => {
  test("offers 2x, 3x and 4x with spoken labels", () => {
    const wrapper = mountButton(1);
    const picks = wrapper.findAll(".quick-picks button");

    expect(picks.map(b => b.text())).toEqual(["2x", "3x", "4x"]);
    expect(picks[1].attributes("aria-label")).toBe("Make 3 times the recipe");
  });

  test("lights the pick that matches the current scale, and none otherwise", () => {
    expect(mountButton(3).find(".quick-picks").attributes("data-lit")).toBe("3");
    expect(mountButton(2.1).find(".quick-picks").attributes("data-lit")).toBeUndefined();
  });

  test("picking sets the scale; un-picking goes back to as written", async () => {
    const wrapper = mountButton(1);
    const toggle = wrapper.findComponent(QuickPicks);

    toggle.vm.$emit("update:modelValue", 4);
    toggle.vm.$emit("update:modelValue", undefined);

    expect(wrapper.emitted("update:modelValue")).toEqual([[4], [1]]);
  });
});
