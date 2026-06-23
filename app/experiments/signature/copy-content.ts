export const usageSource = `import { Signature } from "@/components/Signature";

export function SignatureExample() {
  return (
    <div className="w-56 text-grayscale-12">
      <Signature duration={2} strokeWidth={10} />
    </div>
  );
}

export function CustomPathExample() {
  return (
    <div className="w-64 text-blue-10">
      <Signature
        path="M10 80 C 40 10, 65 10, 95 80"
        viewBox="0 0 100 100"
        duration={1.8}
        strokeWidth={4}
      />
    </div>
  );
}
`;
