"use client";

import { type CSSProperties, useState } from "react";
import { Ticket } from "@/components/Ticket";
import { TicketPattern } from "@/components/TicketPattern";

const palettes = [
  {
    ink: "#181713",
    name: "Signal",
    paper: "#ff6542",
  },
  {
    ink: "#f7f2df",
    name: "Cobalt",
    paper: "#2645dc",
  },
  {
    ink: "#1a1b17",
    name: "Acid",
    paper: "#c9e54b",
  },
] as const;

const eventDetails = [
  { label: "Date", value: "27.09" },
  { label: "Doors", value: "19:30" },
] as const;

const microLabelClassName =
  "font-mono text-[6px] font-bold leading-none tracking-[0.08em] uppercase opacity-[0.62]";

const stageGridStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const barcodeStyle: CSSProperties = {
  background:
    "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 4px, currentColor 4px 5px, transparent 5px 8px, currentColor 8px 12px, transparent 12px 14px)",
};

function TicketBody({ ink }: { ink: string }) {
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto_auto] gap-4 p-[20px_21px_25px] max-[520px]:gap-[13px] max-[520px]:p-[17px_18px_22px]">
      <div className="flex justify-between gap-3 font-mono text-[7px] font-bold leading-none tracking-[0.08em] uppercase opacity-[0.72]">
        <span>Series no. 024</span>
        <span>London · UK</span>
      </div>

      <TicketPattern ink={ink} />

      <div>
        <h2 className="font-[750] text-[28px] leading-[0.82] tracking-[-0.075em] uppercase max-[520px]:text-[25px]">
          Crafted
          <br />
          Pixels
        </h2>
        <p className="mt-3 max-w-[168px] font-semibold text-[8px] leading-[1.3] tracking-[-0.015em]">
          An evening of code, motion, and the details that make digital products
          feel right.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2.5">
        {eventDetails.map(({ label, value }) => (
          <div className="flex flex-col gap-[3px]" key={label}>
            <dt className={microLabelClassName}>{label}</dt>
            <dd className="font-mono text-[10px] font-bold leading-none">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TicketStub() {
  return (
    <div className="flex h-full flex-col justify-between gap-3.5 p-[20px_21px_18px] max-[520px]:px-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className={microLabelClassName}>Admit</span>
          <strong className="font-[750] text-[13px] leading-none uppercase">
            One
          </strong>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className={microLabelClassName}>Reference</span>
          <strong className="font-mono font-[750] text-[7px] leading-none tracking-[-0.04em] uppercase">
            CP-240927-031
          </strong>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="h-[22px] w-full"
        style={barcodeStyle}
      />
    </div>
  );
}

export function TicketShowcase() {
  const [paletteIndex, setPaletteIndex] = useState(1);
  const palette = palettes[paletteIndex];

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div
        className="relative flex min-h-[610px] items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:min-h-[535px] max-[520px]:px-5 max-[520px]:py-8"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 47%, color-mix(in srgb, ${palette.paper} 15%, transparent), transparent 42%)`,
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />
        <Ticket
          aria-label="Crafted Pixels design engineering event ticket"
          body={<TicketBody ink={palette.ink} />}
          className="z-[1] h-[516px] w-[218px] aspect-auto max-[520px]:h-[456px] max-[520px]:w-[190px]"
          ink={palette.ink}
          paper={palette.paper}
          stub={<TicketStub />}
          stubHeight={118}
          tiltProps={{
            glareColor: "#ffffff",
            glareEnable: true,
            glareMaxOpacity: 0.2,
            glarePosition: "all",
            perspective: 1200,
            scale: 1.02,
            tiltMaxAngleX: 7,
            tiltMaxAngleY: 7,
          }}
        />
      </div>

      <div className="flex min-h-[57px] items-center border-grayscale-3 border-t px-3 py-2.5">
        <div className="flex items-center gap-1">
          {palettes.map((option, index) => (
            <button
              aria-label={`${option.name} paper`}
              aria-pressed={paletteIndex === index}
              className="grid size-7 cursor-pointer place-items-center rounded-lg border border-transparent p-[3px] transition-[border-color,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-5 focus-visible:outline-2 focus-visible:outline-grayscale-8 focus-visible:outline-offset-2 active:scale-[0.97] aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-2 motion-reduce:transition-none"
              key={option.name}
              onClick={() => setPaletteIndex(index)}
              title={option.name}
              type="button"
            >
              <span
                aria-hidden="true"
                className="size-[18px] rounded-[5px] border border-black/10 shadow-[inset_0_1px_0_rgb(255_255_255_/_22%)]"
                style={{ backgroundColor: option.paper }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
