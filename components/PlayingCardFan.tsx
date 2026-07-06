"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  PlayingCard,
  type PlayingCardRank,
  type PlayingCardSuit,
} from "@/components/PlayingCard";
import { cn } from "@/helpers/classname-helper";

export type FanCard = {
  id: string;
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
};

export type PlayingCardFanProps = {
  cards: readonly FanCard[];
  /** Card width in pixels. */
  cardWidth?: number;
  className?: string;
  onPlay?: (card: FanCard) => void;
  /**
   * Controls which cards sit on the pile, in play order. Omit to let the
   * fan manage played cards itself. Clearing the list animates the cards
   * back into the hand.
   */
  playedIds?: readonly string[];
};

type PileTransform = {
  rotate: number;
  x: number;
  y: number;
};

const bottomTuck = 46;
// Slightly more than the tuck so the hover scale doesn't poke past the edge.
const hoverLift = 54;
const pileLift = -224;
const playThresholdY = -80;
const playThresholdVelocity = -600;
const minFanSpacing = 26;

const rankNames: Record<PlayingCardRank, string> = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king",
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Spread each card into a symmetric arc around the middle of the hand. */
function fanTransform(index: number, count: number, spacing: number) {
  const offset = index - (count - 1) / 2;
  const stepDeg = count > 1 ? Math.min(9, 46 / (count - 1)) : 0;
  const rotate = offset * stepDeg;

  return {
    rotate,
    x: offset * spacing,
    y: Math.abs(rotate) * 1.9,
  };
}

export function PlayingCardFan({
  cards,
  cardWidth = 112,
  className,
  onPlay,
  playedIds: controlledPlayedIds,
}: PlayingCardFanProps) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const pileTransforms = useRef(new Map<string, PileTransform>());
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [internalPlayedIds, setInternalPlayedIds] = useState<readonly string[]>(
    [],
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const playedIds = controlledPlayedIds ?? internalPlayedIds;

  useLayoutEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  // Forget pile positions of cards that returned to the hand so they land
  // on a fresh spot the next time they are played.
  useEffect(() => {
    for (const id of pileTransforms.current.keys()) {
      if (!playedIds.includes(id)) {
        pileTransforms.current.delete(id);
      }
    }
  }, [playedIds]);

  const handCards = cards.filter((card) => !playedIds.includes(card.id));
  const hoveredIndex = hoveredId
    ? handCards.findIndex((card) => card.id === hoveredId)
    : -1;

  // Clamp the horizontal spread so the outermost cards (including their
  // hover scale) never clip against the container edges.
  const baseSpacing = handCards.length > 5 ? 48 : 58;
  const maxOffset = (handCards.length - 1) / 2;
  // 0.8 covers half the card plus the extra width from arc rotation.
  const halfAvailable =
    containerWidth === null
      ? Number.POSITIVE_INFINITY
      : containerWidth / 2 - cardWidth * 0.8;
  const fanSpacing =
    maxOffset > 0
      ? Math.min(
          baseSpacing,
          Math.max(minFanSpacing, halfAvailable / maxOffset),
        )
      : 0;

  const cardTransition = shouldReduceMotion
    ? { duration: 0.16, ease: "easeOut" as const }
    : {
        damping: 30,
        mass: 0.9,
        stiffness: 340,
        type: "spring" as const,
      };

  function pileTransform(id: string): PileTransform {
    const existing = pileTransforms.current.get(id);

    if (existing) {
      return existing;
    }

    const created = {
      rotate: randomBetween(-13, 13),
      x: randomBetween(-14, 14),
      y: pileLift + randomBetween(-6, 6),
    };

    pileTransforms.current.set(id, created);

    return created;
  }

  function clearHover(id: string) {
    setHoveredId((current) => (current === id ? null : current));
  }

  function playCard(card: FanCard) {
    if (playedIds.includes(card.id)) {
      return;
    }

    clearHover(card.id);

    if (controlledPlayedIds === undefined) {
      setInternalPlayedIds((current) =>
        current.includes(card.id) ? current : [...current, card.id],
      );
    }

    onPlay?.(card);
  }

  return (
    <div className={cn("relative h-full w-full", className)} ref={containerRef}>
      {cards.map((card) => {
        const playOrder = playedIds.indexOf(card.id);
        const isPlayed = playOrder !== -1;
        const handIndex = handCards.findIndex(
          (candidate) => candidate.id === card.id,
        );

        let target: { rotate: number; scale: number; x: number; y: number };
        let zIndex: number;

        if (isPlayed) {
          const pile = pileTransform(card.id);

          target = {
            rotate: pile.rotate,
            scale: 1,
            x: pile.x,
            y: pile.y,
          };
          zIndex = 100 + playOrder;
        } else {
          const fan = fanTransform(handIndex, handCards.length, fanSpacing);
          const isHovered = card.id === hoveredId;
          const neighborShift =
            hoveredIndex !== -1 && !isHovered
              ? (Math.sign(handIndex - hoveredIndex) * 24) /
                Math.max(1, Math.abs(handIndex - hoveredIndex))
              : 0;

          target = {
            rotate: isHovered ? fan.rotate * 0.3 : fan.rotate,
            scale: isHovered ? 1.06 : 1,
            x: fan.x + neighborShift,
            // Lift to a constant height so hovered cards fully clear the
            // bottom edge no matter how far they droop along the arc.
            y: isHovered ? -hoverLift : fan.y,
          };
          zIndex = isHovered ? 60 : 10 + handIndex;
        }

        return (
          <motion.div
            animate={target}
            className="absolute left-1/2"
            initial={false}
            key={card.id}
            style={{
              bottom: -bottomTuck,
              marginLeft: -cardWidth / 2,
              zIndex,
            }}
            transition={cardTransition}
          >
            <motion.button
              aria-label={
                isPlayed
                  ? `${rankNames[card.rank]} of ${card.suit}, played`
                  : `Play the ${rankNames[card.rank]} of ${card.suit}`
              }
              className={
                isPlayed
                  ? "block cursor-default rounded-[8px] focus-visible:outline-none"
                  : "block cursor-grab rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 active:cursor-grabbing"
              }
              disabled={isPlayed}
              drag={isPlayed ? false : "y"}
              dragConstraints={{ bottom: 0, top: -260 }}
              dragElastic={0.12}
              dragSnapToOrigin
              onBlur={() => clearHover(card.id)}
              onDragEnd={(_event, info) => {
                if (
                  info.offset.y < playThresholdY ||
                  info.velocity.y < playThresholdVelocity
                ) {
                  playCard(card);
                }
              }}
              onFocus={() => {
                if (!isPlayed) {
                  setHoveredId(card.id);
                }
              }}
              onHoverEnd={() => clearHover(card.id)}
              onHoverStart={() => {
                if (!isPlayed) {
                  setHoveredId(card.id);
                }
              }}
              onTap={() => {
                if (!isPlayed) {
                  playCard(card);
                }
              }}
              type="button"
            >
              <PlayingCard
                rank={card.rank}
                suit={card.suit}
                width={cardWidth}
              />
            </motion.button>
          </motion.div>
        );
      })}
    </div>
  );
}
