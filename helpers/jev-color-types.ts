export type JevColorCandidate = {
  confidence: number;
  details: string[];
  hex: string;
  label: string;
};

export type JevColorComparison = {
  candidates: {
    components: JevColorCandidate;
    directOklab: JevColorCandidate;
    directRgb: JevColorCandidate;
    judge: JevColorCandidate;
    semantic: JevColorCandidate;
  };
  colorIntent: number;
  description: string;
  elapsedMs: number;
  transparency: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};
