export const usageSource = `import { InviteField } from "@/components/InviteField";

const team = [
  { email: "ava@acme.com", name: "Ava Thompson", role: "admin" },
  { email: "jonah@acme.com", name: "Jonah Park", role: "member" },
] as const;

export function InviteTeammates() {
  return (
    <InviteField.Root
      defaultMembers={[...team]}
      onSend={async (invites) => {
        await fetch("/api/invites", {
          body: JSON.stringify(invites),
          method: "POST",
        });
      }}
      seatLimit={10}
    >
      <InviteField.Label>Email addresses</InviteField.Label>
      <InviteField.Field />
      <InviteField.LimitWarning
        onUpgrade={() => window.location.assign("/settings/billing")}
        planName="Starter"
      />

      <footer className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <InviteField.Stack max={5} />
          <InviteField.Seats />
        </div>
        <InviteField.Submit />
      </footer>
    </InviteField.Root>
  );
}`;
