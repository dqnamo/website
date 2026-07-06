import Image from "next/image";
import { cn } from "@/helpers/classname-helper";

export type PlayingCardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type PlayingCardSuit = "clubs" | "diamonds" | "hearts" | "spades";

export type PlayingCardProps = {
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
  className?: string;
  faceDown?: boolean;
  /** Card width in pixels. Height follows the classic 5:7 ratio. */
  width?: number;
};

type Pip = { x: number; y: number; flip?: boolean };

const suitPaths: Record<PlayingCardSuit, string> = {
  clubs:
    "M12 2a4.1 4.1 0 0 0-4.1 4.1c0 .93.31 1.79.83 2.48a4.1 4.1 0 1 0 2.9 7.33c-.28 2.2-1.02 3.72-2.43 5.09h5.6c-1.41-1.37-2.15-2.89-2.43-5.09a4.1 4.1 0 1 0 2.9-7.33c.52-.69.83-1.55.83-2.48A4.1 4.1 0 0 0 12 2Z",
  diamonds: "M12 1.5 19.3 12 12 22.5 4.7 12Z",
  hearts:
    "M12 21.4C6.1 15.9 2.6 12.4 2.6 8.6a4.85 4.85 0 0 1 4.85-4.85c1.8 0 3.5.87 4.55 2.33a5.63 5.63 0 0 1 4.55-2.33A4.85 4.85 0 0 1 21.4 8.6c0 3.8-3.5 7.3-9.4 12.8Z",
  spades:
    "M12 1.8C6.9 7.2 3.6 10.3 3.6 13.6a4.35 4.35 0 0 0 7.1 3.36c-.3 1.9-1 3.26-2.35 4.54h7.3c-1.35-1.28-2.05-2.64-2.35-4.54a4.35 4.35 0 0 0 7.1-3.36c0-3.3-3.3-6.4-8.4-11.8Z",
};

const redSuits: ReadonlySet<PlayingCardSuit> = new Set(["diamonds", "hearts"]);

const courtSuitCode: Record<PlayingCardSuit, string> = {
  clubs: "C",
  diamonds: "D",
  hearts: "H",
  spades: "S",
};

const left = 0;
const center = 50;
const right = 100;

const pipLayouts: Partial<Record<PlayingCardRank, readonly Pip[]>> = {
  "2": [
    { x: center, y: 0 },
    { x: center, y: 100, flip: true },
  ],
  "3": [
    { x: center, y: 0 },
    { x: center, y: 50 },
    { x: center, y: 100, flip: true },
  ],
  "4": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
  "5": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: center, y: 50 },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
  "6": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: left, y: 50 },
    { x: right, y: 50 },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
  "7": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: center, y: 25 },
    { x: left, y: 50 },
    { x: right, y: 50 },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
  "8": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: center, y: 25 },
    { x: left, y: 50 },
    { x: right, y: 50 },
    { x: center, y: 75, flip: true },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
  "9": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: left, y: 33.3 },
    { x: right, y: 33.3 },
    { x: center, y: 50 },
    { x: left, y: 66.7, flip: true },
    { x: right, y: 66.7, flip: true },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
  "10": [
    { x: left, y: 0 },
    { x: right, y: 0 },
    { x: center, y: 16.7 },
    { x: left, y: 33.3 },
    { x: right, y: 33.3 },
    { x: left, y: 66.7, flip: true },
    { x: right, y: 66.7, flip: true },
    { x: center, y: 83.3, flip: true },
    { x: left, y: 100, flip: true },
    { x: right, y: 100, flip: true },
  ],
};

const courtRanks: ReadonlySet<PlayingCardRank> = new Set(["J", "Q", "K"]);

function SuitIcon({
  className,
  suit,
}: {
  className?: string;
  suit: PlayingCardSuit;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d={suitPaths[suit]} />
    </svg>
  );
}

function CornerIndex({
  flipped = false,
  rank,
  suit,
}: {
  flipped?: boolean;
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
}) {
  return (
    <div
      className={cn(
        "absolute flex flex-col items-center gap-[0.2em]",
        flipped
          ? "right-[0.65em] bottom-[0.6em] rotate-180"
          : "top-[0.6em] left-[0.65em]",
      )}
    >
      <span className="font-semibold text-[1.55em] leading-none tracking-tight">
        {rank}
      </span>
      <SuitIcon className="size-[1.05em]" suit={suit} />
    </div>
  );
}

export function PlayingCard({
  className,
  faceDown = false,
  rank,
  suit,
  width = 112,
}: PlayingCardProps) {
  const isRed = redSuits.has(suit);
  const pips = pipLayouts[rank];
  const isCourt = courtRanks.has(rank);

  return (
    <div
      className={cn(
        "relative aspect-[5/7] select-none overflow-hidden rounded-[0.9em] border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_10px_rgba(0,0,0,0.07)]",
        !faceDown && (isRed ? "text-[#c22f2f]" : "text-[#23262d]"),
        className,
      )}
      style={{ fontSize: width / 14, width }}
    >
      {faceDown ? (
        <div
          className="absolute inset-[0.55em] rounded-[0.5em] border border-black/10"
          style={{
            backgroundColor: "#9d2c35",
            // Crosshatch gradients sit underneath the PNG pattern as a
            // fallback while the image loads.
            backgroundImage:
              "url('/experiments/card-back.png'), repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0, rgba(255,255,255,0.16) 1.5px, transparent 1.5px, transparent 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.16) 0, rgba(255,255,255,0.16) 1.5px, transparent 1.5px, transparent 7px)",
            backgroundPosition: "center",
            backgroundSize: "cover, auto, auto",
          }}
        />
      ) : (
        <>
          <CornerIndex rank={rank} suit={suit} />
          <CornerIndex flipped rank={rank} suit={suit} />

          {rank === "A" ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <SuitIcon className="size-[4.6em]" suit={suit} />
            </div>
          ) : null}

          {isCourt ? (
            <div className="absolute inset-x-[24%] inset-y-[16%] overflow-hidden rounded-[0.4em] border border-current/35">
              {/* Decorative: the corner indices already convey rank and suit. */}
              <Image
                alt=""
                className="object-cover"
                draggable={false}
                fill
                sizes={`${Math.round(width * 0.52)}px`}
                src={`/experiments/courts/${rank}${courtSuitCode[suit]}.png`}
              />
            </div>
          ) : null}

          {pips ? (
            <div className="absolute inset-x-[24%] inset-y-[15%]">
              {pips.map((pip) => (
                <span
                  className="-translate-x-1/2 -translate-y-1/2 absolute"
                  key={`${pip.x}-${pip.y}`}
                  style={{ left: `${pip.x}%`, top: `${pip.y}%` }}
                >
                  <SuitIcon
                    className={cn("size-[2.1em]", pip.flip && "rotate-180")}
                    suit={suit}
                  />
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
