"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { type FanCard, PlayingCardFan } from "@/components/PlayingCardFan";

const deck: readonly FanCard[] = [
  { id: "ace-spades", rank: "A", suit: "spades" },
  { id: "queen-hearts", rank: "Q", suit: "hearts" },
  { id: "ten-diamonds", rank: "10", suit: "diamonds" },
  { id: "seven-clubs", rank: "7", suit: "clubs" },
  { id: "four-hearts", rank: "4", suit: "hearts" },
  { id: "jack-clubs", rank: "J", suit: "clubs" },
  { id: "nine-spades", rank: "9", suit: "spades" },
];

const handSizes = [3, 5, 7] as const;

type HandSize = (typeof handSizes)[number];

export function PlayingCardsShowcase() {
  const [handSize, setHandSize] = useState<HandSize>(7);
  const [playedIds, setPlayedIds] = useState<readonly string[]>([]);

  const cards = deck.slice(0, handSize);

  function redeal() {
    setPlayedIds([]);
  }

  function selectHandSize(nextSize: HandSize) {
    setHandSize(nextSize);
    redeal();
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative h-[420px] w-full overflow-hidden bg-white dark:bg-grayscale-2">
        <div
          aria-hidden="true"
          className="-translate-x-1/2 pointer-events-none absolute top-[84px] left-1/2 flex h-[170px] w-[126px] items-center justify-center"
        >
          <AnimatePresence initial={false}>
            {playedIds.length === 0 ? (
              <motion.span
                animate={{ opacity: 1 }}
                className="px-3 text-center font-mono font-semibold text-[10px] text-grayscale-9 uppercase leading-4"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
              >
                Play a card
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <PlayingCardFan
          cards={cards}
          onPlay={(card) => setPlayedIds((current) => [...current, card.id])}
          playedIds={playedIds}
        />

        <AnimatePresence>
          {playedIds.length === cards.length ? (
            <motion.p
              animate={{ opacity: 1 }}
              className="-translate-x-1/2 absolute bottom-10 left-1/2 whitespace-nowrap font-mono font-semibold text-[10px] text-grayscale-9 uppercase"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              Hand empty — redeal to keep playing
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="grid gap-4 border-grayscale-3 border-t p-4 dark:border-grayscale-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
              Hand size
            </span>
            <div className="flex flex-wrap gap-1.5">
              {handSizes.map((size) => (
                <button
                  aria-pressed={handSize === size}
                  className="h-7 rounded-md px-2 font-medium text-grayscale-11 text-xs transition-colors data-[active=true]:bg-grayscale-3 data-[active=true]:text-grayscale-12 data-[active=true]:small-shadow dark:data-[active=true]:bg-grayscale-4"
                  data-active={handSize === size}
                  key={size}
                  onClick={() => selectHandSize(size)}
                  type="button"
                >
                  {size} cards
                </button>
              ))}
            </div>
          </div>

          <button
            className="h-7 rounded-md bg-grayscale-12 px-2.5 font-medium text-grayscale-1 text-xs transition-colors hover:bg-grayscale-11 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-grayscale-5 dark:text-grayscale-12 dark:hover:bg-grayscale-6"
            disabled={playedIds.length === 0}
            onClick={redeal}
            type="button"
          >
            Redeal
          </button>
        </div>
      </div>
    </div>
  );
}
