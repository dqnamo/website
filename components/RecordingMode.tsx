"use client";

import { useEffect } from "react";

/** Remembers recording mode across refreshes. */
export const RECORDING_MODE_STORAGE_KEY = "recording-mode";

/**
 * Runs in the head before the page paints, so a refresh in recording mode
 * never flashes the dock or branding.
 */
export const restoreRecordingModeScript = `try{if(localStorage.getItem("${RECORDING_MODE_STORAGE_KEY}")==="on")document.documentElement.setAttribute("data-recording","")}catch(e){}`;

function readStoredRecordingMode() {
  try {
    return window.localStorage.getItem(RECORDING_MODE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function storeRecordingMode(isRecording: boolean) {
  try {
    if (isRecording) {
      window.localStorage.setItem(RECORDING_MODE_STORAGE_KEY, "on");
    } else {
      window.localStorage.removeItem(RECORDING_MODE_STORAGE_KEY);
    }
  } catch {
    // Private browsing can refuse storage; the toggle still works for this page.
  }
}

/** Option/Alt + Shift + R toggles recording chrome without changing layout. */
export function RecordingMode() {
  useEffect(() => {
    const root = document.documentElement;

    // The head script normally restores this already; re-apply in case a
    // remount (e.g. Strict Mode in development) cleared it.
    root.toggleAttribute("data-recording", readStoredRecordingMode());

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
      storeRecordingMode(root.toggleAttribute("data-recording"));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.removeAttribute("data-recording");
    };
  }, []);

  return null;
}
