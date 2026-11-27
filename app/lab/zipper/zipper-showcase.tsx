"use client";

import NumberFlow from "@number-flow/react";
import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  Zipper,
  type ZipperColorway,
  zipperColorways,
} from "@/components/Zipper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const colorways: { label: string; value: ZipperColorway }[] = [
  { label: "Canvas and brass", value: "canvas" },
  { label: "Denim and copper", value: "denim" },
  { label: "Black nylon", value: "nylon" },
];

/** Ink that reads on each colourway's lining. */
const liningInk: Record<ZipperColorway, string> = {
  canvas: "#f8e7d6",
  denim: "#2f4366",
  nylon: "#2b1409",
};

/** What's tucked inside the pouch. Sized in container units so it scales. */
export function PouchContents({ colorway }: { colorway: ZipperColorway }) {
  const ink = liningInk[colorway];

  return (
    <div className="absolute inset-0 [container-type:inline-size]">
      {/* A woven label, stitched in at the mouth. */}
      <div
        className="absolute top-[6.5%] left-1/2 flex w-[26cqw] -translate-x-1/2 flex-col items-center gap-[0.8cqw] rounded-[1cqw] bg-[#f4efe3] px-[2cqw] py-[2.2cqw] text-[#2a2620] shadow-[0_1px_2px_rgb(0_0_0_/_30%)]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgb(0 0 0 / 4%) 0 1px, transparent 1px 3px)",
        }}
      >
        <span className="font-semibold text-[3.2cqw] uppercase leading-none tracking-[0.18em]">
          Lab Goods
        </span>
        <span className="h-px w-full bg-current opacity-25" />
        <span className="font-mono text-[2.4cqw] uppercase leading-none tracking-[0.12em] opacity-70">
          Nº 27 · Zip pouch
        </span>
      </div>

      {/* A folded note. */}
      <p
        className="absolute top-[27%] left-1/2 w-[24cqw] -translate-x-1/2 rotate-[-4deg] rounded-[0.6cqw] bg-[#fffdf6] px-[2.4cqw] pt-[2.2cqw] pb-[2.6cqw] text-center font-medium text-[#3a352c] text-[3.1cqw] leading-[1.35] shadow-[0_1px_1px_rgb(0_0_0_/_18%),0_4px_10px_-4px_rgb(0_0_0_/_40%)]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, transparent 49.4%, rgb(0 0 0 / 7%) 50%, transparent 51.2%)",
        }}
      >
        If found, please return to the lab.
      </p>

      {/* A pencil, rolled to the bottom. */}
      <div
        aria-hidden="true"
        className="absolute top-[52%] left-1/2 flex h-[48cqw] w-[5cqw] -translate-x-1/2 rotate-[5deg] flex-col drop-shadow-[0_2px_2px_rgb(0_0_0_/_35%)]"
      >
        <span className="h-[5cqw] rounded-t-[1.2cqw] bg-[#e8838f]" />
        <span className="h-[4cqw] bg-[linear-gradient(90deg,#8c8f96,#e3e5ea_40%,#9a9ea7)] [background-size:100%_100%]" />
        <span className="flex-1 bg-[linear-gradient(90deg,#d89a12_0_33%,#f4c43a_33%_66%,#e0a81c_66%)]" />
        <span className="h-[7cqw] bg-[#e9c99a] [clip-path:polygon(0_0,100%_0,50%_100%)]" />
      </div>

      <span
        className="absolute bottom-[4%] left-1/2 -translate-x-1/2 font-mono text-[2.4cqw] uppercase tracking-[0.2em] opacity-70"
        style={{ color: ink }}
      >
        Inside pocket
      </span>
    </div>
  );
}

export function ZipperShowcase() {
  const [sound, setSound] = useState(true);
  const [colorway, setColorway] = useState<ZipperColorway>("canvas");
  const [percent, setPercent] = useState(0);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[620px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 pt-14 pb-10 dark:bg-grayscale-2 max-[520px]:min-h-[560px] max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute zip sounds" : "Play zip sounds"}
          aria-pressed={sound}
          className="absolute top-3 right-3 z-[1] flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon size={15} weight="bold" />
          ) : (
            <SpeakerSlashIcon size={15} weight="bold" />
          )}
        </button>

        <Zipper
          className="z-[1] w-[300px] max-[380px]:w-[260px]"
          colorway={colorway}
          label="Pouch zip"
          onProgressChange={setPercent}
          sound={sound}
        >
          <PouchContents colorway={colorway} />
        </Zipper>

        <div className="relative z-[1] mt-12 flex flex-col items-center gap-3">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Colourway</legend>
            {colorways.map((option) => {
              const palette = zipperColorways[option.value];

              return (
                <label
                  className="group/swatch relative cursor-pointer"
                  key={option.value}
                  title={option.label}
                >
                  <input
                    checked={option.value === colorway}
                    className="peer sr-only"
                    name="zipper-colorway"
                    onChange={() => setColorway(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span className="sr-only">{option.label}</span>
                  <span
                    aria-hidden="true"
                    className="block size-7 rounded-full border border-black/10 transition-transform duration-150 ease-out group-hover/swatch:scale-110 peer-checked:ring-2 peer-checked:ring-grayscale-12 peer-checked:ring-offset-2 peer-checked:ring-offset-grayscale-1 peer-focus-visible:outline-2 peer-focus-visible:outline-grayscale-8 peer-focus-visible:outline-offset-4 motion-reduce:transition-none motion-reduce:group-hover/swatch:scale-100 dark:border-white/10 dark:peer-checked:ring-offset-grayscale-2"
                    style={{
                      background: `linear-gradient(135deg, ${palette.fabric} 0 50%, ${palette.teeth[1]} 50% 100%)`,
                    }}
                  />
                </label>
              );
            })}
          </fieldset>

          <p
            aria-hidden="true"
            className="flex h-5 items-center font-medium text-grayscale-11 text-xs tabular-nums"
          >
            {percent === 0 ? (
              "Zipped shut"
            ) : (
              <>
                <NumberFlow value={percent} />
                <span>% open</span>
              </>
            )}
          </p>
          <p className="text-center text-grayscale-9 text-xs">
            Drag the pull, or double-click it to zip all the way.
          </p>
        </div>
      </div>
    </div>
  );
}
