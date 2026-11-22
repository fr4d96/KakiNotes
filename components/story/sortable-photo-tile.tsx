"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Listeners = Record<string, (event: never) => void>;

export type PhotoDragHandle = {
  /** Mouse/touch drag: spread on the thumbnail. No keyboard listener. */
  listeners: Listeners | undefined;
  isDragging: boolean;
  /**
   * Keyboard reorder: spread on a real <button> inside the tile. Space or
   * Enter picks the photo up, arrow keys move it, Space/Enter drops it,
   * Escape puts it back. It is the activator, so focus returns to it after
   * a drop.
   */
  keyboardHandle: {
    ref: (node: HTMLElement | null) => void;
    onKeyDown: ((event: KeyboardEvent) => void) | undefined;
    "aria-describedby"?: string;
    "aria-roledescription"?: string;
    "aria-pressed"?: boolean;
    "aria-disabled"?: boolean;
  };
};

/**
 * One photo tile in the editor's photo grid, draggable to a new position
 * (image-upload-manager.tsx owns the DndContext and the order). The tile
 * itself is the <li>.
 *
 * Two activators, split by input: the thumbnail takes the mouse/touch
 * listeners, and a separate keyboard handle button takes onKeyDown. The
 * sortable `attributes` (role="button", tabIndex) are NOT spread on the
 * thumbnail: they would make it a focusable button wrapped around the
 * lightbox button (nested interactive controls). The handle is a real
 * button instead, so only its ARIA attributes are passed through.
 */
export function SortablePhotoTile({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  children: (handle: PhotoDragHandle) => ReactNode;
}) {
  const {
    attributes,
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const { onKeyDown, ...pointerListeners } = (listeners ?? {}) as Listeners;

  return (
    <li
      ref={setNodeRef}
      // Translate, not Transform: a scale would stretch the photo.
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
      className={className}
      data-dragging={isDragging || undefined}
    >
      {children({
        listeners: disabled || !listeners ? undefined : pointerListeners,
        isDragging,
        keyboardHandle: {
          ref: setActivatorNodeRef,
          onKeyDown: disabled
            ? undefined
            : (onKeyDown as ((event: KeyboardEvent) => void) | undefined),
          "aria-describedby": attributes["aria-describedby"],
          "aria-roledescription": attributes["aria-roledescription"],
          "aria-pressed": attributes["aria-pressed"],
          "aria-disabled": attributes["aria-disabled"],
        },
      })}
    </li>
  );
}
