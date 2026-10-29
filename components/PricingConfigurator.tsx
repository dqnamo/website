"use client";

import NumberFlow, { type Format, NumberFlowGroup } from "@number-flow/react";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import {
  AnimatePresence,
  motion,
  useAnimate,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

export type BillingCycle = "annual" | "monthly";

export type PricingTier = {
  id: string;
  name: string;
  /** First seat count that belongs to this tier. */
  minSeats: number;
  /** Monthly price per seat for each billing cycle. Omit for a contact-sales tier. */
  price?: Record<BillingCycle, number>;
};

export type PricingFeature = {
  id: string;
  label: ReactNode;
  /** Id of the first tier that includes this feature. */
  tier: string;
};

export type PricingConfiguratorRootProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  /** Controlled billing cycle. */
  billing?: BillingCycle;
  children: ReactNode;
  /** ISO currency code used for every price. */
  currency?: string;
  defaultBilling?: BillingCycle;
  defaultSeats?: number;
  locale?: string;
  /** Highest seat count the slider can reach. */
  max: number;
  onBillingChange?: (billing: BillingCycle) => void;
  onSeatsChange?: (seats: number) => void;
  /** Controlled seat count. */
  seats?: number;
  /** Tiers ordered by `minSeats`. The first tier sets the slider minimum. */
  tiers: readonly PricingTier[];
};

export type PricingConfiguratorBillingToggleProps = Omit<
  ComponentPropsWithoutRef<"fieldset">,
  "children"
> & {
  annualLabel?: ReactNode;
  legend?: string;
  monthlyLabel?: ReactNode;
};

export type PricingConfiguratorSeatSliderProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  /** Accessible name for the slider. */
  label?: string;
  /** Distance in pixels at which a drag is pulled onto a tier boundary. */
  snapDistance?: number;
};

export type PricingConfiguratorFeaturesProps = Omit<
  ComponentPropsWithoutRef<"ul">,
  "children"
> & {
  features: readonly PricingFeature[];
};

export type PricingConfiguratorPriceProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  /** Shown in place of the price for contact-sales tiers. */
  contactLabel?: ReactNode;
};

export type PricingConfiguratorSummaryProps = Omit<
  ComponentPropsWithoutRef<"p">,
  "children"
> & {
  /** Shown in place of the price breakdown for contact-sales tiers. */
  contactDescription?: ReactNode;
};

export type PricingConfiguratorTierNameProps = ComponentPropsWithoutRef<"span">;
export type PricingConfiguratorSeatsProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children"
>;
export type PricingConfiguratorSavingsProps = {
  className?: string;
};

type PricingConfiguratorContextValue = {
  billing: BillingCycle;
  currencyFormat: Format;
  locale: string;
  max: number;
  maxSavingsPercent: number;
  min: number;
  /** Per-seat monthly price for the active tier, or null for contact sales. */
  perSeat: number | null;
  previousTierIndex: number;
  /** Yearly amount saved by paying annually, or null when not applicable. */
  savings: number | null;
  seats: number;
  setBilling: (billing: BillingCycle) => void;
  setSeats: (seats: number) => void;
  shouldMove: boolean;
  tier: PricingTier;
  tierIndex: number;
  tiers: readonly PricingTier[];
  /** Monthly total for the active tier, or null for contact sales. */
  total: number | null;
};

const PricingConfiguratorContext =
  createContext<PricingConfiguratorContextValue | null>(null);

const easeOut = [0.23, 1, 0.32, 1] as const;
const thumbSpring = { damping: 34, mass: 0.6, stiffness: 620 };
const indicatorSpring = { bounce: 0, duration: 0.32, type: "spring" as const };
const numberTiming = {
  duration: 520,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
};
const detentGap = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getPricingTierIndex(
  tiers: readonly PricingTier[],
  seats: number,
) {
  let index = 0;

  for (let tierIndex = 1; tierIndex < tiers.length; tierIndex += 1) {
    if (seats >= tiers[tierIndex].minSeats) {
      index = tierIndex;
    }
  }

  return index;
}

function getSegmentBounds(
  tiers: readonly PricingTier[],
  max: number,
  index: number,
) {
  return {
    end: tiers[index + 1]?.minSeats ?? max,
    start: tiers[index].minSeats,
  };
}

// Each tier gets an equal share of the track, so small tiers stay easy to hit.
function seatsToPosition(
  tiers: readonly PricingTier[],
  max: number,
  seats: number,
) {
  const index = getPricingTierIndex(tiers, seats);
  const { end, start } = getSegmentBounds(tiers, max, index);
  const local = end === start ? 0 : (seats - start) / (end - start);

  return clamp((index + local) / tiers.length, 0, 1);
}

function positionToSeats(
  tiers: readonly PricingTier[],
  max: number,
  position: number,
) {
  const scaled = clamp(position, 0, 1) * tiers.length;
  const index = Math.min(Math.floor(scaled), tiers.length - 1);
  const { end, start } = getSegmentBounds(tiers, max, index);

  return Math.round(start + (scaled - index) * (end - start));
}

function formatSeatRange(
  tiers: readonly PricingTier[],
  max: number,
  index: number,
) {
  const next = tiers[index + 1];

  if (!next) {
    return tiers[index].minSeats >= max
      ? `${max}`
      : `${tiers[index].minSeats}+`;
  }

  const last = next.minSeats - 1;

  return last === tiers[index].minSeats
    ? `${last}`
    : `${tiers[index].minSeats}–${last}`;
}

export function usePricingConfigurator(component = "usePricingConfigurator") {
  const context = useContext(PricingConfiguratorContext);

  if (!context) {
    throw new Error(
      `${component} must be used inside PricingConfigurator.Root.`,
    );
  }

  return context;
}

function PricingConfiguratorRoot({
  billing: billingProp,
  children,
  className,
  currency = "USD",
  defaultBilling = "monthly",
  defaultSeats,
  locale = "en-US",
  max,
  onBillingChange,
  onSeatsChange,
  seats: seatsProp,
  tiers,
  ...props
}: PricingConfiguratorRootProps) {
  const shouldReduceMotion = useReducedMotion();
  const min = tiers[0]?.minSeats ?? 1;
  const [uncontrolledSeats, setUncontrolledSeats] = useState(
    () => defaultSeats ?? min,
  );
  const [uncontrolledBilling, setUncontrolledBilling] =
    useState<BillingCycle>(defaultBilling);
  const seats = clamp(Math.round(seatsProp ?? uncontrolledSeats), min, max);
  const billing = billingProp ?? uncontrolledBilling;
  const tierIndex = getPricingTierIndex(tiers, seats);
  const tier = tiers[tierIndex];
  const [tierHistory, setTierHistory] = useState({
    current: tierIndex,
    previous: tierIndex,
  });

  // Remember where we came from so unlocks can stagger across skipped tiers.
  if (tierHistory.current !== tierIndex) {
    setTierHistory({ current: tierIndex, previous: tierHistory.current });
  }

  const perSeat = tier.price ? tier.price[billing] : null;
  const total = perSeat === null ? null : perSeat * seats;
  const savings =
    tier.price && billing === "annual"
      ? (tier.price.monthly - tier.price.annual) * seats * 12
      : null;
  const maxSavingsPercent = tiers.reduce((highest, { price }) => {
    if (!price || price.monthly <= 0) {
      return highest;
    }

    return Math.max(
      highest,
      Math.round((1 - price.annual / price.monthly) * 100),
    );
  }, 0);

  function setSeats(nextSeats: number) {
    const clampedSeats = clamp(Math.round(nextSeats), min, max);

    if (clampedSeats === seats) {
      return;
    }

    if (seatsProp === undefined) {
      setUncontrolledSeats(clampedSeats);
    }

    onSeatsChange?.(clampedSeats);
  }

  function setBilling(nextBilling: BillingCycle) {
    if (nextBilling === billing) {
      return;
    }

    if (billingProp === undefined) {
      setUncontrolledBilling(nextBilling);
    }

    onBillingChange?.(nextBilling);
  }

  const context: PricingConfiguratorContextValue = {
    billing,
    currencyFormat: {
      currency,
      maximumFractionDigits: 0,
      style: "currency",
    },
    locale,
    max,
    maxSavingsPercent,
    min,
    perSeat,
    previousTierIndex: tierHistory.previous,
    savings,
    seats,
    setBilling,
    setSeats,
    shouldMove: !shouldReduceMotion,
    tier,
    tierIndex,
    tiers,
    total,
  };

  return (
    <PricingConfiguratorContext.Provider value={context}>
      <NumberFlowGroup>
        <div
          className={cn("flex flex-col", className)}
          data-billing={billing}
          data-tier={tier.id}
          {...props}
        >
          {children}
        </div>
      </NumberFlowGroup>
    </PricingConfiguratorContext.Provider>
  );
}

function PricingConfiguratorBillingToggle({
  annualLabel = "Annual",
  className,
  legend = "Billing cycle",
  monthlyLabel = "Monthly",
  ...props
}: PricingConfiguratorBillingToggleProps) {
  const { billing, maxSavingsPercent, setBilling, shouldMove } =
    usePricingConfigurator("PricingConfigurator.BillingToggle");
  const name = useId();
  const options = [
    { label: monthlyLabel, value: "monthly" },
    { label: annualLabel, value: "annual" },
  ] as const;

  return (
    <fieldset
      className={cn(
        "relative inline-grid h-8 grid-cols-2 rounded-[10px] border border-grayscale-3 bg-grayscale-2 p-0.5 dark:border-grayscale-5 dark:bg-grayscale-4",
        className,
      )}
      {...props}
    >
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const checked = billing === option.value;

        return (
          <label
            className={cn(
              "relative flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2.5 font-medium text-xs transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-grayscale-8",
              checked
                ? "text-grayscale-12"
                : "text-grayscale-10 hover:text-grayscale-11",
            )}
            key={option.value}
          >
            <input
              checked={checked}
              className="sr-only"
              name={name}
              onChange={() => setBilling(option.value)}
              type="radio"
              value={option.value}
            />
            {checked ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-lg border border-grayscale-3 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-grayscale-7 dark:bg-grayscale-6"
                layoutId={`${name}-indicator`}
                transition={shouldMove ? indicatorSpring : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
            {option.value === "annual" && maxSavingsPercent > 0 ? (
              <span className="relative rounded-[5px] bg-green-3 px-1 py-px font-semibold text-[10px] text-green-11 leading-4 dark:bg-green-4">
                −{maxSavingsPercent}%
              </span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}

function PricingConfiguratorTierName({
  className,
  ...props
}: PricingConfiguratorTierNameProps) {
  const { previousTierIndex, shouldMove, tier, tierIndex } =
    usePricingConfigurator("PricingConfigurator.TierName");
  const direction = tierIndex >= previousTierIndex ? 1 : -1;
  const offset = shouldMove ? 10 : 0;

  return (
    <span
      className={cn("relative inline-flex overflow-hidden", className)}
      {...props}
    >
      <span className="sr-only">{tier.name}</span>
      <AnimatePresence custom={direction} initial={false} mode="popLayout">
        <motion.span
          animate="visible"
          aria-hidden="true"
          className="inline-flex whitespace-pre"
          custom={direction}
          exit="exit"
          initial="enter"
          key={tier.id}
          variants={{
            enter: {},
            exit: {
              transition: { staggerChildren: 0.012 },
            },
            visible: {
              transition: { staggerChildren: 0.018 },
            },
          }}
        >
          {Array.from(tier.name).map((character, index) => (
            <motion.span
              className="inline-block"
              custom={direction}
              // biome-ignore lint/suspicious/noArrayIndexKey: characters repeat, and position is their identity.
              key={index}
              variants={{
                enter: (dir: number) => ({
                  filter: shouldMove ? "blur(3px)" : "blur(0px)",
                  opacity: 0,
                  transform: `translateY(${dir * offset}px)`,
                }),
                exit: (dir: number) => ({
                  filter: shouldMove ? "blur(3px)" : "blur(0px)",
                  opacity: 0,
                  transform: `translateY(${-dir * offset}px)`,
                  transition: { duration: 0.14, ease: easeOut },
                }),
                visible: {
                  filter: "blur(0px)",
                  opacity: 1,
                  transform: "translateY(0px)",
                  transition: { duration: 0.26, ease: easeOut },
                },
              }}
            >
              {character}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function PricingConfiguratorSeats({
  className,
  ...props
}: PricingConfiguratorSeatsProps) {
  const { max, seats } = usePricingConfigurator("PricingConfigurator.Seats");

  return (
    <span
      className={cn("inline-flex items-baseline tabular-nums", className)}
      {...props}
    >
      <NumberFlow
        spinTiming={numberTiming}
        suffix={seats >= max ? "+" : undefined}
        transformTiming={numberTiming}
        value={seats}
        willChange
      />
      <span className="ml-1">{seats === 1 ? "seat" : "seats"}</span>
    </span>
  );
}

function PricingConfiguratorPrice({
  className,
  contactLabel = "Custom",
  ...props
}: PricingConfiguratorPriceProps) {
  const { currencyFormat, locale, shouldMove, total } = usePricingConfigurator(
    "PricingConfigurator.Price",
  );
  const offset = shouldMove ? 12 : 0;
  const swapMotion = {
    animate: {
      filter: "blur(0px)",
      opacity: 1,
      transform: "translateY(0px) scale(1)",
    },
    exit: {
      filter: shouldMove ? "blur(4px)" : "blur(0px)",
      opacity: 0,
      transform: `translateY(${-offset}px) scale(${shouldMove ? 0.96 : 1})`,
      transition: { duration: 0.16, ease: easeOut },
    },
    initial: {
      filter: shouldMove ? "blur(4px)" : "blur(0px)",
      opacity: 0,
      transform: `translateY(${offset}px) scale(${shouldMove ? 0.96 : 1})`,
    },
    transition: { duration: 0.3, ease: easeOut },
  };

  return (
    <div
      className={cn(
        "relative flex h-11 items-end font-semibold text-4xl text-grayscale-12 tracking-[-0.03em]",
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {total === null ? (
          <motion.span
            className="block origin-bottom-left leading-none"
            key="contact"
            {...swapMotion}
          >
            {contactLabel}
          </motion.span>
        ) : (
          <motion.span
            className="flex origin-bottom-left items-baseline gap-1 leading-none"
            key="price"
            {...swapMotion}
          >
            <NumberFlow
              className="tabular-nums"
              format={currencyFormat}
              locales={locale}
              spinTiming={numberTiming}
              transformTiming={numberTiming}
              value={total}
              willChange
            />
            <span className="font-medium text-grayscale-10 text-sm tracking-normal">
              /mo
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function PricingConfiguratorSummary({
  className,
  contactDescription = "Volume pricing, tailored to your organisation.",
  ...props
}: PricingConfiguratorSummaryProps) {
  const { billing, currencyFormat, locale, perSeat, shouldMove, total } =
    usePricingConfigurator("PricingConfigurator.Summary");
  const offset = shouldMove ? 4 : 0;

  return (
    <p
      className={cn(
        "relative flex h-5 items-center text-grayscale-10 text-xs",
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {perSeat === null || total === null ? (
          <motion.span
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            className="block truncate"
            exit={{ opacity: 0, transform: `translateY(${-offset}px)` }}
            initial={{ opacity: 0, transform: `translateY(${offset}px)` }}
            key="contact"
            transition={{ duration: 0.2, ease: easeOut }}
          >
            {contactDescription}
          </motion.span>
        ) : (
          <motion.span
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            className="flex items-center gap-1 whitespace-nowrap tabular-nums"
            exit={{ opacity: 0, transform: `translateY(${-offset}px)` }}
            initial={{ opacity: 0, transform: `translateY(${offset}px)` }}
            key="price"
            transition={{ duration: 0.2, ease: easeOut }}
          >
            <NumberFlow
              format={currencyFormat}
              locales={locale}
              spinTiming={numberTiming}
              transformTiming={numberTiming}
              value={perSeat}
            />
            <span>per seat</span>
            <span aria-hidden="true" className="text-grayscale-7">
              ·
            </span>
            {billing === "annual" ? (
              <>
                <span>billed yearly as</span>
                <NumberFlow
                  format={currencyFormat}
                  locales={locale}
                  spinTiming={numberTiming}
                  transformTiming={numberTiming}
                  value={total * 12}
                />
              </>
            ) : (
              <span>billed monthly</span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </p>
  );
}

function PricingConfiguratorSavings({
  className,
}: PricingConfiguratorSavingsProps) {
  const { currencyFormat, locale, savings, shouldMove } =
    usePricingConfigurator("PricingConfigurator.Savings");
  const isVisible = savings !== null && savings > 0;

  return (
    <AnimatePresence initial={false}>
      {isVisible ? (
        <motion.span
          animate={{
            filter: "blur(0px)",
            opacity: 1,
            transform: "translateX(0px) scale(1)",
          }}
          className={cn(
            "inline-flex h-6 origin-left items-center gap-1 whitespace-nowrap rounded-full border border-green-5 bg-green-2 px-2 font-medium text-green-11 text-xs tabular-nums dark:border-green-6 dark:bg-green-3",
            className,
          )}
          exit={{
            filter: shouldMove ? "blur(2px)" : "blur(0px)",
            opacity: 0,
            transform: `translateX(${shouldMove ? -4 : 0}px) scale(${shouldMove ? 0.9 : 1})`,
            transition: { duration: 0.14, ease: easeOut },
          }}
          initial={{
            filter: shouldMove ? "blur(2px)" : "blur(0px)",
            opacity: 0,
            transform: `translateX(${shouldMove ? -6 : 0}px) scale(${shouldMove ? 0.9 : 1})`,
          }}
          transition={
            shouldMove
              ? { bounce: 0.3, duration: 0.42, type: "spring" }
              : { duration: 0.16 }
          }
        >
          <span>Save</span>
          <NumberFlow
            format={currencyFormat}
            locales={locale}
            spinTiming={numberTiming}
            suffix="/yr"
            transformTiming={numberTiming}
            value={savings}
          />
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

function PricingConfiguratorSeatSlider({
  className,
  label = "Seats",
  snapDistance = 12,
  ...props
}: PricingConfiguratorSeatSliderProps) {
  const {
    currencyFormat,
    locale,
    max,
    min,
    seats,
    setSeats,
    shouldMove,
    tier,
    tierIndex,
    tiers,
    total,
  } = usePricingConfigurator("PricingConfigurator.SeatSlider");
  const inputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<number | null>(null);
  const lastTierIndexRef = useRef(tierIndex);
  const [isDragging, setIsDragging] = useState(false);
  // Pointer drags focus the input from script, which Chrome treats as focus-visible.
  const [isPointerFocused, setIsPointerFocused] = useState(false);
  const [knobScope, animateKnob] = useAnimate<HTMLSpanElement>();
  const position = seatsToPosition(tiers, max, seats);
  const springPosition = useSpring(position, thumbSpring);
  const thumbLeft = useTransform(springPosition, (value) => `${value * 100}%`);
  const fillClipPath = useTransform(
    springPosition,
    (value) => `inset(0 ${(1 - value) * 100}% 0 0)`,
  );
  const priceText =
    total === null
      ? "contact sales"
      : `${new Intl.NumberFormat(locale, currencyFormat).format(total)} per month`;

  useEffect(() => {
    if (shouldMove) {
      springPosition.set(position);
    } else {
      springPosition.jump(position);
    }
  }, [position, shouldMove, springPosition]);

  // A small knock on the knob each time a tier boundary is crossed.
  useEffect(() => {
    if (lastTierIndexRef.current === tierIndex) {
      return;
    }

    lastTierIndexRef.current = tierIndex;

    if (!shouldMove || !knobScope.current) {
      return;
    }

    animateKnob(
      knobScope.current,
      { transform: ["scale(1)", "scale(1.28)", "scale(1)"] },
      { duration: 0.34, ease: easeOut, times: [0, 0.35, 1] },
    );

    if (dragPointerRef.current !== null) {
      navigator.vibrate?.(8);
    }
  }, [animateKnob, knobScope, shouldMove, tierIndex]);

  function getSeatsFromPointer(clientX: number) {
    const track = trackRef.current;

    if (!track) {
      return seats;
    }

    const rect = track.getBoundingClientRect();
    const pointerPosition = clamp((clientX - rect.left) / rect.width, 0, 1);

    // Tier boundaries act as detents: nearby drags snap onto the first seat of the tier.
    for (let index = 1; index < tiers.length; index += 1) {
      const boundary = index / tiers.length;

      if (Math.abs(pointerPosition - boundary) * rect.width <= snapDistance) {
        return tiers[index].minSeats;
      }
    }

    return positionToSeats(tiers, max, pointerPosition);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPointerRef.current = event.pointerId;
    setIsDragging(true);
    setIsPointerFocused(true);
    inputRef.current?.focus({ preventScroll: true });
    setSeats(getSeatsFromPointer(event.clientX));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragPointerRef.current !== event.pointerId) {
      return;
    }

    setSeats(getSeatsFromPointer(event.clientX));
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragPointerRef.current !== event.pointerId) {
      return;
    }

    dragPointerRef.current = null;
    setIsDragging(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    setIsPointerFocused(false);

    let nextSeats: number | null = null;

    if (event.key === "PageUp") {
      nextSeats =
        tiers.find((candidate) => candidate.minSeats > seats)?.minSeats ?? max;
    } else if (event.key === "PageDown") {
      nextSeats =
        tiers.findLast((candidate) => candidate.minSeats < seats)?.minSeats ??
        min;
    } else if (
      event.shiftKey &&
      (event.key === "ArrowRight" || event.key === "ArrowUp")
    ) {
      nextSeats = seats + 10;
    } else if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowDown")
    ) {
      nextSeats = seats - 10;
    }

    if (nextSeats === null) {
      return;
    }

    event.preventDefault();
    setSeats(nextSeats);
  }

  return (
    <div
      className={cn(
        "group/seat-slider relative touch-none select-none pt-1",
        isDragging ? "cursor-grabbing" : "cursor-pointer",
        className,
      )}
      data-dragging={isDragging ? "" : undefined}
      onLostPointerCapture={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      {...props}
    >
      <input
        aria-label={label}
        aria-valuetext={`${seats} ${seats === 1 ? "seat" : "seats"}, ${tier.name} plan, ${priceText}`}
        className="sr-only"
        max={max}
        min={min}
        onChange={(event) => setSeats(Number(event.target.value))}
        onBlur={() => setIsPointerFocused(false)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        step={1}
        type="range"
        value={seats}
      />

      <div className="relative h-5" ref={trackRef}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2">
          <TrackSegments
            className="bg-grayscale-4 dark:bg-grayscale-6"
            count={tiers.length}
          />
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ clipPath: fillClipPath }}
          >
            <TrackSegments className="bg-grayscale-12" count={tiers.length} />
          </motion.div>
        </div>

        <motion.div
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[box-shadow] duration-150",
            !isPointerFocused &&
              "group-has-[input:focus-visible]/seat-slider:ring-2 group-has-[input:focus-visible]/seat-slider:ring-grayscale-8 group-has-[input:focus-visible]/seat-slider:ring-offset-2 group-has-[input:focus-visible]/seat-slider:ring-offset-grayscale-1 dark:group-has-[input:focus-visible]/seat-slider:ring-offset-grayscale-3",
          )}
          style={{ left: thumbLeft }}
        >
          <span className="block size-full" ref={knobScope}>
            <span
              className={cn(
                "block size-full rounded-full border border-grayscale-5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_10px_-2px_rgba(0,0,0,0.14)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] dark:border-grayscale-11 dark:bg-grayscale-12",
                isDragging ? "scale-[1.12]" : "scale-100",
              )}
            />
          </span>
        </motion.div>
      </div>

      <div
        aria-hidden="true"
        className="mt-2.5 grid"
        style={{
          gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))`,
        }}
      >
        {tiers.map((candidate, index) => {
          const isActive = index === tierIndex;
          return (
            <div className="flex min-w-0 flex-col" key={candidate.id}>
              <span
                className={cn(
                  "truncate font-medium text-xs transition-colors duration-200",
                  isActive ? "text-grayscale-12" : "text-grayscale-9",
                )}
              >
                {candidate.name}
              </span>
              <span className="truncate text-[11px] text-grayscale-9 tabular-nums">
                {formatSeatRange(tiers, max, index)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackSegments({
  className,
  count,
}: {
  className: string;
  count: number;
}) {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {Array.from({ length: count }, (_, index) => {
        const insetStart = index === 0 ? 0 : detentGap / 2;
        const insetEnd = index === count - 1 ? 0 : detentGap / 2;

        return (
          <span
            className={cn("absolute inset-y-0 rounded-full", className)}
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional.
            key={index}
            style={{
              left: `calc(${(index / count) * 100}% + ${insetStart}px)`,
              width: `calc(${100 / count}% - ${insetStart + insetEnd}px)`,
            }}
          />
        );
      })}
    </div>
  );
}

function PricingConfiguratorFeatures({
  className,
  features,
  ...props
}: PricingConfiguratorFeaturesProps) {
  const { previousTierIndex, shouldMove, tierIndex, tiers } =
    usePricingConfigurator("PricingConfigurator.Features");
  const tierIndexById = new Map(
    tiers.map((candidate, index) => [candidate.id, index]),
  );
  let unlockOrder = 0;

  return (
    <ul className={cn("flex flex-col gap-2", className)} {...props}>
      {features.map((feature) => {
        const featureTierIndex = tierIndexById.get(feature.tier) ?? 0;
        const featureTier = tiers[featureTierIndex];
        const isUnlocked = featureTierIndex <= tierIndex;
        const isNewlyUnlocked =
          isUnlocked && featureTierIndex > previousTierIndex;
        const delay = isNewlyUnlocked ? unlockOrder++ * 0.045 : 0;

        return (
          <li
            className="flex min-h-5 items-center gap-2.5 text-[13px]"
            data-unlocked={isUnlocked ? "" : undefined}
            key={feature.id}
          >
            <FeatureMark
              delay={delay}
              isUnlocked={isUnlocked}
              shouldMove={shouldMove}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate transition-colors duration-200",
                isUnlocked ? "text-grayscale-12" : "text-grayscale-9",
              )}
              style={{ transitionDelay: `${delay}s` }}
            >
              {feature.label}
            </span>
            <span className="sr-only">
              {isUnlocked
                ? "Included"
                : `Not included, available on ${featureTier.name}`}
            </span>
            <AnimatePresence initial={false}>
              {isUnlocked ? null : (
                <motion.span
                  animate={{ filter: "blur(0px)", opacity: 1 }}
                  aria-hidden="true"
                  className="shrink-0 rounded-md border border-grayscale-3 bg-grayscale-2 px-1.5 font-medium text-[10px] text-grayscale-10 leading-4 dark:border-grayscale-5 dark:bg-grayscale-4"
                  exit={{
                    filter: shouldMove ? "blur(2px)" : "blur(0px)",
                    opacity: 0,
                    transition: { delay, duration: 0.14, ease: easeOut },
                  }}
                  initial={{
                    filter: shouldMove ? "blur(2px)" : "blur(0px)",
                    opacity: 0,
                  }}
                  transition={{ duration: 0.2, ease: easeOut }}
                >
                  {featureTier.name}
                </motion.span>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function FeatureMark({
  delay,
  isUnlocked,
  shouldMove,
}: {
  delay: number;
  isUnlocked: boolean;
  shouldMove: boolean;
}) {
  const [rippleScope, animateRipple] = useAnimate<HTMLSpanElement>();
  const wasUnlockedRef = useRef(isUnlocked);
  // Resting values match with or without reduced motion so server markup hydrates cleanly.
  const scaleTransition = shouldMove ? undefined : { duration: 0 };

  useEffect(() => {
    const wasUnlocked = wasUnlockedRef.current;
    wasUnlockedRef.current = isUnlocked;

    if (!isUnlocked || wasUnlocked || !shouldMove || !rippleScope.current) {
      return;
    }

    animateRipple(
      rippleScope.current,
      { opacity: [0.45, 0], transform: ["scale(1)", "scale(2.2)"] },
      { delay, duration: 0.5, ease: easeOut },
    );
  }, [animateRipple, delay, isUnlocked, rippleScope, shouldMove]);

  return (
    <span aria-hidden="true" className="relative grid size-4 shrink-0">
      <span
        className="absolute inset-0 rounded-full border border-grayscale-12 opacity-0"
        ref={rippleScope}
      />
      <motion.span
        animate={{
          opacity: isUnlocked ? 0 : 1,
          transform: isUnlocked ? "scale(0.6)" : "scale(1)",
        }}
        className="absolute inset-0 grid place-items-center rounded-full border border-grayscale-6 border-dashed text-grayscale-8 dark:border-grayscale-7"
        initial={false}
        transition={{
          delay: isUnlocked ? delay + 0.08 : 0,
          duration: 0.14,
          transform: scaleTransition,
        }}
      >
        <LockSimpleIcon size={8} weight="bold" />
      </motion.span>
      <motion.span
        animate={
          isUnlocked
            ? {
                opacity: 1,
                transform: shouldMove
                  ? ["scale(0.5)", "scale(1.14)", "scale(1)"]
                  : "scale(1)",
              }
            : { opacity: 0, transform: "scale(0.7)" }
        }
        className="absolute inset-0 grid place-items-center rounded-full bg-grayscale-12 text-grayscale-1"
        initial={false}
        transition={
          isUnlocked
            ? {
                delay,
                duration: 0.36,
                ease: easeOut,
                opacity: { delay, duration: 0.1 },
                times: [0, 0.55, 1],
              }
            : { duration: 0.14, ease: easeOut, transform: scaleTransition }
        }
      >
        <svg
          aria-hidden="true"
          className="size-3"
          fill="none"
          viewBox="0 0 12 12"
        >
          <motion.path
            animate={{ pathLength: isUnlocked ? 1 : 0 }}
            d="M3.25 6.25 5.1 8l3.65-4"
            initial={false}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            transition={
              isUnlocked && shouldMove
                ? { delay: delay + 0.1, duration: 0.26, ease: easeOut }
                : { duration: 0 }
            }
          />
        </svg>
      </motion.span>
    </span>
  );
}

export const PricingConfigurator = {
  BillingToggle: PricingConfiguratorBillingToggle,
  Features: PricingConfiguratorFeatures,
  Price: PricingConfiguratorPrice,
  Root: PricingConfiguratorRoot,
  Savings: PricingConfiguratorSavings,
  SeatSlider: PricingConfiguratorSeatSlider,
  Seats: PricingConfiguratorSeats,
  Summary: PricingConfiguratorSummary,
  TierName: PricingConfiguratorTierName,
};
