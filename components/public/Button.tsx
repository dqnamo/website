import { cn } from "@/helpers/classname-helper";

type ButtonSharedProps = {
  variant?: "primary" | "secondary";
  className?: string;
  children: React.ReactNode;
};

type ButtonProps =
  | (ButtonSharedProps & React.ComponentPropsWithoutRef<"button">)
  | (ButtonSharedProps &
      React.ComponentPropsWithoutRef<"a"> & {
        href: string;
      });

// Every shadow stack has the same four layers (top edge, bottom edge, contact
// shadow, lift shadow) so pressing interpolates instead of snapping. Secondary
// leaves its bottom edge transparent because its border already draws one, and
// keeps its shadows tight so it sits on the page rather than hovering. The
// sheen sits behind the label thanks to the isolated stacking context.
export const buttonSurfaceClassNames = {
  primary: [
    "relative isolate border-black/25 dark:border-white/10",
    "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-linear-to-b before:from-white/12 before:to-transparent dark:before:from-white/6",
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.18),inset_0_-1px_0_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.14),0_2px_4px_-2px_rgb(0_0_0/0.18)]",
    "active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.28),inset_0_-1px_0_rgb(0_0_0/0),0_0_1px_rgb(0_0_0/0.16),0_1px_2px_-1px_rgb(0_0_0/0.12)]",
    "dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_-1px_0_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.4),0_2px_4px_-2px_rgb(0_0_0/0.45)]",
    "dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4),inset_0_-1px_0_rgb(0_0_0/0),0_0_1px_rgb(0_0_0/0.4),0_1px_2px_-1px_rgb(0_0_0/0.3)]",
  ].join(" "),
  secondary: [
    "relative isolate",
    "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-linear-to-b before:from-transparent before:to-black/2 dark:before:from-white/4 dark:before:to-transparent",
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.9),inset_0_-1px_0_rgb(0_0_0/0),0_1px_0_rgb(0_0_0/0.04),0_1px_2px_-1px_rgb(0_0_0/0.1)]",
    "active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.08),inset_0_-1px_0_rgb(0_0_0/0),0_0_0_rgb(0_0_0/0),0_0_0_rgb(0_0_0/0)]",
    "dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_-1px_0_rgb(0_0_0/0),0_1px_0_rgb(0_0_0/0.2),0_1px_2px_-1px_rgb(0_0_0/0.3)]",
    "dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35),inset_0_-1px_0_rgb(0_0_0/0),0_0_0_rgb(0_0_0/0),0_0_0_rgb(0_0_0/0)]",
  ].join(" "),
} as const;

export function getButtonClassName({
  className,
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const baseClasses =
    "cursor-pointer flex flex-row px-2 gap-1.5 h-7 items-center justify-center text-sm font-medium rounded-lg transition-[color,background-color,border-color,box-shadow] border text-grayscale-11";

  const variantClasses = {
    primary:
      "bg-grayscale-12 dark:bg-grayscale-5 dark:hover:bg-grayscale-6 hover:bg-grayscale-12/90 rounded-lg text-grayscale-2 dark:text-grayscale-11",
    secondary:
      "bg-white hover:bg-grayscale-2 hover:border-grayscale-5 dark:hover:bg-grayscale-4 dark:hover:border-grayscale-5 dark:bg-grayscale-3 border-grayscale-4 dark:border-grayscale-4 rounded-lg",
  };

  return cn(
    baseClasses,
    buttonSurfaceClassNames[variant],
    variantClasses[variant],
    className,
  );
}

export default function Button(props: ButtonProps) {
  const { variant = "primary", className } = props;
  const classes = getButtonClassName({ className, variant });

  if ("href" in props) {
    const {
      variant: _variant,
      className: _className,
      children,
      ...anchorProps
    } = props;

    return (
      <a className={classes} {...anchorProps}>
        {children}
      </a>
    );
  }

  const {
    variant: _variant,
    className: _className,
    children,
    ...buttonProps
  } = props;

  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
