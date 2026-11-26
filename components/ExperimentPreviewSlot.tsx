"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";

/**
 * Holds a preview's space and only mounts it while it's on or near the
 * screen. Previews further away are left unmounted, so their animations,
 * timers and listeners don't run while nobody can see them.
 */
export function ExperimentPreviewSlot({
  children,
  featured = false,
}: {
  children: ReactNode;
  featured?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsNear(entry.isIntersecting),
      { rootMargin: "300px 0px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-lg bg-grayscale-2",
        featured ? "h-40" : "h-32",
      )}
      ref={ref}
    >
      {isNear ? children : null}
    </div>
  );
}
