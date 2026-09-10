"use client";

import { useEffect } from "react";

/** Option/Alt + Shift + R toggles recording chrome without changing layout. */
export function RecordingMode() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.code !== "KeyR" ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select")))
      ) {
        return;
      }

      event.preventDefault();
      document.documentElement.toggleAttribute("data-recording");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.removeAttribute("data-recording");
    };
  }, []);

  return null;
}
