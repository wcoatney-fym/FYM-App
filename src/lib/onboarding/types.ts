export type ProductStatus = 'yes' | 'no' | 'new';

export interface StateRecord {
  name: string;
  products: Record<string, ProductStatus>;
}

export interface ProductMeta {
  key: string;
  name: string;
  ageBand: string;
  desc: string;
}

export type RoadmapCTA =
  | { type: 'email'; to: string; subject: string }
  | { type: 'link'; url: string; label: string }
  | { type: 'jump'; to: string; label: string };

export interface RoadmapTask {
  id: string;
  label: string;
  cta?: RoadmapCTA;
}

export interface RoadmapWeek {
  week: number;
  title: string;
  summary: string;
  tasks: RoadmapTask[];
}

export type ScriptBlock =
  | { type: 'dialogue'; text: string }
  | { type: 'stage'; text: string }
  | { type: 'coaching'; text: string }
  | { type: 'tier'; label: string; text: string };

export interface ScriptSection {
  n: number;
  title: string;
  subtitle: string;
  body: ScriptBlock[];
}

export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface TrainingSession {
  title: string;
  desc: string;
  day: string;
  time: string;
  audience: string;
  meetingUrl?: string;
  dayOfWeek?: DayOfWeek;
  cta?: { type: 'email'; to: string; subject: string };
}

export interface Contact {
  role: string;
  name: string;
  email: string | null;
  primary?: boolean;
  note?: string;
  phone?: string;
}
