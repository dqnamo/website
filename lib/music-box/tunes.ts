// The strips come punched for a fifteen-note box: two octaves of C major from C5, one line on the
// paper for each tine, low C nearest you. A column is an eighth note, so a beat is two columns.
// They're arranged the way a music box arranger has to: no line ever gets two holes a column
// apart, because the star wheel on that line is still turning from the first hole and rides
// straight over the second. Where a tune wants the same note again that quickly, the first is
// left ringing and the second moves to other tines.

export const NOTES = [
  "C5",
  "D5",
  "E5",
  "F5",
  "G5",
  "A5",
  "B5",
  "C6",
  "D6",
  "E6",
  "F6",
  "G6",
  "A6",
  "B6",
  "C7",
] as const;

export const TRACKS = NOTES.length;

const SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

// Equal temperament from A4 = 440 Hz.
export const PITCHES = NOTES.map((name) => {
  const midi = 12 * (Number(name[1]) + 1) + SEMITONES[name[0]];
  return 440 * 2 ** ((midi - 69) / 12);
});

export type TuneId = "twinkle" | "ode" | "frere" | "blank";

export type Tune = {
  value: TuneId;
  label: string;
  description: string;
  columns: number;
  loop: boolean;
  holes: [column: number, track: number][];
};

// A line of music as tokens: a note name, or several joined by "+", or "-" for a rest, each a
// quarter note unless it ends "*n" (n quarters) or "/2" (an eighth). Bar lines are ignored.
function voice(notation: string, start = 0) {
  const holes: [number, number][] = [];
  let column = start;
  for (const token of notation.split(/\s+/)) {
    if (!token || token === "|") continue;
    const [, names, op, amount] =
      token.match(/^([^*/]+)(?:([*/])([\d.]+))?$/) ?? [];
    if (!names) continue;
    const quarters =
      op === "*" ? Number(amount) : op === "/" ? 1 / Number(amount) : 1;
    if (names !== "-") {
      for (const name of names.split("+")) {
        const track = NOTES.indexOf(name as (typeof NOTES)[number]);
        if (track >= 0) holes.push([column, track]);
      }
    }
    column += quarters * 2;
  }
  return holes;
}

function wrap(holes: [number, number][], columns: number) {
  return holes.map(
    ([column, track]) =>
      [((column % columns) + columns) % columns, track] as [number, number],
  );
}

export const TUNES: Tune[] = [
  {
    value: "twinkle",
    label: "Twinkle",
    description:
      "The old French tune Mozart wrote his variations on, with a bass line on the low tines.",
    columns: 96,
    loop: false,
    holes: [
      ...voice(
        "C6 C6 G6 G6 | A6 A6 G6*2 | F6 F6 E6 E6 | D6 D6 C6*2 | G6 G6 F6 F6 | E6 E6 D6*2 | G6 G6 F6 F6 | E6 E6 D6*2 | C6 C6 G6 G6 | A6 A6 G6*2 | F6 F6 E6 E6 | D6 D6 C6+C7*2",
      ),
      ...voice(
        "C5*2 G5*2 | F5*2 E5*2 | F5*2 C5*2 | G5*2 C5*2 | C5*2 F5*2 | C5*2 G5*2 | C5*2 F5*2 | C5*2 G5*2 | C5*2 G5*2 | F5*2 E5*2 | F5*2 C5*2 | G5*2 C5+E5+G5*2",
      ),
    ],
  },
  {
    value: "ode",
    label: "Ode to Joy",
    description:
      "Beethoven’s tune from the Ninth. Twice it repeats a note an eighth apart, too close for one tine, so the first is left ringing and the chord takes the second.",
    columns: 64,
    loop: false,
    holes: [
      ...voice(
        "E6 E6 F6 G6 | G6 F6 E6 D6 | C6 C6 D6 E6 | E6*1.5 D6/2 -*2 | E6 E6 F6 G6 | G6 F6 E6 D6 | C6 C6 D6 E6 | D6*1.5 C6/2 -*2",
      ),
      ...voice(
        "C5*2 G5*2 | G5*2 B5*2 | C5*2 G5*2 | C5*2 G5+B5*2 | C5*2 G5*2 | G5*2 B5*2 | C5*2 G5*2 | G5*2 C5+E5+G5*2",
      ),
    ],
  },
  {
    value: "frere",
    label: "Frère Jacques",
    description:
      "A round on a loop: the low octave sings the tune two bars behind the high one, so with the ends taped together it never runs out.",
    columns: 64,
    loop: true,
    holes: (() => {
      const tune =
        "C D E C | C D E C | E F G*2 | E F G*2 | G/2 A/2 G/2 F/2 E C | G/2 A/2 G/2 F/2 E C | C g C*2 | C g C*2";
      // The tune in each octave; "g" is the G below, which the low voice hasn't got, so it
      // takes the G above.
      const high = tune.replace(/[A-G]/g, "$&6").replace(/g/g, "G5");
      const low = tune.replace(/[A-G]/g, "$&5").replace(/g/g, "G5");
      return [...voice(high), ...wrap(voice(low, 16), 64)];
    })(),
  },
  {
    value: "blank",
    label: "Blank",
    description:
      "Sixty-four columns of nothing. Each line is a tine, low C nearest you, and each column an eighth note.",
    columns: 64,
    loop: false,
    holes: [],
  },
];
