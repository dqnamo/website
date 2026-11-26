export const SIGNATURE_PATH_PLACEHOLDER = "__SIGNATURE_PATH__";

export const SIGNATURE_FALLBACK_PATH =
  "M60 200 Q180 60 300 180 T540 180 Q660 260 780 140 T940 180";

export const usageSource = `import { Signature } from "@/components/Signature";

export function MySignature() {
  return (
    <div className="w-64 text-grayscale-12">
      <Signature
        path="${SIGNATURE_PATH_PLACEHOLDER}"
        viewBox="0 0 1000 320"
        duration={1.4}
        strokeWidth={7}
      />
    </div>
  );
}
`;
