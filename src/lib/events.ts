export type EventType = "average" | "single" | "best" | "multibld";

export interface KinchEvent {
  id: string;
  shortName: string;
  longName: string;
  type: EventType;
}

export const KINCH_EVENTS: KinchEvent[] = [
  { id: "333", shortName: "3x3", longName: "3x3x3 Cube", type: "average" },
  { id: "444", shortName: "4x4", longName: "4x4x4 Cube", type: "average" },
  { id: "555", shortName: "5x5", longName: "5x5x5 Cube", type: "average" },
  { id: "222", shortName: "2x2", longName: "2x2x2 Cube", type: "average" },
  { id: "333oh", shortName: "OH", longName: "3x3x3 One-Handed", type: "average" },
  { id: "minx", shortName: "Mega", longName: "Megaminx", type: "average" },
  { id: "pyram", shortName: "Pyra", longName: "Pyraminx", type: "average" },
  { id: "sq1", shortName: "SQ1", longName: "Square-1", type: "average" },
  { id: "clock", shortName: "Clock", longName: "Clock", type: "average" },
  { id: "skewb", shortName: "Skewb", longName: "Skewb", type: "average" },
  { id: "666", shortName: "6x6", longName: "6x6x6 Cube", type: "average" },
  { id: "777", shortName: "7x7", longName: "7x7x7 Cube", type: "average" },
  { id: "444bf", shortName: "4BLD", longName: "4x4x4 Blindfolded", type: "single" },
  { id: "555bf", shortName: "5BLD", longName: "5x5x5 Blindfolded", type: "single" },
  { id: "333mbf", shortName: "MBLD", longName: "3x3x3 Multi-Blind", type: "multibld" },
  { id: "333bf", shortName: "3BLD", longName: "3x3x3 Blindfolded", type: "best" },
  { id: "333fm", shortName: "FM", longName: "Fewest Moves", type: "best" },
];

export const KINCH_EVENT_IDS = KINCH_EVENTS.map((e) => e.id);
