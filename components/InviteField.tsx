"use client";

import { Select } from "@base-ui/react/select";
import NumberFlow from "@number-flow/react";
import {
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  PaperPlaneTiltIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useAnimate,
  useReducedMotion,
} from "motion/react";
import {
  type ClipboardEvent,
  type ComponentPropsWithoutRef,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DynamicButton } from "@/components/DynamicButton";
import { getButtonClassName } from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";

export type InviteRole = "admin" | "member" | "viewer";

export type InviteMember = {
  email: string;
  name?: string;
  role: InviteRole;
  /** Invited members hold a seat but haven't accepted yet. */
  status?: "active" | "invited";
};

export type Invite = {
  email: string;
  role: InviteRole;
};

export type InviteFieldStatus = "idle" | "sending" | "landing" | "sent";

export type InviteFieldRootProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "onSubmit"
> & {
  /** Disables every transition when false. */
  animate?: boolean;
  children: ReactNode;
  /** Emails that start as chips in the field. */
  defaultInvites?: readonly (Invite | string)[];
  /** People already in the workspace. */
  defaultMembers?: readonly InviteMember[];
  /** Role given to newly added chips. */
  defaultRole?: InviteRole;
  /** Called with the pending invites. Rejecting keeps the chips in place. */
  onSend?: (invites: Invite[]) => Promise<void> | void;
  /** Total seats on the current plan. */
  seatLimit: number;
};

export type InviteFieldFieldProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  /** Helper text shown under the field when there is no error. */
  hint?: ReactNode;
  placeholder?: string;
};

export type InviteFieldStackProps = ComponentPropsWithoutRef<"ul"> & {
  /** Avatars shown before the rest collapse into a +N bubble. */
  max?: number;
};

export type InviteFieldLimitWarningProps = {
  className?: string;
  onUpgrade?: () => void;
  /** Plan name used in the warning copy. */
  planName?: string;
};

export type InviteFieldSubmitProps = {
  className?: string;
};

type AddEmailsOptions = {
  /** Adds valid emails one by one instead of all at once. */
  cascade?: boolean;
  /** Text to keep in the input after the emails are processed. */
  remainder?: string;
};

type InviteFieldContextValue = {
  addEmails: (input: string, options?: AddEmailsOptions) => void;
  announce: (message: string) => void;
  /** Members that arrived from the field and should not pop in. */
  arrivals: ReadonlySet<string>;
  canSend: boolean;
  draft: string;
  error: string | null;
  fieldId: string;
  flashEmail: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  invites: Invite[];
  isCascading: boolean;
  members: InviteMember[];
  overBy: number;
  removeInvite: (email: string) => void;
  seatLimit: number;
  seatsUsed: number;
  selectedEmail: string | null;
  send: () => Promise<void>;
  setDraft: (draft: string) => void;
  setInviteRole: (email: string, role: InviteRole) => void;
  setSelectedEmail: (email: string | null) => void;
  shakeCount: number;
  shouldMove: boolean;
  status: InviteFieldStatus;
};

const InviteFieldContext = createContext<InviteFieldContextValue | null>(null);

const easeOut = [0.23, 1, 0.32, 1] as const;
const morphTransition = {
  bounce: 0.16,
  duration: 0.6,
  type: "spring" as const,
};
const chipTransition = { bounce: 0.2, duration: 0.42, type: "spring" as const };
const heightTransition = { bounce: 0, duration: 0.32, type: "spring" as const };
const CASCADE_STEP_MS = 90;
const COLLAPSE_MS = 320;
const LANDING_STEP_MS = 110;
const SENT_HOLD_MS = 1800;

const emailPattern = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
const separatorPattern = /[\s,;]+/;

export const inviteRoles: readonly {
  description: string;
  label: string;
  value: InviteRole;
}[] = [
  {
    description: "Manage members and billing",
    label: "Admin",
    value: "admin",
  },
  {
    description: "Create and edit projects",
    label: "Member",
    value: "member",
  },
  { description: "View and comment only", label: "Viewer", value: "viewer" },
];

const roleLabels = Object.fromEntries(
  inviteRoles.map((role) => [role.value, role.label]),
) as Record<InviteRole, string>;

const avatarPalettes = [
  "bg-blue-4 text-blue-11",
  "bg-jade-4 text-jade-11",
  "bg-orange-4 text-orange-11",
  "bg-crimson-4 text-crimson-11",
  "bg-violet-4 text-violet-11",
  "bg-cyan-4 text-cyan-11",
  "bg-amber-4 text-amber-11",
] as const;

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  // Emails share domains, so mix the tail before bucketing into colors.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

export function getAvatarPalette(email: string) {
  return avatarPalettes[hashString(email) % avatarPalettes.length];
}

export function getInitials(email: string, name?: string) {
  const source = name?.trim() || email.split("@")[0] || email;
  const parts = source.split(/[\s._+-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/** Pulls addresses out of pasted text, including `Name <email>` entries. */
export function parseEmails(input: string) {
  return input
    .replace(/[^<>,;\n]*<([^<>]+)>/g, " $1 ")
    .split(separatorPattern)
    .map((token) => token.trim().replace(/^mailto:/i, ""))
    .filter(Boolean);
}

export function isValidEmail(email: string) {
  return emailPattern.test(email);
}

function toInvite(invite: Invite | string, defaultRole: InviteRole): Invite {
  return typeof invite === "string"
    ? { email: invite.toLowerCase(), role: defaultRole }
    : { ...invite, email: invite.email.toLowerCase() };
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function useInviteFieldContext(component: string) {
  const context = useContext(InviteFieldContext);

  if (!context) {
    throw new Error(`${component} must be used inside InviteField.Root.`);
  }

  return context;
}

/** Access the field state from custom controls inside `InviteField.Root`. */
export function useInviteField() {
  return useInviteFieldContext("useInviteField");
}

function InviteFieldRoot({
  animate = true,
  children,
  className,
  defaultInvites = [],
  defaultMembers = [],
  defaultRole = "member",
  onSend,
  seatLimit,
  ...props
}: InviteFieldRootProps) {
  const shouldReduceMotion = useReducedMotion();
  const shouldMove = animate && !shouldReduceMotion;
  const fieldId = useId();
  const layoutGroupId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<number[]>([]);
  const arrivalsRef = useRef(new Set<string>());
  const [invites, setInvites] = useState<Invite[]>(() =>
    defaultInvites.map((invite) => toInvite(invite, defaultRole)),
  );
  const [members, setMembers] = useState<InviteMember[]>(() => [
    ...defaultMembers,
  ]);
  const [draft, setDraftState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [flashEmail, setFlashEmail] = useState<string | null>(null);
  const [shakeCount, setShakeCount] = useState(0);
  const [cascadeCount, setCascadeCount] = useState(0);
  const [status, setStatus] = useState<InviteFieldStatus>("idle");
  const [announcement, setAnnouncement] = useState("");
  const seatsUsed = members.length + invites.length;
  const overBy = Math.max(seatsUsed - seatLimit, 0);
  const isCascading = cascadeCount > 0;
  const canSend =
    invites.length > 0 && overBy === 0 && !isCascading && status === "idle";

  // Refs mirror state so batched callbacks can dedupe against the latest list.
  const invitesRef = useRef(invites);
  const membersRef = useRef(members);
  invitesRef.current = invites;
  membersRef.current = members;

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((id) => id !== timer);
      callback();
    }, delay);

    timersRef.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const setDraft = useCallback((nextDraft: string) => {
    setDraftState(nextDraft);
    setError(null);
    setSelectedEmail(null);
  }, []);

  const addEmails = useCallback(
    (
      input: string,
      { cascade = false, remainder = "" }: AddEmailsOptions = {},
    ) => {
      const tokens = parseEmails(input);
      const queued = new Set(invitesRef.current.map((invite) => invite.email));
      const existing = new Set(
        membersRef.current.map((member) => member.email.toLowerCase()),
      );
      const accepted: Invite[] = [];
      const rejected: string[] = [];
      let duplicateInvite: string | null = null;
      let duplicateMember: string | null = null;

      for (const token of tokens) {
        const email = token.toLowerCase();

        if (!isValidEmail(email)) {
          rejected.push(token);
        } else if (existing.has(email)) {
          duplicateMember = email;
        } else if (queued.has(email)) {
          duplicateInvite = email;
        } else {
          queued.add(email);
          accepted.push({ email, role: defaultRole });
        }
      }

      const nextDraft = [...rejected, remainder.trim()]
        .filter(Boolean)
        .join(", ");

      setDraftState(rejected.length > 0 ? nextDraft : remainder);
      setSelectedEmail(null);

      if (rejected.length > 0) {
        setShakeCount((count) => count + 1);
        setError(
          rejected.length === 1
            ? `“${rejected[0]}” isn't a valid email address.`
            : `${plural(rejected.length, "address")} need a second look.`,
        );
      } else if (duplicateMember) {
        setError(`${duplicateMember} is already in this workspace.`);
      } else {
        setError(null);
      }

      if (duplicateInvite) {
        const email = duplicateInvite;
        setFlashEmail(email);
        schedule(
          () =>
            setFlashEmail((current) => (current === email ? null : current)),
          700,
        );
      }

      if (accepted.length === 0) {
        if (rejected.length > 0) {
          announce(
            `${plural(rejected.length, "invalid address")} left in the field.`,
          );
        }
        return;
      }

      if (status === "sent") {
        setStatus("idle");
      }

      const summary = `Added ${plural(accepted.length, "invite")}.${
        rejected.length > 0
          ? ` ${plural(rejected.length, "invalid address")} left in the field.`
          : ""
      }`;

      if (!cascade || !shouldMove || accepted.length === 1) {
        setInvites((current) => [...current, ...accepted]);
        announce(summary);
        return;
      }

      setCascadeCount((count) => count + 1);
      accepted.forEach((invite, index) => {
        schedule(() => {
          setInvites((current) =>
            current.some((item) => item.email === invite.email)
              ? current
              : [...current, invite],
          );

          if (index === accepted.length - 1) {
            setCascadeCount((count) => count - 1);
            announce(summary);
          }
        }, index * CASCADE_STEP_MS);
      });
    },
    [announce, defaultRole, schedule, shouldMove, status],
  );

  const removeInvite = useCallback(
    (email: string) => {
      setInvites((current) =>
        current.filter((invite) => invite.email !== email),
      );
      setSelectedEmail(null);
      announce(`Removed ${email}.`);
    },
    [announce],
  );

  const setInviteRole = useCallback((email: string, role: InviteRole) => {
    setInvites((current) =>
      current.map((invite) =>
        invite.email === email ? { ...invite, role } : invite,
      ),
    );
  }, []);

  const send = useCallback(async () => {
    if (!canSend) {
      return;
    }

    const batch = invitesRef.current;
    const startedAt = performance.now();
    setStatus("sending");
    setSelectedEmail(null);
    setError(null);

    try {
      await onSend?.(batch);
    } catch {
      setStatus("idle");
      setError("Couldn't send invites. Try again.");
      return;
    }

    const land = (invite: Invite) => {
      arrivalsRef.current.add(invite.email);
      setInvites((current) =>
        current.filter((item) => item.email !== invite.email),
      );
      setMembers((current) => [
        { email: invite.email, role: invite.role, status: "invited" },
        ...current,
      ]);
    };
    const finish = () => {
      setStatus("sent");
      announce(`Sent ${plural(batch.length, "invite")}.`);
      schedule(
        () => setStatus((current) => (current === "sent" ? "idle" : current)),
        SENT_HOLD_MS,
      );
    };

    if (!shouldMove) {
      for (const invite of batch) {
        land(invite);
      }
      finish();
      return;
    }

    // Let the chips finish folding into avatars before the first one flies.
    const settle = Math.max(COLLAPSE_MS - (performance.now() - startedAt), 0);

    setStatus("landing");
    batch.forEach((invite, index) => {
      schedule(() => land(invite), settle + index * LANDING_STEP_MS);
    });
    schedule(finish, settle + (batch.length - 1) * LANDING_STEP_MS + 450);
  }, [announce, canSend, onSend, schedule, shouldMove]);

  const context: InviteFieldContextValue = {
    addEmails,
    announce,
    arrivals: arrivalsRef.current,
    canSend,
    draft,
    error,
    fieldId,
    flashEmail,
    inputRef,
    invites,
    isCascading,
    members,
    overBy,
    removeInvite,
    seatLimit,
    seatsUsed,
    selectedEmail,
    send,
    setDraft,
    setInviteRole,
    setSelectedEmail,
    shakeCount,
    shouldMove,
    status,
  };

  return (
    <InviteFieldContext.Provider value={context}>
      <MotionConfig reducedMotion={animate ? "user" : "always"}>
        <LayoutGroup id={layoutGroupId}>
          <div className={cn("relative", className)} {...props}>
            {children}
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </div>
        </LayoutGroup>
      </MotionConfig>
    </InviteFieldContext.Provider>
  );
}

function InviteFieldLabel({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  const { fieldId } = useInviteFieldContext("InviteField.Label");

  return (
    <label
      className={cn("font-medium text-grayscale-12 text-xs", className)}
      htmlFor={fieldId}
      {...props}
    >
      {children}
    </label>
  );
}

function InviteAvatar({
  className,
  email,
  name,
}: {
  className?: string;
  email: string;
  name?: string;
}) {
  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-semibold tracking-[-0.02em]",
        getAvatarPalette(email),
        className,
      )}
      layout
      layoutCrossfade={false}
      layoutId={`invite-avatar-${email}`}
      style={{ borderRadius: 9999 }}
      transition={{ layout: morphTransition }}
    >
      {getInitials(email, name)}
    </motion.span>
  );
}

function RoleSelect({ email, role }: Invite) {
  const { setInviteRole, status } = useInviteFieldContext("InviteField.Field");

  return (
    <Select.Root
      disabled={status !== "idle"}
      items={roleLabels}
      onValueChange={(value) => {
        if (value) {
          setInviteRole(email, value as InviteRole);
        }
      }}
      value={role}
    >
      <Select.Trigger
        aria-label={`Role for ${email}`}
        className="flex h-5 cursor-pointer items-center gap-0.5 rounded-full px-1.5 font-medium text-[11px] text-grayscale-10 outline-none transition-colors duration-150 hover:bg-grayscale-4 hover:text-grayscale-12 focus-visible:ring-2 focus-visible:ring-blue-8 data-[popup-open]:bg-grayscale-4 data-[popup-open]:text-grayscale-12 dark:hover:bg-grayscale-6 dark:data-[popup-open]:bg-grayscale-6"
      >
        <Select.Value />
        <Select.Icon className="flex">
          <CaretDownIcon aria-hidden="true" size={10} weight="bold" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="start"
          alignItemWithTrigger={false}
          className="z-50 outline-none"
          sideOffset={6}
        >
          <Select.Popup className="w-56 origin-[var(--transform-origin)] rounded-xl border border-grayscale-4 bg-grayscale-1 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.14)] outline-none transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] data-[ending-style]:scale-[0.97] data-[starting-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)]">
            <Select.List>
              {inviteRoles.map((option) => (
                <Select.Item
                  className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 rounded-lg px-2.5 py-1.5 outline-none transition-colors duration-100 data-[highlighted]:bg-grayscale-3 dark:data-[highlighted]:bg-grayscale-5"
                  key={option.value}
                  value={option.value}
                >
                  <span className="flex flex-col">
                    <Select.ItemText className="font-medium text-grayscale-12 text-xs">
                      {option.label}
                    </Select.ItemText>
                    <span className="text-[11px] text-grayscale-10 leading-4">
                      {option.description}
                    </span>
                  </span>
                  <Select.ItemIndicator className="text-grayscale-12">
                    <CheckIcon aria-hidden="true" size={13} weight="bold" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

const chipExitVariants = {
  // Sent chips hand their avatar to the stack, so they leave instantly.
  exit: (landed: boolean) =>
    landed
      ? { opacity: 0, transition: { duration: 0 } }
      : {
          filter: "blur(2px)",
          opacity: 0,
          scale: 0.9,
          transition: { duration: 0.16, ease: easeOut },
        },
};

function InviteChip({
  invite,
  isFlashing,
  isSelected,
  ref,
}: {
  invite: Invite;
  isFlashing: boolean;
  isSelected: boolean;
  ref?: Ref<HTMLLIElement>;
}) {
  const { inputRef, removeInvite, status } =
    useInviteFieldContext("InviteField.Field");
  // While sending, each chip folds down to just its avatar.
  const isCollapsed = status === "sending" || status === "landing";

  return (
    <motion.li
      animate={{
        filter: "blur(0px)",
        opacity: 1,
        scale: isFlashing ? 1.06 : 1,
      }}
      className={cn(
        "relative flex h-7 max-w-full items-center",
        isCollapsed
          ? "bg-transparent"
          : isSelected
            ? "gap-1 bg-blue-4 pr-0.5 pl-1 transition-[background-color,box-shadow] duration-150 shadow-[inset_0_0_0_1px_var(--color-blue-8)] dark:bg-blue-5"
            : "gap-1 bg-grayscale-3 pr-0.5 pl-1 transition-[background-color,box-shadow] duration-150 shadow-[inset_0_0_0_1px_var(--color-grayscale-5)] dark:bg-grayscale-5 dark:shadow-[inset_0_0_0_1px_var(--color-grayscale-6)]",
      )}
      data-selected={isSelected ? "" : undefined}
      exit="exit"
      initial={{ filter: "blur(4px)", opacity: 0, scale: 0.85 }}
      layout
      ref={ref}
      style={{ borderRadius: 9999 }}
      transition={{
        default: chipTransition,
        filter: { duration: 0.2, ease: easeOut },
        layout: chipTransition,
        opacity: { duration: 0.18, ease: easeOut },
      }}
      variants={chipExitVariants}
    >
      <InviteAvatar
        className={cn(
          "text-[9px] ring-grayscale-1 dark:ring-grayscale-2",
          isCollapsed ? "size-7 ring-2" : "size-5",
        )}
        email={invite.email}
      />
      {isCollapsed ? (
        <span className="sr-only">{invite.email}</span>
      ) : (
        <>
          <motion.span
            className="min-w-0 truncate pl-0.5 text-grayscale-12 text-xs"
            layout="position"
          >
            {invite.email}
          </motion.span>
          <motion.span className="flex items-center" layout="position">
            <RoleSelect email={invite.email} role={invite.role} />
            <button
              aria-label={`Remove ${invite.email}`}
              className="flex size-5 cursor-pointer items-center justify-center rounded-full text-grayscale-9 outline-none transition-colors duration-150 hover:bg-grayscale-4 hover:text-grayscale-12 focus-visible:ring-2 focus-visible:ring-blue-8 dark:hover:bg-grayscale-6"
              onClick={() => {
                removeInvite(invite.email);
                inputRef.current?.focus();
              }}
              type="button"
            >
              <XIcon aria-hidden="true" size={11} weight="bold" />
            </button>
          </motion.span>
        </>
      )}
    </motion.li>
  );
}

function InviteFieldField({
  className,
  hint = "Press Enter or comma to add. Paste a list to add several.",
  placeholder,
  ...props
}: InviteFieldFieldProps) {
  const {
    addEmails,
    draft,
    error,
    fieldId,
    flashEmail,
    inputRef,
    invites,
    removeInvite,
    selectedEmail,
    send,
    setDraft,
    setSelectedEmail,
    shakeCount,
    shouldMove,
    status,
  } = useInviteFieldContext("InviteField.Field");
  const [scope, animateScope] = useAnimate<HTMLDivElement>();
  const listRef = useRef<HTMLUListElement>(null);
  const [listHeight, setListHeight] = useState<number | null>(null);
  const messageId = `${fieldId}-message`;
  const isBusy = status === "sending" || status === "landing";
  const lastInvite = invites.at(-1);

  // Animate the field's height so wrapping rows never jolt the layout below.
  useLayoutEffect(() => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    const observer = new ResizeObserver(() => setListHeight(list.offsetHeight));
    observer.observe(list);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (shakeCount === 0 || !shouldMove || !scope.current) {
      return;
    }

    animateScope(
      scope.current,
      { x: [0, -5, 5, -3, 3, -1, 0] },
      { duration: 0.38, ease: "easeOut" },
    );
  }, [animateScope, scope, shakeCount, shouldMove]);

  function moveSelection(direction: -1 | 1) {
    const index = invites.findIndex((invite) => invite.email === selectedEmail);
    const nextIndex = index === -1 ? invites.length - 1 : index + direction;
    const next = invites[nextIndex];

    setSelectedEmail(next ? next.email : null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const caretAtStart =
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === 0;

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
      return;
    }

    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();

      if (draft.trim()) {
        addEmails(draft);
      }
      return;
    }

    if (event.key === "Tab" && !event.shiftKey && draft.trim()) {
      const tokens = parseEmails(draft);

      // Only hold focus when every token becomes a chip.
      if (tokens.every(isValidEmail)) {
        event.preventDefault();
      }

      addEmails(draft);
      return;
    }

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selectedEmail
    ) {
      event.preventDefault();
      removeInvite(selectedEmail);
      return;
    }

    if (event.key === "Backspace" && caretAtStart && lastInvite) {
      event.preventDefault();
      setSelectedEmail(lastInvite.email);
      return;
    }

    if (event.key === "ArrowLeft" && caretAtStart && invites.length > 0) {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.key === "ArrowRight" && selectedEmail) {
      event.preventDefault();
      moveSelection(1);
      return;
    }

    if (event.key === "Escape" && selectedEmail) {
      event.preventDefault();
      setSelectedEmail(null);
    }
  }

  function handleChange(value: string) {
    // Typed or autofilled separators commit everything before them.
    if (/[,;\n]/.test(value)) {
      const parts = value.split(/[,;\n]/);
      const remainder = parts.pop() ?? "";
      addEmails(parts.join(","), { remainder });
      return;
    }

    setDraft(value);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");

    if (!/[\s,;]/.test(text.trim())) {
      return;
    }

    event.preventDefault();
    addEmails(draft ? `${draft} ${text}` : text, { cascade: true });
  }

  function handleBlur() {
    const tokens = parseEmails(draft);

    setSelectedEmail(null);

    if (tokens.length > 0 && tokens.every(isValidEmail)) {
      addEmails(draft);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Pointer-only convenience; the input stays reachable by keyboard and label. */}
      <div
        className={cn(
          "relative flex min-h-11 cursor-text rounded-xl border bg-grayscale-1 p-1.5 transition-[border-color,box-shadow,background-color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] dark:bg-grayscale-2",
          error
            ? "border-red-7 shadow-[0_0_0_3px_var(--color-red-3)] dark:border-red-7 dark:shadow-[0_0_0_3px_var(--color-red-4)]"
            : "border-grayscale-5 focus-within:border-grayscale-8 focus-within:shadow-[0_0_0_3px_var(--color-grayscale-3)] dark:border-grayscale-6 dark:focus-within:border-grayscale-8 dark:focus-within:shadow-[0_0_0_3px_var(--color-grayscale-4)]",
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
        ref={scope}
      >
        <motion.div
          animate={{ height: listHeight ?? "auto" }}
          className="-m-1 min-w-0 flex-1 overflow-hidden"
          initial={false}
          transition={heightTransition}
        >
          <ul
            aria-label="Pending invites"
            className="relative flex min-w-0 flex-wrap items-center gap-1 p-1"
            ref={listRef}
          >
            <AnimatePresence custom={isBusy} initial={false} mode="popLayout">
              {invites.map((invite) => (
                <InviteChip
                  invite={invite}
                  isFlashing={flashEmail === invite.email}
                  isSelected={selectedEmail === invite.email}
                  key={invite.email}
                />
              ))}
            </AnimatePresence>
            <motion.li
              className="flex h-7 min-w-40 flex-1 items-center"
              layout="position"
              transition={{ layout: chipTransition }}
            >
              <input
                aria-describedby={messageId}
                aria-invalid={error ? true : undefined}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                className={cn(
                  "h-7 w-full min-w-0 bg-transparent px-1.5 text-sm outline-none placeholder:text-grayscale-9",
                  error ? "text-red-11" : "text-grayscale-12",
                  selectedEmail && "caret-transparent",
                )}
                enterKeyHint="done"
                id={fieldId}
                inputMode="email"
                onBlur={handleBlur}
                onChange={(event) => handleChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  isBusy
                    ? undefined
                    : (placeholder ??
                      (invites.length > 0 ? "Add more…" : "name@company.com"))
                }
                readOnly={isBusy}
                ref={inputRef}
                spellCheck={false}
                type="text"
                value={draft}
              />
            </motion.li>
          </ul>
        </motion.div>
      </div>

      <div className="min-h-5 px-0.5" id={messageId}>
        <AnimatePresence initial={false} mode="wait">
          {error ? (
            <motion.p
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              className="flex items-center gap-1 text-red-11 text-xs leading-5"
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              initial={{ opacity: 0, transform: "translateY(-3px)" }}
              key={error}
              transition={{ duration: 0.18, ease: easeOut }}
            >
              <WarningCircleIcon aria-hidden="true" size={13} weight="fill" />
              {error}
            </motion.p>
          ) : hint ? (
            <motion.p
              animate={{ opacity: 1 }}
              className="text-grayscale-10 text-xs leading-5"
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              initial={{ opacity: 0 }}
              key="hint"
              transition={{ duration: 0.18, ease: easeOut }}
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function InviteFieldStack({
  className,
  max = 5,
  ...props
}: InviteFieldStackProps) {
  const { arrivals, members } = useInviteFieldContext("InviteField.Stack");
  const [isSpread, setIsSpread] = useState(false);
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  const overlap = isSpread ? -2 : -6;

  return (
    <ul
      aria-label={`${plural(members.length, "workspace member")}`}
      className={cn("relative flex items-center", className)}
      onPointerEnter={() => setIsSpread(true)}
      onPointerLeave={() => setIsSpread(false)}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((member, index) => (
          <motion.li
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex size-8 shrink-0"
            exit={{ opacity: 0, scale: 0.6 }}
            // Sent invites fly in from the field, so skip the pop-in.
            initial={
              arrivals.has(member.email) ? false : { opacity: 0, scale: 0.6 }
            }
            key={member.email}
            layout
            style={{
              borderRadius: 9999,
              marginLeft: index === 0 ? 0 : overlap,
              zIndex: visible.length - index,
            }}
            title={`${member.name ?? member.email} · ${roleLabels[member.role]}${
              member.status === "invited" ? " · Invited" : ""
            }`}
            transition={{
              default: chipTransition,
              layout: morphTransition,
              opacity: { duration: 0.18, ease: easeOut },
            }}
          >
            <InviteAvatar
              className="size-8 text-[10px] ring-2 ring-grayscale-1 dark:ring-grayscale-3"
              email={member.email}
              name={member.name}
            />
            {member.status === "invited" ? (
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-grayscale-1 bg-amber-9 dark:border-grayscale-3"
                initial={{ opacity: 0, scale: 0 }}
                layout
                transition={{ delay: 0.35, ...chipTransition }}
              />
            ) : null}
            <span className="sr-only">
              {member.name ?? member.email}, {roleLabels[member.role]}
              {member.status === "invited" ? ", invited" : ""}
            </span>
          </motion.li>
        ))}
        {overflow > 0 ? (
          <motion.li
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex size-8 shrink-0 items-center justify-center bg-grayscale-3 font-medium text-[11px] text-grayscale-11 tabular-nums ring-2 ring-grayscale-1 dark:bg-grayscale-5 dark:ring-grayscale-3"
            exit={{ opacity: 0, scale: 0.6 }}
            initial={{ opacity: 0, scale: 0.6 }}
            key="overflow"
            layout
            style={{ borderRadius: 9999, marginLeft: overlap, zIndex: 0 }}
            transition={{ default: chipTransition, layout: morphTransition }}
          >
            <span aria-hidden="true">
              <NumberFlow prefix="+" value={overflow} />
            </span>
            <span className="sr-only">and {overflow} more</span>
          </motion.li>
        ) : null}
      </AnimatePresence>
    </ul>
  );
}

function InviteFieldSeats({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const { overBy, seatLimit, seatsUsed } =
    useInviteFieldContext("InviteField.Seats");
  const fill = Math.min(seatsUsed / Math.max(seatLimit, 1), 1);
  const isOver = overBy > 0;

  return (
    <div
      className={cn("flex items-center gap-2 text-xs", className)}
      {...props}
    >
      <div
        aria-hidden="true"
        className="relative h-1 w-12 overflow-hidden rounded-full bg-grayscale-4 dark:bg-grayscale-5"
      >
        <motion.div
          animate={{ scaleX: fill }}
          className={cn(
            "absolute inset-0 origin-left rounded-full transition-colors duration-200",
            isOver ? "bg-amber-9" : "bg-grayscale-11",
          )}
          initial={false}
          transition={chipTransition}
        />
      </div>
      <p
        className={cn(
          "flex items-baseline font-medium tabular-nums transition-colors duration-200",
          isOver ? "text-amber-11" : "text-grayscale-11",
        )}
      >
        <span aria-hidden="true" className="flex items-baseline">
          <NumberFlow value={seatsUsed} />
          <span className="px-1 text-grayscale-9">/</span>
          <NumberFlow value={seatLimit} />
          <span className="ml-1 text-grayscale-10">seats</span>
        </span>
        <span className="sr-only">
          {seatsUsed} of {seatLimit} seats used
        </span>
      </p>
    </div>
  );
}

function InviteFieldLimitWarning({
  className,
  onUpgrade,
  planName = "current",
}: InviteFieldLimitWarningProps) {
  const { overBy, seatLimit } = useInviteFieldContext(
    "InviteField.LimitWarning",
  );

  return (
    <AnimatePresence initial={false}>
      {overBy > 0 ? (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className={cn("overflow-hidden", className)}
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          key="limit-warning"
          transition={{
            height: { bounce: 0, duration: 0.32, type: "spring" },
            opacity: { duration: 0.2, ease: easeOut },
          }}
        >
          <motion.div
            animate={{ transform: "translateY(0px)" }}
            className="flex items-center gap-3 rounded-xl border border-amber-6 bg-amber-2 py-2 pr-2 pl-3 dark:border-amber-6 dark:bg-amber-3"
            exit={{ transform: "translateY(-6px)" }}
            initial={{ transform: "translateY(-6px)" }}
            role="status"
            transition={{ duration: 0.28, ease: easeOut }}
          >
            <WarningCircleIcon
              aria-hidden="true"
              className="shrink-0 text-amber-10"
              size={16}
              weight="fill"
            />
            <p className="min-w-0 flex-1 text-amber-12 text-xs leading-5">
              <span className="font-medium">
                <NumberFlow value={overBy} /> {overBy === 1 ? "seat" : "seats"}{" "}
                over your limit.
              </span>{" "}
              <span className="text-amber-11">
                The {planName} plan includes {seatLimit}.
              </span>
            </p>
            {onUpgrade ? (
              <button
                className={getButtonClassName({
                  className:
                    "h-7 shrink-0 px-2.5 text-xs outline-none transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-amber-8 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-2 active:scale-[0.97] motion-reduce:transform-none dark:focus-visible:ring-offset-amber-3",
                })}
                onClick={onUpgrade}
                type="button"
              >
                Upgrade
              </button>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function InviteFieldSubmit({ className }: InviteFieldSubmitProps) {
  const { canSend, invites, send, status } =
    useInviteFieldContext("InviteField.Submit");
  const label = useMemo(() => {
    if (status === "sending" || status === "landing") {
      return "Sending";
    }

    if (status === "sent") {
      return "Invites sent";
    }

    return invites.length > 1
      ? `Send ${invites.length} invites`
      : "Send invite";
  }, [invites.length, status]);
  const icon =
    status === "sending" || status === "landing" ? (
      <CircleNotchIcon
        aria-hidden="true"
        className="animate-spin motion-reduce:animate-none"
        size={15}
        weight="bold"
      />
    ) : status === "sent" ? (
      <CheckCircleIcon
        aria-hidden="true"
        className="text-green-9"
        size={15}
        weight="fill"
      />
    ) : (
      <PaperPlaneTiltIcon aria-hidden="true" size={15} weight="fill" />
    );

  return (
    <DynamicButton
      aria-busy={status === "sending" || status === "landing"}
      aria-disabled={!canSend}
      className={cn(
        "h-8 px-3 aria-disabled:cursor-not-allowed",
        !canSend && status === "idle" && "opacity-50",
        className,
      )}
      icon={icon}
      onClick={() => void send()}
      stateKey={status === "idle" ? "send" : status}
    >
      {label}
    </DynamicButton>
  );
}

export const InviteField = {
  Field: InviteFieldField,
  Label: InviteFieldLabel,
  LimitWarning: InviteFieldLimitWarning,
  Root: InviteFieldRoot,
  Seats: InviteFieldSeats,
  Stack: InviteFieldStack,
  Submit: InviteFieldSubmit,
};
