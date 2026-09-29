import { describe, expect, it } from "vitest";
import { OTHER_CAREER, careerChoiceFromValue, careerValueFromChoice } from "./career-choice";

describe("career choice", () => {
  it("maps empty values to no selection", () => {
    expect(careerChoiceFromValue(null)).toEqual({ choice: "", other: "" });
    expect(careerChoiceFromValue("  ")).toEqual({ choice: "", other: "" });
    expect(careerValueFromChoice({ choice: "", other: "" })).toBeNull();
  });

  it("maps a listed career (any case/accents) to its id and back to the official name", () => {
    const choice = careerChoiceFromValue("ingenieria en computacion");
    expect(choice).toEqual({ choice: "ingenieria-computacion", other: "" });
    expect(careerValueFromChoice(choice)).toBe("Ingeniería en Computación");
  });

  it("keeps unknown saved values as 'Otra' with the text prefilled", () => {
    const choice = careerChoiceFromValue("Ingeniería");
    expect(choice).toEqual({ choice: OTHER_CAREER, other: "Ingeniería" });
    expect(careerValueFromChoice(choice)).toBe("Ingeniería");
    expect(careerValueFromChoice({ choice: OTHER_CAREER, other: "  " })).toBeNull();
  });
});
