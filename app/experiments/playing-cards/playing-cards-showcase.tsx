"use client";

import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import { useState } from "react";
import {
  PlayingCard,
  type PlayingCardRank,
  type PlayingCardSuit,
} from "@/components/PlayingCard";
import Button from "@/components/public/Button";

type DealtCard = {
  id: string;
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
};

const suits: readonly PlayingCardSuit[] = [
  "spades",
  "hearts",
  "diamonds",
  "clubs",
];

const ranks: readonly PlayingCardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

const handSize = 5;

// Fixed opening hand so the server and client render the same markup.
const initialHand: DealtCard[] = [
  { id: "A-spades", rank: "A", suit: "spades" },
  { id: "K-hearts", rank: "K", suit: "hearts" },
  { id: "Q-clubs", rank: "Q", suit: "clubs" },
  { id: "J-diamonds", rank: "J", suit: "diamonds" },
  { id: "10-spades", rank: "10", suit: "spades" },
];

function dealHand(): DealtCard[] {
  const deck = suits.flatMap((suit) =>
    ranks.map((rank): DealtCard => ({ id: `${rank}-${suit}`, rank, suit })),
  );

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck.slice(0, handSize);
}

export function PlayingCardsShowcase() {
  const [hand, setHand] = useState(initialHand);
  const [dealCount, setDealCount] = useState(0);

  function handleDeal() {
    setHand(dealHand());
    setDealCount((count) => count + 1);
  }

  return (
    <div className="flex w-full flex-col items-center gap-12">
      <div className="flex items-end justify-center pt-6">
        {hand.map((card, index) => {
          const offsetFromCenter = index - (handSize - 1) / 2;
          const fanRotation = offsetFromCenter * 7;
          const fanLift = Math.abs(offsetFromCenter) * 12;

          return (
            <motion.div
              animate={{ opacity: 1, rotate: fanRotation, y: fanLift }}
              className="relative -ml-5 first:ml-0 hover:z-10"
              initial={{ opacity: 0, rotate: 0, y: 96 }}
              key={`${dealCount}-${card.id}`}
              style={{ transformOrigin: "50% 120%" }}
              transition={{
                bounce: 0.38,
                delay: index * 0.07,
                type: "spring",
              }}
              whileHover={{
                rotate: fanRotation / 2,
                scale: 1.08,
                y: fanLift - 16,
              }}
            >
              <PlayingCard rank={card.rank} suit={card.suit} />
            </motion.div>
          );
        })}
      </div>

      <Button className="text-xs" onClick={handleDeal} variant="secondary">
        <ArrowsClockwiseIcon size={15} weight="bold" />
        Deal again
      </Button>
    </div>
  );
}
