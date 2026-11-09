"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  EraserIcon,
  PenNibIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Button, { getButtonClassName } from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";
import { STRIP_ROWS } from "@/lib/zoetrope/drum";
import { FRAME_WIDTH, GROUND } from "@/lib/zoetrope/strips";

const INK = "#1d1610";
// Room for the most pictures a strip can have.
export const MAX_PICTURES = 13;

export function makeFrames() {
  return Array.from({ length: MAX_PICTURES }, () => {
    const c = document.createElement("canvas");
    c.width = Math.round(FRAME_WIDTH);
    c.height = STRIP_ROWS;
    return c;
  });
}

// The strip taken out of the drum and laid on a light box, one picture at a time: the picture
// before shows through faintly, so the next can be drawn a step on from it, as animators trace.
export function StripEditor({
  frames,
  pictures,
  onChange,
  onDone,
}: {
  frames: HTMLCanvasElement[];
  pictures: number;
  onChange: () => void;
  onDone: () => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [version, setVersion] = useState(0);
  const stroke = useRef<{ id: number; x: number; y: number } | null>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);

  const at = Math.min(index, pictures - 1);
  const prev = (at - 1 + pictures) % pictures;

  const paint = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    const w = view.width;
    const h = view.height;
    const s = w / FRAME_WIDTH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ece1c6";
    ctx.fillRect(0, 0, w, h);
    ctx.scale(s, s);
    // The strip's ruled margins and the ground line, as guides.
    ctx.fillStyle = "rgba(29, 22, 16, 0.5)";
    ctx.fillRect(0, 9, FRAME_WIDTH, 2.4);
    ctx.fillRect(0, STRIP_ROWS - 11.4, FRAME_WIDTH, 2.4);
    ctx.fillStyle = "rgba(60, 90, 140, 0.18)";
    ctx.fillRect(0, GROUND, FRAME_WIDTH, 1.5);
    ctx.fillRect(FRAME_WIDTH / 2, 20, 1, STRIP_ROWS - 40);
    // The picture before, through the paper.
    const ghost = document.createElement("canvas");
    ghost.width = frames[prev].width;
    ghost.height = frames[prev].height;
    const g = ghost.getContext("2d");
    if (g && pictures > 1) {
      g.drawImage(frames[prev], 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "#3d6fb0";
      g.fillRect(0, 0, ghost.width, ghost.height);
      ctx.globalAlpha = 0.32;
      ctx.drawImage(ghost, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(frames[at], 0, 0);
    // Thumbnails of the whole strip.
    thumbs.current.forEach((thumb, k) => {
      const t = thumb?.getContext("2d");
      if (!thumb || !t) return;
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.fillStyle = "#ece1c6";
      t.fillRect(0, 0, thumb.width, thumb.height);
      t.drawImage(frames[k], 0, 0, thumb.width, thumb.height);
    });
  }, [frames, at, prev, pictures]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version is bumped after each stroke to repaint.
  useEffect(() => {
    paint();
  }, [paint, version]);

  const local = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FRAME_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STRIP_ROWS,
    };
  };

  const draw = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const ctx = frames[at].getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation =
      tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = INK;
    ctx.lineWidth = tool === "eraser" ? 26 : 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    paint();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the paper.
    }
    const p = local(event);
    stroke.current = { id: event.pointerId, ...p };
    draw(p, p);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!s || s.id !== event.pointerId) return;
    const p = local(event);
    draw(s, p);
    stroke.current = { id: s.id, ...p };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (stroke.current?.id !== event.pointerId) return;
    stroke.current = null;
    onChange();
    setVersion((v) => v + 1);
  };

  const go = (step: number) =>
    setIndex((i) => (Math.min(i, pictures - 1) + step + pictures) % pictures);

  const clear = () => {
    const c = frames[at];
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    onChange();
    setVersion((v) => v + 1);
  };

  const trace = () => {
    const c = frames[at];
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(frames[prev], 0, 0);
    onChange();
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-grayscale-2 p-3 dark:bg-grayscale-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          aria-label="Picture before"
          className="w-7 shrink-0 px-0"
          onClick={() => go(-1)}
          title="Picture before (←)"
          type="button"
          variant="secondary"
        >
          <ArrowLeftIcon aria-hidden="true" size={14} weight="bold" />
        </Button>
        <span className="min-w-[7.5rem] text-center text-grayscale-11 text-xs tabular-nums">
          Picture {at + 1} of {pictures}
        </span>
        <Button
          aria-label="Picture after"
          className="w-7 shrink-0 px-0"
          onClick={() => go(1)}
          title="Picture after (→)"
          type="button"
          variant="secondary"
        >
          <ArrowRightIcon aria-hidden="true" size={14} weight="bold" />
        </Button>
        <div className="ml-auto flex gap-1.5">
          <button
            aria-pressed={tool === "pen"}
            className={getButtonClassName({
              variant: "secondary",
              className:
                "w-7 shrink-0 px-0 aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 dark:aria-pressed:bg-grayscale-5",
            })}
            onClick={() => setTool("pen")}
            title="Pen"
            type="button"
          >
            <PenNibIcon aria-hidden="true" size={14} weight="bold" />
            <span className="sr-only">Pen</span>
          </button>
          <button
            aria-pressed={tool === "eraser"}
            className={getButtonClassName({
              variant: "secondary",
              className:
                "w-7 shrink-0 px-0 aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 dark:aria-pressed:bg-grayscale-5",
            })}
            onClick={() => setTool("eraser")}
            title="Eraser"
            type="button"
          >
            <EraserIcon aria-hidden="true" size={14} weight="bold" />
            <span className="sr-only">Eraser</span>
          </button>
          <Button
            aria-label="Trace the picture before"
            className="w-7 shrink-0 px-0"
            onClick={trace}
            title="Start from a copy of the picture before"
            type="button"
            variant="secondary"
          >
            <CopyIcon aria-hidden="true" size={14} weight="bold" />
          </Button>
          <Button
            aria-label="Clear this picture"
            className="w-7 shrink-0 px-0"
            onClick={clear}
            title="Clear this picture"
            type="button"
            variant="secondary"
          >
            <TrashIcon aria-hidden="true" size={14} weight="bold" />
          </Button>
          <Button
            className="whitespace-nowrap text-xs"
            onClick={onDone}
            type="button"
          >
            <CheckIcon aria-hidden="true" size={13} weight="bold" />
            Into the drum
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <canvas
          aria-label={`Picture ${at + 1} of ${pictures}. Draw with the pointer; the picture before shows faintly in blue.`}
          className="aspect-[341/342] max-h-full w-full max-w-full cursor-crosshair touch-none rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.25)] [max-width:min(100%,calc((100dvh-12rem)*341/342))]"
          height={684}
          onLostPointerCapture={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          ref={viewRef}
          width={682}
        />
      </div>
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {Array.from({ length: pictures }, (_, k) => (
          <button
            aria-current={k === at ? "true" : undefined}
            aria-label={`Picture ${k + 1}`}
            className={cn(
              "shrink-0 rounded-[3px] outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-grayscale-7",
              k === at
                ? "ring-2 ring-grayscale-9"
                : "opacity-75 hover:opacity-100",
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: the pictures are positions on the strip.
            key={k}
            onClick={() => setIndex(k)}
            type="button"
          >
            <canvas
              className="block h-9 w-9 rounded-[3px]"
              height={72}
              ref={(el) => {
                thumbs.current[k] = el;
              }}
              width={72}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
