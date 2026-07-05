import type { Icon } from "@phosphor-icons/react";
import {
  ClubIcon,
  DiamondIcon,
  HeartIcon,
  SpadeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/helpers/classname-helper";

export type PlayingCardSuit = "clubs" | "diamonds" | "hearts" | "spades";

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

const suitIcons: Record<PlayingCardSuit, Icon> = {
  clubs: ClubIcon,
  diamonds: DiamondIcon,
  hearts: HeartIcon,
  spades: SpadeIcon,
};

type PlayingCardProps = {
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
  className?: string;
};

export function PlayingCard({ className, rank, suit }: PlayingCardProps) {
  const SuitIcon = suitIcons[suit];
  const isRedSuit = suit === "diamonds" || suit === "hearts";

  return (
    <div
      aria-label={`${rank} of ${suit}`}
      className={cn(
        "relative flex aspect-[5/7] w-16 select-none flex-col justify-between rounded-lg border border-black/10 bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.08)]",
        isRedSuit ? "text-[#e5484d]" : "text-[#1c1a17]",
        className,
      )}
      role="img"
    >
      <span className="flex flex-col items-center gap-0.5 self-start leading-none">
        <span className="font-semibold text-sm tabular-nums">{rank}</span>
        <SuitIcon aria-hidden="true" size={9} weight="fill" />
      </span>

      <SuitIcon
        aria-hidden="true"
        className="absolute inset-0 m-auto"
        size={22}
        weight="fill"
      />

      <span className="flex rotate-180 flex-col items-center gap-0.5 self-end leading-none">
        <span className="font-semibold text-sm tabular-nums">{rank}</span>
        <SuitIcon aria-hidden="true" size={9} weight="fill" />
      </span>
    </div>
  );
}
