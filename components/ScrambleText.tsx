"use client";

import { useEffect, useState } from "react";
import { cn } from "@/helpers/classname-helper";

type ScrambleTextProps = {
  children: string;
  className?: string;
  intervalMs?: number;
};

const ENCRYPTED_TEXT_CHARS = "-_~`!@#$%^&*()+=[]{}|;:,.<>?";

function getEncryptedTextChar() {
  return ENCRYPTED_TEXT_CHARS[
    Math.floor(Math.random() * ENCRYPTED_TEXT_CHARS.length)
  ];
}

function scrambleText(text: string, revealedCount: number) {
  return text
    .split("")
    .map((character, index) => {
      if (character === " " || index < revealedCount) {
        return character;
      }

      return getEncryptedTextChar();
    })
    .join("");
}

export function ScrambleText({
  children,
  className,
  intervalMs = 32,
}: ScrambleTextProps) {
  const [displayText, setDisplayText] = useState(() =>
    scrambleText(children, 0),
  );

  useEffect(() => {
    let revealedCount = 0;
    setDisplayText(scrambleText(children, revealedCount));

    const timer = window.setInterval(() => {
      revealedCount += 1;
      setDisplayText(scrambleText(children, revealedCount));

      if (revealedCount >= children.length) {
        window.clearInterval(timer);
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [children, intervalMs]);

  return (
    <span aria-live="polite" className={cn("inline-block", className)}>
      {displayText}
    </span>
  );
}
