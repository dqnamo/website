export const usageSource = `"use client";

import { useState } from "react";
import { SplitFlap, unlockSplitFlapSound } from "@/components/SplitFlap";

const words = ["DEPARTING", "BOARDING", "ARRIVED"];

export function Example() {
  const [index, setIndex] = useState(0);
  const [sound, setSound] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Size the drums with font-size. Each cell only turns forwards. */}
      <SplitFlap
        className="text-3xl"
        length={9}
        sound={sound}
        stagger={30}
        value={words[index]}
      />

      <button
        onClick={() => setIndex((value) => (value + 1) % words.length)}
        type="button"
      >
        Next
      </button>
      <button
        aria-pressed={sound}
        onClick={() => {
          unlockSplitFlapSound();
          setSound((value) => !value);
        }}
        type="button"
      >
        Sound
      </button>
    </div>
  );
}
`;
