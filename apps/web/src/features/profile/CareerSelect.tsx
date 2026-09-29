"use client";

import { unsCareersByDepartment } from "@uns/contracts";
import { OTHER_CAREER, type CareerChoice } from "./career-choice";

const GROUPS = unsCareersByDepartment();

export interface CareerSelectProps {
  id: string;
  value: CareerChoice;
  onChange: (value: CareerChoice) => void;
  className: string;
}

/** Native <select> of UNS careers grouped by department, plus "Otra" revealing a free-text input. */
export function CareerSelect({ id, value, onChange, className }: CareerSelectProps) {
  const isOther = value.choice === OTHER_CAREER;
  return (
    <div className="flex flex-col gap-2">
      <select
        id={id}
        value={value.choice}
        onChange={(e) => onChange({ ...value, choice: e.target.value })}
        className={className}
      >
        <option value="">Sin especificar</option>
        {GROUPS.map((group) => (
          <optgroup key={group.department} label={group.department}>
            {group.careers.map((career) => (
              <option key={career.id} value={career.id}>
                {career.name}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER_CAREER}>Otra…</option>
      </select>
      {isOther ? (
        <input
          aria-label="Otra carrera"
          placeholder="Escribí tu carrera"
          value={value.other}
          onChange={(e) => onChange({ ...value, other: e.target.value })}
          maxLength={120}
          className={className}
        />
      ) : null}
    </div>
  );
}
