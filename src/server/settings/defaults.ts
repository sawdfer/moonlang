/** Admin-configurable values and their defaults (RN-003, RN-014, RN-025, RN-026, F-018). */
export type Settings = {
  pixKey: string | null;
  extraHourPriceCents: number;
  dueDayOptions: number[];
  maxLessonsPerDay: number;
  birthdayGiftEnabled: boolean;
};

export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  pixKey: null,
  extraHourPriceCents: 5900,
  dueDayOptions: [5, 10, 15, 20],
  maxLessonsPerDay: 1,
  birthdayGiftEnabled: true,
};
