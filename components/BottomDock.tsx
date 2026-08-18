"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  PikaCalendarIcon,
  PikaEnvelopeIcon,
  PikaGithubIcon,
  PikaHomeIcon,
  PikaMoonIcon,
  PikaXIcon,
} from "@/components/PikaDockIcons";
import { Tooltip } from "@/components/public/Tooltip";
import { cn } from "@/helpers/classname-helper";

const dockItemClassName =
  "flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md px-3 font-medium text-[var(--dock-text)] text-xs outline-none transition-[background-color,color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-[var(--dock-active)] hover:text-[var(--dock-text-strong)] focus-visible:ring-2 focus-visible:ring-[var(--dock-ring)] active:scale-[0.97] motion-reduce:transition-none max-[399px]:w-8 max-[399px]:px-0";

const iconItemClassName = cn(dockItemClassName, "w-8 px-0");

// Half the button height keeps the pill ends from scaling down the 6px inner corners.
function DockTooltip({
  children,
  edge,
  label,
}: {
  children: React.ReactElement;
  edge?: "start" | "end";
  label: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        className={cn(
          iconItemClassName,
          edge === "start" && "rounded-l-[16px]",
          edge === "end" && "rounded-r-[16px]",
        )}
        render={children}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = "Toggle dark mode";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        className={cn(
          iconItemClassName,
          "rounded-r-[16px]",
          isDark && "bg-[var(--dock-selected)] text-[var(--dock-text-strong)]",
        )}
        disabled={!mounted}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        <PikaMoonIcon filled={isDark} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function BottomDock() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const isHome = pathname === "/";
  const isSiteDark = resolvedTheme === "dark";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.code !== "KeyK" ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setIsVisible((current) => !current);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-100 flex justify-center px-3">
      <Tooltip.Provider>
        <div
          className={cn(
            "dark pointer-events-auto rounded-full bg-[var(--dock-outer)] p-1 shadow-[0_6px_20px_rgba(0,0,0,0.14),0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur-sm [--dock-active:#2a2a2a] [--dock-inner:#222222] [--dock-inner-border:#2a2a2a] [--dock-outer:#111111] [--dock-ring:#606060] [--dock-selected:#313131] [--dock-text:#b4b4b4] [--dock-text-strong:#eeeeee]",
            isSiteDark &&
              "[--dock-active:#3a3a3a] [--dock-inner:#313131] [--dock-inner-border:#3a3a3a] [--dock-outer:#222222] [--dock-ring:#7b7b7b] [--dock-selected:#484848] [--dock-text:#eeeeee]",
          )}
        >
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-1 rounded-full border border-[var(--dock-inner-border)] bg-[var(--dock-inner)] p-1 small-shadow"
          >
            <DockTooltip edge="start" label="Home">
              <Link
                aria-current={isHome ? "page" : undefined}
                className={cn(
                  isHome &&
                    "bg-[var(--dock-selected)] text-[var(--dock-text-strong)]",
                )}
                href="/"
              >
                <PikaHomeIcon filled={isHome} />
              </Link>
            </DockTooltip>
            <DockTooltip label="Twitter">
              <a
                href="https://x.com/dqnamo"
                rel="noopener noreferrer"
                target="_blank"
              >
                <PikaXIcon />
              </a>
            </DockTooltip>
            <DockTooltip label="GitHub">
              <a
                href="https://github.com/dqnamo"
                rel="noopener noreferrer"
                target="_blank"
              >
                <PikaGithubIcon />
              </a>
            </DockTooltip>
            <DockTooltip label="Book a call">
              <a
                href="https://cal.com/interface.london/20min"
                rel="noopener noreferrer"
                target="_blank"
              >
                <PikaCalendarIcon />
              </a>
            </DockTooltip>
            <DockTooltip label="Email JP">
              <a href="mailto:jp@interface.london">
                <PikaEnvelopeIcon />
              </a>
            </DockTooltip>
            <ThemeButton />
          </nav>
        </div>
      </Tooltip.Provider>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}
