"use client";

import {
  ArrowClockwiseIcon,
  ClipboardTextIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  InviteField,
  type InviteMember,
  useInviteField,
} from "@/components/InviteField";

const workspaceMembers: InviteMember[] = [
  { email: "ava@northwind.dev", name: "Ava Thompson", role: "admin" },
  { email: "leila@northwind.dev", name: "Leila Haddad", role: "member" },
  { email: "jonah@northwind.dev", name: "Jonah Park", role: "member" },
  { email: "marco@northwind.dev", name: "Marco Rossi", role: "member" },
  { email: "priya@northwind.dev", name: "Priya Nair", role: "viewer" },
  { email: "sam@northwind.dev", name: "Sam Okafor", role: "member" },
];

const sampleList = `Sofia Alvarez <sofia.alvarez@northwind.dev>, liam@northwind.dev
noah.kim@northwind.dev; ellis@northwind hana.mori@northwind.dev`;

const plans = {
  pro: { name: "Pro", seats: 25 },
  starter: { name: "Starter", seats: 10 },
} as const;

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

export function InviteFieldShowcase() {
  const [cycle, setCycle] = useState(0);

  return (
    <div className="relative flex min-h-[36rem] w-full items-center justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-4 py-20 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:px-8">
      <button
        aria-label="Reset invite dialog"
        className="absolute top-2 right-2 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-grayscale-3 bg-white px-2 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-4 hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
        onClick={() => setCycle((current) => current + 1)}
        type="button"
      >
        <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
        Reset
      </button>

      <InviteDialog key={cycle} />
    </div>
  );
}

function InviteDialog() {
  const [plan, setPlan] = useState<keyof typeof plans>("starter");

  return (
    <InviteField.Root
      aria-labelledby="invite-dialog-title"
      className="w-full max-w-[36rem] rounded-2xl border border-grayscale-4 bg-grayscale-1 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_16px_-8px_rgba(0,0,0,0.1),0_16px_32px_-16px_rgba(0,0,0,0.08)] dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-[0_1px_2px_rgba(0,0,0,0.18),0_12px_28px_-12px_rgba(0,0,0,0.36)]"
      defaultInvites={["maya.chen@northwind.dev"]}
      defaultMembers={workspaceMembers}
      onSend={() => wait(700)}
      role="dialog"
      seatLimit={plans[plan].seats}
    >
      <div className="flex items-start gap-3 p-4 pb-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-grayscale-12 font-semibold text-grayscale-1 text-sm dark:bg-grayscale-12">
          N
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="font-medium text-grayscale-12 text-sm"
            id="invite-dialog-title"
          >
            Invite to Northwind
          </h2>
          <p className="mt-0.5 text-pretty text-grayscale-10 text-xs leading-5">
            Teammates get access to every project in this workspace.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <InviteField.Label>Email addresses</InviteField.Label>
          <PasteSampleButton />
        </div>
        <InviteField.Field />
        <InviteField.LimitWarning
          onUpgrade={() => setPlan("pro")}
          planName={plans[plan].name}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-grayscale-3 border-t px-4 py-3 dark:border-grayscale-5">
        <div className="flex min-w-0 items-center gap-3">
          <InviteField.Stack />
          <InviteField.Seats className="max-[400px]:hidden" />
        </div>
        <InviteField.Submit />
      </div>
    </InviteField.Root>
  );
}

function PasteSampleButton() {
  const { addEmails, inputRef, status } = useInviteField();

  return (
    <button
      className="-my-1 flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 font-medium text-grayscale-10 text-xs transition-colors duration-150 hover:bg-grayscale-3 hover:text-grayscale-12 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-grayscale-5"
      disabled={status !== "idle" && status !== "sent"}
      onClick={() => {
        addEmails(sampleList, { cascade: true });
        inputRef.current?.focus();
      }}
      type="button"
    >
      <ClipboardTextIcon aria-hidden="true" size={13} weight="bold" />
      Paste a sample list
    </button>
  );
}
