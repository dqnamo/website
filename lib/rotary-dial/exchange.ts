// The exchange at the far end of the line. It never sees the dial, only the current in the
// line: the loop is made while the receiver is off its rest, and each pulse from the dial, or
// tap on the cradle, breaks it for a moment. The exchange counts the breaks, and once the line
// has stayed made for longer than the gap between two pulses, it takes the count as a digit,
// ten breaks meaning nought. A break that lasts most of a second is a receiver put down, and
// clears the call.
//
// The first break silences the dial tone. A number is put through once it has enough digits:
// eleven for one starting with nought, six for a local one, three for a service. Dial the
// telephone's own number and it's engaged, since it's busy calling itself; dial 123 for the
// speaking clock, which reads out the time every ten seconds and marks it with three pips.

import type { Sound } from "./sound";

// 01632 960 is set aside for drama, so this number rings nowhere.
export const THIS_NUMBER = "01632 960418";
const OWN = THIS_NUMBER.replace(/\s/g, "");
const OWN_LOCAL = OWN.slice(5);

export type LineStatus =
  | "idle"
  | "dial-tone"
  | "dialling"
  | "connecting"
  | "ringing"
  | "engaged"
  | "unobtainable"
  | "clock";

export type LineState = {
  status: LineStatus;
  lifted: boolean;
  number: string;
  // Breaks counted so far in the digit being dialled.
  counting: number;
  // Breaks counted on this call.
  pulses: number;
  rings: number;
  announcement: string | null;
};

// When the loop changed, in performance.now() milliseconds.
export type LineChange = { t: number; made: boolean };

// In seconds.
const CLEAR_AFTER = 0.8;
const DIGIT_GAP = 0.4;
const DIAL_TONE_AFTER = 0.3;
const GIVE_UP = 30;
const INCOMPLETE = 7;
const SWITCHING = 1.6;
const RING = 3;
const HISTORY = 8000;

const UNITS = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];

function words(n: number) {
  if (n < 20) return UNITS[n];
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 ? `${tens}-${UNITS[n % 10]}` : tens;
}

// As the clock says it: "four oh five and twenty seconds", "eleven o'clock precisely".
function spoken(date: Date) {
  const hour = words(date.getHours() % 12 || 12);
  const m = date.getMinutes();
  const s = date.getSeconds();
  const time =
    m === 0
      ? `${hour} o'clock`
      : m < 10
        ? `${hour} oh ${words(m)}`
        : `${hour} ${words(m)}`;
  return s ? `${time} and ${words(s)} seconds` : `${time} precisely`;
}

function shown(date: Date) {
  const h = date.getHours() % 12 || 12;
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = date.getSeconds();
  return s ? `${h}:${m} and ${s} seconds` : `${h}:${m} precisely`;
}

// Somewhere to ring, picked by the number so it's the same every time.
function busy(number: string) {
  let hash = 7;
  for (const digit of number) hash = (hash * 31 + Number(digit)) % 1009;
  return hash % 5 === 0;
}

export function createExchange({
  sound,
  onState,
}: {
  sound: Sound;
  onState?: (state: LineState) => void;
}) {
  let lifted = false;
  let cradle = false;
  let open = false;
  let made = false;
  const history: LineChange[] = [{ t: performance.now(), made: false }];
  const timers = new Map<string, number>();
  const pulseTimers = new Set<number>();
  let stroke = 0;
  let state: LineState = fresh();

  function fresh(): LineState {
    return {
      status: "idle",
      lifted,
      number: "",
      counting: 0,
      pulses: 0,
      rings: 0,
      announcement: null,
    };
  }

  function emit() {
    onState?.({ ...state, lifted });
  }

  function later(name: string, seconds: number, run: () => void) {
    clearTimeout(timers.get(name));
    timers.set(
      name,
      window.setTimeout(() => {
        timers.delete(name);
        run();
      }, seconds * 1000),
    );
  }

  function cancel(name: string) {
    clearTimeout(timers.get(name));
    timers.delete(name);
  }

  function update(at = performance.now()) {
    const next = lifted && !cradle && !open;
    if (next === made) return;
    made = next;
    history.push({ t: at, made });
    while (history.length > 2 && history[1].t < at - HISTORY) history.shift();
    sound.setLoop(made);
    if (made) onMake();
    else onBreak();
    emit();
  }

  function onBreak() {
    later("clear", CLEAR_AFTER, clear);
    cancel("digit");
    // A quick finger can start dialling before the dial tone arrives; it still counts.
    if (state.status === "idle" && timers.has("dial-tone")) {
      cancel("dial-tone");
      state.status = "dial-tone";
    }
    if (state.status !== "dial-tone" && state.status !== "dialling") return;
    cancel("give-up");
    cancel("incomplete");
    if (state.status === "dial-tone") {
      sound.tone(null);
      state.status = "dialling";
    }
    state.counting += 1;
    state.pulses += 1;
  }

  function onMake() {
    cancel("clear");
    if (state.status === "idle") {
      later("dial-tone", DIAL_TONE_AFTER, dialTone);
    } else if (state.status === "dialling" && state.counting) {
      later("digit", DIGIT_GAP, endDigit);
    }
  }

  function dialTone() {
    if (!made || state.status !== "idle") return;
    state.status = "dial-tone";
    sound.tone("dial");
    later("give-up", GIVE_UP, unobtainable);
    emit();
  }

  function endDigit() {
    const count = state.counting;
    state.counting = 0;
    // More than ten breaks isn't a digit at all.
    if (count > 10) {
      unobtainable();
      return;
    }
    state.number += String(count % 10);
    route();
    emit();
  }

  function route() {
    const number = state.number;
    const service = number[0] === "1";
    const complete = service
      ? number.length >= 3
      : number.length >= (number[0] === "0" ? 11 : 6);
    if (!complete) {
      later("incomplete", INCOMPLETE, unobtainable);
      return;
    }
    state.status = "connecting";
    sound.switching(SWITCHING);
    later("connect", SWITCHING, () => {
      if (number === "123") clock();
      else if (service) unobtainable();
      else if (number === OWN || number === OWN_LOCAL || busy(number))
        engaged();
      else ringing();
    });
  }

  function ringing() {
    state.status = "ringing";
    sound.tone("ringing");
    const ring = () => {
      state.rings += 1;
      emit();
      later("ring", RING, ring);
    };
    ring();
  }

  function engaged() {
    state.status = "engaged";
    sound.tone("engaged");
    emit();
  }

  function unobtainable() {
    for (const name of ["give-up", "incomplete", "digit", "connect"])
      cancel(name);
    state.status = "unobtainable";
    state.counting = 0;
    sound.tone("unobtainable");
    emit();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    const loudness = sound.loudness();
    if (!loudness) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.95;
    utterance.volume = loudness;
    const voices = speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => voice.lang === "en-GB" && voice.localService) ??
      voices.find((voice) => voice.lang.startsWith("en-GB")) ??
      null;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  // Each announcement is for the next ten-second mark far enough off to say it in time; the
  // third pip lands on it.
  function clock() {
    state.status = "clock";
    stroke = Math.ceil((Date.now() + 7000) / 10_000) * 10_000;
    const announce = () => {
      if (state.status !== "clock") return;
      const at = new Date(stroke);
      state.announcement = `At the third stroke, it will be ${shown(at)}`;
      emit();
      speak(`At the third stroke, it will be ${spoken(at)}.`);
      const wait = (stroke - Date.now()) / 1000;
      for (const before of [2, 1, 0]) sound.pip(wait - before);
      later("clock", wait + 0.6, () => {
        stroke += 10_000;
        announce();
      });
    };
    announce();
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    sound.tone(null);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    state = fresh();
    emit();
  }

  return {
    // Lifting the receiver lets the hook switch up; putting it back ends the call at once.
    setReceiver(on: boolean) {
      if (on === lifted) return;
      if (!on) clear();
      lifted = on;
      sound.setEar(on);
      update();
      emit();
    },
    setCradle(pressed: boolean) {
      cradle = pressed;
      update();
    },
    // The dial's pulses, as seconds from now when the line breaks and makes again.
    pulses(events: { at: number; made: boolean }[]) {
      const start = performance.now();
      for (const event of events) {
        const timer = window.setTimeout(() => {
          pulseTimers.delete(timer);
          open = !event.made;
          update(start + event.at * 1000);
        }, event.at * 1000);
        pulseTimers.add(timer);
      }
    },
    lifted: () => lifted,
    history: () => history,
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      for (const timer of pulseTimers) clearTimeout(timer);
      sound.tone(null);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
  };
}

export type Exchange = ReturnType<typeof createExchange>;
