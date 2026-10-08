"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type PhotoDragHandle = {
  ref: (node: HTMLElement | null) => void;
  listeners: Record<string, (event: never) => void> | undefined;
  isDragging: boolean;
};

/**
 * One photo tile in the editor's photo grid, draggable to a new position
 * (image-upload-manager.tsx owns the DndContext and the order). The tile
 * itself is the <li>; the render prop hands the drag listeners to the
 * thumbnail only, so the Details button and the open details panel never
 * start a drag.
 *
 * No `attributes` from useSortable are spread: they would make the
 * thumbnail a focusable role="button" wrapped around the lightbox button
 * (nested interactive controls). Keyboard users reorder with the existing
 * "Move earlier / Move later" buttons instead.
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
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      // Translate, not Transform: tiles can differ in size (an open tile
      // spans several columns), and a scale would stretch the photo.
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
        ref: setActivatorNodeRef,
        listeners: disabled
          ? undefined
          : (listeners as PhotoDragHandle["listeners"]),
        isDragging,
      })}
    </li>
  );
}
