"use client";

import {
  ArrowFatDownIcon,
  CheckCircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ComponentPropsWithoutRef,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  QueueTicketClip,
  QueueTicketNextTab,
} from "@/components/QueueTicketClip";
import { cn } from "@/helpers/classname-helper";

export type WaitlistJoinResult = {
  peopleAhead?: number;
  position: number;
};

export type WaitlistTicketProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "onSubmit"
> & {
  buttonLabel?: string;
  description?: string;
  onJoin: (email: string) => Promise<WaitlistJoinResult>;
  successTitle?: string;
  title?: string;
};

type WaitlistStage = "idle" | "submitting" | "success";

const easeOut = [0.23, 1, 0.32, 1] as const;

function formatQueueNumber(position: number) {
  return Math.max(1, Math.floor(position)).toString().padStart(4, "0");
}

export function WaitlistTicket({
  buttonLabel = "Join the queue",
  className,
  description = "Get an early place when the doors open.",
  onJoin,
  successTitle = "You're on the list",
  title = "Join the waitlist",
  ...props
}: WaitlistTicketProps) {
  const shouldReduceMotion = useReducedMotion();
  const descriptionId = useId();
  const errorId = useId();
  const ticketClipId = useId().replaceAll(":", "");
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [result, setResult] = useState<WaitlistJoinResult | null>(null);
  const [stage, setStage] = useState<WaitlistStage>("idle");
  const isSuccess = stage === "success" && result !== null;
  const shouldMove = !shouldReduceMotion;
  const peopleAhead = result
    ? Math.max(0, result.peopleAhead ?? result.position - 1)
    : 0;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) {
      return;
    }

    setError("");
    setStage("submitting");

    try {
      const nextResult = await onJoin(email.trim());

      if (!Number.isFinite(nextResult.position) || nextResult.position < 1) {
        throw new Error("The queue returned an invalid position.");
      }

      setResult(nextResult);
      setStage("success");
      window.requestAnimationFrame(() =>
        ticketRef.current?.focus({ preventScroll: true }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "We couldn't add you. Please try again.",
      );
      setStage("idle");
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn("w-full max-w-md", className)}
      {...props}
    >
      <div className="text-center">
        <h2
          className="font-semibold text-grayscale-12 text-xl tracking-[-0.025em]"
          id={titleId}
        >
          {isSuccess ? successTitle : title}
        </h2>
        <p
          className="mx-auto mt-1 max-w-xs text-pretty text-grayscale-11 text-sm leading-5"
          id={descriptionId}
        >
          {isSuccess
            ? `${peopleAhead.toLocaleString()} ${peopleAhead === 1 ? "person" : "people"} ahead of you.`
            : description}
        </p>
      </div>

      <div className="relative mt-5 flex min-h-[21rem] w-full flex-col items-center">
        <QueueTicketClip id={ticketClipId} />
        <div
          className={cn(
            "relative z-20 h-12 overflow-hidden rounded-xl border small-shadow transition-[width,background-color,border-color,color] duration-[400ms] [transition-timing-function:cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none",
            isSuccess
              ? "w-52 border-black bg-black text-white"
              : "w-full border-grayscale-3 bg-white text-grayscale-12 dark:border-grayscale-5 dark:bg-grayscale-3",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {isSuccess ? (
              <motion.div
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center gap-2"
                initial={{
                  opacity: shouldMove ? 0 : 1,
                  transform: shouldMove ? "translateY(5px)" : "translateY(0px)",
                }}
                key="joined"
                transition={{
                  delay: shouldMove ? 0.22 : 0,
                  duration: shouldMove ? 0.18 : 0,
                  ease: easeOut,
                }}
              >
                <span className="grid size-5 shrink-0 place-items-center text-green-9">
                  <CheckCircleIcon size={17} weight="fill" />
                </span>
                <span className="font-medium text-sm">You&apos;re in</span>
              </motion.div>
            ) : (
              <motion.form
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                className="absolute inset-0 flex items-center gap-1 p-1"
                exit={{
                  opacity: shouldMove ? 0 : 1,
                  transform: shouldMove
                    ? "translateY(-5px)"
                    : "translateY(0px)",
                }}
                initial={false}
                key="form"
                noValidate={false}
                onSubmit={handleSubmit}
                transition={{ duration: shouldMove ? 0.16 : 0, ease: easeOut }}
              >
                <label className="sr-only" htmlFor={`${titleId}-email`}>
                  Email address
                </label>
                <input
                  aria-describedby={error ? errorId : descriptionId}
                  aria-invalid={error ? true : undefined}
                  autoComplete="email"
                  className="h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2.5 text-grayscale-12 text-sm outline-none placeholder:text-grayscale-9 focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:cursor-wait disabled:opacity-65"
                  disabled={!isHydrated || stage === "submitting"}
                  id={`${titleId}-email`}
                  name="email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                  placeholder="you@example.com"
                  ref={inputRef}
                  required
                  type="email"
                  value={email}
                />
                <button
                  className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-grayscale-12 bg-grayscale-12 px-3 font-medium text-grayscale-1 text-sm transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-grayscale-11 active:scale-[0.97] disabled:cursor-wait disabled:opacity-80 disabled:active:scale-100 dark:border-grayscale-6 dark:bg-grayscale-5 dark:text-grayscale-12 dark:hover:bg-grayscale-6 motion-reduce:transition-none"
                  disabled={!isHydrated || stage === "submitting"}
                  type="submit"
                >
                  {stage === "submitting" ? (
                    <CircleNotchIcon
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                      size={15}
                      weight="bold"
                    />
                  ) : null}
                  {stage === "submitting" ? "Joining…" : buttonLabel}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p
          aria-live="polite"
          className={cn(
            "absolute top-14 min-h-5 text-center text-red-10 text-xs leading-5",
            (stage === "submitting" || isSuccess) && "sr-only",
          )}
          id={errorId}
          role="status"
        >
          {error || (stage === "submitting" ? "Joining the waitlist…" : "")}
        </p>

        <AnimatePresence>
          {isSuccess ? (
            <div className="relative z-10 -mt-11 h-[22rem] w-64 overflow-hidden px-10 pt-6">
              <motion.div
                animate={{ opacity: 1, transform: "translateY(0%)" }}
                className="relative isolate mx-auto h-[280px] w-44 drop-shadow-[0_8px_12px_rgba(0,0,0,0.16)]"
                initial={{
                  opacity: shouldMove ? 0 : 1,
                  transform: shouldMove
                    ? "translateY(calc(-100% + 4px))"
                    : "translateY(0%)",
                }}
                transition={{
                  opacity: { duration: shouldMove ? 0.14 : 0, ease: easeOut },
                  transform: shouldMove
                    ? {
                        bounce: 0.12,
                        delay: 0.32,
                        duration: 0.55,
                        type: "spring",
                      }
                    : { duration: 0 },
                }}
              >
                <QueueTicketNextTab />
                <article
                  aria-label={`Waitlist ticket number ${result.position}. ${peopleAhead} people ahead of you.`}
                  className="relative z-10 h-full w-full bg-white bg-[url('/textures/receipt-paper.svg')] bg-cover text-[#211f18] outline-none bg-blend-soft-light"
                  ref={ticketRef}
                  style={{ clipPath: `url(#${ticketClipId})` }}
                  tabIndex={-1}
                >
                  <span className="absolute top-5 left-2.5 font-mono font-bold text-[7px] uppercase tracking-[0.1em] opacity-65 [writing-mode:vertical-rl]">
                    Waitlist
                  </span>
                  <span className="absolute top-5 right-2.5 font-mono font-bold text-[7px] uppercase tracking-[0.1em] opacity-65 [writing-mode:vertical-rl]">
                    Queue ticket
                  </span>

                  <div className="absolute inset-x-2 top-[42%] text-center">
                    <p className="font-mono font-bold text-[8px] uppercase tracking-[0.16em] opacity-55">
                      Your number
                    </p>
                    <p className="mt-1 font-number font-semibold text-[54px] leading-none tracking-[-0.055em] tabular-nums">
                      {formatQueueNumber(result.position)}
                    </p>
                    <p className="mt-1 font-medium text-[9px] uppercase tracking-[0.08em]">
                      {peopleAhead.toLocaleString()} ahead of you
                    </p>
                  </div>
                  <ArrowFatDownIcon
                    aria-hidden="true"
                    className="absolute bottom-5 left-1/2 -translate-x-1/2"
                    size={34}
                    weight="fill"
                  />
                </article>
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
