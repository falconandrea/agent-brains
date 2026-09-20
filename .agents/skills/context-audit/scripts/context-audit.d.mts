export interface ContextAuditFile {
  path: string;
  role: "agents-root" | "agents-scoped" | "context" | "features" | "memory" | "adr";
  lines: number;
  bytes: number;
}

export interface ContextAuditReport {
  root: string;
  adrDir: string | null;
  files: ContextAuditFile[];
  lessons: { present: boolean; entries: number | null };
  progress: { present: boolean; completedMarkers: number | null };
  markdownLinks: {
    checked: number;
    unresolved: { from: string; target: string; resolved: string }[];
  };
  missingOptional: {
    agentsRoot: boolean;
    aiContext: boolean;
    aiFeatures: boolean;
    lessons: boolean;
    progress: boolean;
    adr: boolean;
  };
}

export function auditProject(
  root: string,
  options?: { adrDir?: string },
): ContextAuditReport;
