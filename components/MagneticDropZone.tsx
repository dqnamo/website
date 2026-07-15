"use client";

import {
  CheckCircleIcon,
  FileArrowUpIcon,
  FileIcon,
  FilePdfIcon,
  FileZipIcon,
  ImageSquareIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

const MAGNET_DISTANCE = 180;
const MAX_MAGNET_OFFSET = 10;
const MAGNET_SPRING = { damping: 24, mass: 0.65, stiffness: 280 };

type MagneticDropZoneProps = {
  accept?: string;
  className?: string;
  maxSize?: number;
  multiple?: boolean;
  onFilesChange?: (files: File[]) => void;
};

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) {
    return ImageSquareIcon;
  }

  if (file.type === "application/pdf") {
    return FilePdfIcon;
  }

  if (file.type.includes("zip") || file.name.toLowerCase().endsWith(".zip")) {
    return FileZipIcon;
  }

  return FileIcon;
}

function isFileDrag(dataTransfer: DataTransfer | null) {
  return dataTransfer
    ? Array.from(dataTransfer.types).includes("Files")
    : false;
}

function acceptsFile(file: File, accept: string) {
  if (!accept.trim()) {
    return true;
  }

  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  return accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .some((rule) => {
      if (rule.startsWith(".")) {
        return fileName.endsWith(rule);
      }

      if (rule.endsWith("/*")) {
        return fileType.startsWith(rule.slice(0, -1));
      }

      return fileType === rule;
    });
}

export function MagneticDropZone({
  accept = "image/*,.pdf,.zip",
  className,
  maxSize = 20 * 1024 * 1024,
  multiple = false,
  onFilesChange,
}: MagneticDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isNear, setIsNear] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const magnetX = useMotionValue(0);
  const magnetY = useMotionValue(0);
  const magnetScale = useMotionValue(1);
  const glowX = useMotionValue(0);
  const glowY = useMotionValue(0);
  const springX = useSpring(magnetX, MAGNET_SPRING);
  const springY = useSpring(magnetY, MAGNET_SPRING);
  const springScale = useSpring(magnetScale, MAGNET_SPRING);
  const springGlowX = useSpring(glowX, MAGNET_SPRING);
  const springGlowY = useSpring(glowY, MAGNET_SPRING);
  const transform = useMotionTemplate`translate3d(${springX}px, ${springY}px, 0) scale(${springScale})`;
  const glowTransform = useMotionTemplate`translate3d(${springGlowX}px, ${springGlowY}px, 0)`;

  const resetMagnet = useCallback(() => {
    magnetX.set(0);
    magnetY.set(0);
    magnetScale.set(1);
    glowX.set(0);
    glowY.set(0);
    setIsNear(false);
    setIsOver(false);
  }, [glowX, glowY, magnetScale, magnetX, magnetY]);

  useEffect(() => {
    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }

      const zone = zoneRef.current;

      if (!zone) {
        return;
      }

      const rect = zone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distanceFromEdgeX = Math.max(
        Math.abs(event.clientX - centerX) - rect.width / 2,
        0,
      );
      const distanceFromEdgeY = Math.max(
        Math.abs(event.clientY - centerY) - rect.height / 2,
        0,
      );
      const distance = Math.hypot(distanceFromEdgeX, distanceFromEdgeY);
      const pointerIsOver =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      const proximity = Math.max(0, 1 - distance / MAGNET_DISTANCE);

      if (proximity === 0) {
        resetMagnet();
        return;
      }

      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const pointerDistance = Math.max(Math.hypot(deltaX, deltaY), 1);
      const offset = pointerIsOver ? 0 : proximity * MAX_MAGNET_OFFSET;

      magnetX.set(shouldReduceMotion ? 0 : (deltaX / pointerDistance) * offset);
      magnetY.set(shouldReduceMotion ? 0 : (deltaY / pointerDistance) * offset);
      magnetScale.set(shouldReduceMotion ? 1 : pointerIsOver ? 1.025 : 1.01);
      glowX.set(shouldReduceMotion ? 0 : deltaX);
      glowY.set(shouldReduceMotion ? 0 : deltaY);
      setIsNear(true);
      setIsOver(pointerIsOver);
    }

    function handleDragEnd() {
      resetMagnet();
    }

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDragEnd);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDragEnd);
    };
  }, [
    glowX,
    glowY,
    magnetScale,
    magnetX,
    magnetY,
    resetMagnet,
    shouldReduceMotion,
  ]);

  const acceptFiles = useCallback(
    (incomingFiles: File[]) => {
      const nextFiles = multiple ? incomingFiles : incomingFiles.slice(0, 1);
      const unsupportedFile = nextFiles.find(
        (file) => !acceptsFile(file, accept),
      );
      const oversizedFile = nextFiles.find((file) => file.size > maxSize);

      if (unsupportedFile) {
        setFiles([]);
        setError(`${unsupportedFile.name} is not a supported file type.`);
        onFilesChange?.([]);
        return;
      }

      if (oversizedFile) {
        setFiles([]);
        setError(
          `${oversizedFile.name} is larger than ${formatBytes(maxSize)}.`,
        );
        onFilesChange?.([]);
        return;
      }

      if (nextFiles.length === 0) {
        return;
      }

      setFiles(nextFiles);
      setError(null);
      onFilesChange?.(nextFiles);
    },
    [accept, maxSize, multiple, onFilesChange],
  );

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    acceptFiles(Array.from(event.dataTransfer.files));
    resetMagnet();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function clearFiles() {
    setFiles([]);
    setError(null);
    onFilesChange?.([]);
  }

  const firstFile = files[0];
  const FileTypeIcon = firstFile ? getFileIcon(firstFile) : FileIcon;
  const title = isOver
    ? "Let go to add it"
    : isNear
      ? "Bring it closer"
      : "Drop a file here";

  return (
    <motion.div
      className={cn(
        "relative flex min-h-64 w-full max-w-sm flex-col items-center justify-center overflow-hidden rounded-2xl border px-6 py-8 text-center small-shadow outline-none transition-[border-color,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] dark:shadow-none",
        isOver
          ? "border-blue-8 bg-blue-3/70"
          : isNear
            ? "border-blue-7 bg-blue-2/70"
            : "border-grayscale-4 bg-grayscale-2/70 dark:border-grayscale-5 dark:bg-grayscale-3",
        className,
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      ref={zoneRef}
      style={{
        transform: shouldReduceMotion ? undefined : transform,
      }}
    >
      <input
        accept={accept}
        className="hidden"
        multiple={multiple}
        onChange={handleInputChange}
        ref={inputRef}
        type="file"
      />

      <motion.div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -mt-20 -ml-20 size-40 rounded-full bg-blue-5/30 blur-3xl transition-opacity duration-200",
          isNear ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: glowTransform }}
      />

      {firstFile ? (
        <div className="relative flex w-full flex-col items-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-blue-6 bg-blue-3 text-blue-11 shadow-sm dark:bg-blue-4">
            <FileTypeIcon aria-hidden="true" size={23} weight="fill" />
          </div>
          <div className="mt-4 flex items-center gap-1.5">
            <CheckCircleIcon
              aria-hidden="true"
              className="text-green-9"
              size={15}
              weight="fill"
            />
            <p className="font-medium text-grayscale-12 text-sm">
              {files.length === 1
                ? "Ready to upload"
                : `${files.length} files ready`}
            </p>
          </div>
          <p className="mt-1 max-w-full truncate text-grayscale-11 text-sm">
            {firstFile.name}
            {files.length > 1 ? ` +${files.length - 1}` : ""}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-grayscale-9 uppercase">
            {formatBytes(firstFile.size)}
          </p>

          <div className="mt-5 flex items-center gap-2">
            <button
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] dark:border-grayscale-6 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
              onClick={openFilePicker}
              type="button"
            >
              <UploadSimpleIcon aria-hidden="true" size={14} weight="bold" />
              Replace
            </button>
            <button
              aria-label={`Remove ${firstFile.name}`}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] dark:border-grayscale-6 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
              onClick={clearFiles}
              type="button"
            >
              <XIcon aria-hidden="true" size={14} weight="bold" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          className="relative flex cursor-pointer flex-col items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-2"
          onClick={openFilePicker}
          type="button"
        >
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-xl border border-grayscale-4 bg-grayscale-1 text-grayscale-11 shadow-sm transition-[border-color,background-color] duration-200 dark:border-grayscale-6 dark:bg-grayscale-3",
              isOver && "dark:border-blue-7 dark:bg-blue-4",
            )}
          >
            <FileArrowUpIcon
              aria-hidden="true"
              className={cn(
                "transition-colors duration-200 dark:text-grayscale-12",
                isNear ? "text-blue-11" : "text-grayscale-11",
              )}
              size={23}
              weight="fill"
            />
          </div>
          <p className="mt-4 font-medium text-grayscale-12 text-sm">{title}</p>
          <p className="mt-1 text-grayscale-10 text-xs leading-5">
            or click to browse · up to {formatBytes(maxSize)}
          </p>
        </button>
      )}

      {error ? (
        <p
          aria-live="polite"
          className="relative mt-4 max-w-60 text-red-10 text-xs leading-5"
        >
          {error}
        </p>
      ) : null}
    </motion.div>
  );
}
