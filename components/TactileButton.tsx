import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "@/helpers/classname-helper";

export type TactileButtonDepth = "shallow" | "medium" | "deep";
export type TactileButtonSize = "sm" | "md" | "lg";
export type TactileButtonTone = "light" | "dark";

type TactileButtonSharedProps = {
  children: ReactNode;
  className?: string;
  /** Controls the visible height of the button edge. */
  depth?: TactileButtonDepth;
  size?: TactileButtonSize;
  tone?: TactileButtonTone;
};

type TactileButtonElementProps = TactileButtonSharedProps &
  Omit<
    ComponentPropsWithoutRef<"button">,
    keyof TactileButtonSharedProps | "href"
  > & {
    href?: never;
  };

type TactileButtonAnchorProps = TactileButtonSharedProps &
  Omit<
    ComponentPropsWithoutRef<"a">,
    keyof TactileButtonSharedProps | "href"
  > & {
    href: string;
  };

export type TactileButtonProps =
  | TactileButtonElementProps
  | TactileButtonAnchorProps;

export const tactileButtonColorTokens = {
  "--tactile-face": "#4a4a46",
  "--tactile-face-highlight": "#64645e",
  "--tactile-content": "#eeeeec",
  "--tactile-base": "#292926",
  "--tactile-base-shadow": "#141412",
} as CSSProperties;

const lightColorTokens = {
  "--tactile-face": "var(--color-grayscale-4)",
  "--tactile-face-highlight": "var(--color-grayscale-1)",
  "--tactile-content": "var(--color-grayscale-12)",
  "--tactile-base": "var(--color-grayscale-6)",
  "--tactile-base-shadow": "var(--color-grayscale-9)",
} as CSSProperties;

const toneStyles: Record<TactileButtonTone, CSSProperties> = {
  dark: tactileButtonColorTokens,
  light: lightColorTokens,
};

const depthClassNames: Record<TactileButtonDepth, string> = {
  shallow: "[--tactile-depth:3px]",
  medium: "[--tactile-depth:6px]",
  deep: "[--tactile-depth:8px]",
};

const sizeClassNames: Record<TactileButtonSize, string> = {
  sm: "[--tactile-radius:0.75rem]",
  md: "[--tactile-radius:0.75rem]",
  lg: "[--tactile-radius:0.875rem]",
};

const faceSizeClassNames: Record<TactileButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2.5 px-5 text-base",
};

function getRootClassName({
  className,
  depth,
  size,
}: {
  className?: string;
  depth: TactileButtonDepth;
  size: TactileButtonSize;
}) {
  return cn(
    "group/tactile relative inline-grid w-max shrink-0 cursor-pointer select-none border-0 bg-transparent p-0 pb-[var(--tactile-depth)] font-inherit leading-none focus-visible:rounded-[var(--tactile-radius)] focus-visible:outline-2 focus-visible:outline-grayscale-9 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    depthClassNames[depth],
    sizeClassNames[size],
    className,
  );
}

function TactileButtonLayers({
  children,
  size,
}: {
  children: ReactNode;
  size: TactileButtonSize;
}) {
  return (
    <>
      <span className="absolute inset-x-0 top-[var(--tactile-depth)] bottom-0 rounded-[var(--tactile-radius)] bg-[var(--tactile-base)] shadow-[inset_0_-1px_0_var(--tactile-base-shadow)]" />
      <span
        className={cn(
          "relative flex items-center justify-center rounded-[var(--tactile-radius)] bg-[var(--tactile-face)] font-medium text-[var(--tactile-content)] shadow-[inset_0_1px_0_var(--tactile-face-highlight)] transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)_and_(pointer:fine)]:group-hover/tactile:translate-y-0.5 group-active/tactile:translate-y-[var(--tactile-depth)] motion-reduce:transform-none motion-reduce:transition-none",
          faceSizeClassNames[size],
        )}
      >
        {children}
      </span>
    </>
  );
}

export function TactileButton(props: TactileButtonProps) {
  const {
    children,
    className,
    depth = "medium",
    size = "md",
    tone = "dark",
  } = props;
  const resolvedClassName = getRootClassName({ className, depth, size });

  if ("href" in props && props.href !== undefined) {
    const {
      children: _children,
      className: _className,
      depth: _depth,
      size: _size,
      style,
      tone: _tone,
      ...anchorProps
    } = props;

    return (
      <a
        className={resolvedClassName}
        style={{ ...toneStyles[tone], ...style }}
        {...anchorProps}
      >
        <TactileButtonLayers size={size}>{children}</TactileButtonLayers>
      </a>
    );
  }

  const {
    children: _children,
    className: _className,
    depth: _depth,
    size: _size,
    style,
    tone: _tone,
    type = "button",
    ...buttonProps
  } = props;

  return (
    <button
      className={resolvedClassName}
      style={{ ...toneStyles[tone], ...style }}
      type={type}
      {...buttonProps}
    >
      <TactileButtonLayers size={size}>{children}</TactileButtonLayers>
    </button>
  );
}
