export type ExperienceLevel = 'in_use' | 'evaluated' | 'general';

export interface ExperienceLevelOption {
  value: ExperienceLevel;
  label: string;
  shortLabel: string;
  description: string;
}

export const EXPERIENCE_LEVEL_OPTIONS: ExperienceLevelOption[] = [
  {
    value: 'in_use',
    label: 'Im Einsatz',
    shortLabel: 'Im Einsatz',
    description: 'Ich nutze die Lösung oder arbeite aktuell mit diesem Anbieter.',
  },
  {
    value: 'evaluated',
    label: 'Getestet/evaluiert',
    shortLabel: 'Evaluiert',
    description: 'Ich habe die Lösung oder den Anbieter geprüft oder getestet.',
  },
  {
    value: 'general',
    label: 'Nur allgemeine Erfahrung',
    shortLabel: 'Allgemeine Erfahrung',
    description: 'Meine Einschätzung beruht auf allgemeiner beruflicher Erfahrung.',
  },
];

export const getExperienceLevelLabel = (
  value?: string | null,
  short = false,
): string | null => {
  const option = EXPERIENCE_LEVEL_OPTIONS.find((item) => item.value === value);
  if (!option) return null;
  return short ? option.shortLabel : option.label;
};
