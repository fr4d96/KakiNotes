"use client";

import { useEffect, useState } from "react";

/** Input types that open no on-screen keyboard. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** An element that raises the on-screen keyboard (or a picker) when focused. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  return target.isContentEditable;
}

/**
 * True while a text input / textarea / select / contenteditable has focus
 * anywhere in the document. Event delegation on `document` (focusin /
 * focusout bubble) so it covers fields rendered by any component. On
 * focusout the next focus target decides, so moving between two fields does
 * not flicker the bar.
 */
export function useTextEntryFocus(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    // A field can already be focused (autoFocus) before this listens; check
    // once on the next frame (not synchronously: it is a state update).
    const frame = requestAnimationFrame(() =>
      setTyping(isTextEntry(document.activeElement)),
    );
    const onFocusIn = (event: FocusEvent) =>
      setTyping(isTextEntry(event.target));
    const onFocusOut = (event: FocusEvent) =>
      setTyping(isTextEntry(event.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
