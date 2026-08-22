export type Step = {
  id: string;
  dependency_ids: string[];
  owned_paths: string[];
  step_goal: string;
  implementation: string;
  verification: string;
  done: boolean;
};

export type ApprovalStatus = "pending" | "approved" | "denied" | "error";

export type Plan = {
  schema_version: 1;
  id: string;
  goal: string;
  context: string;
  created_at: string;
  steps: Record<string, Step>;
  approval_status: ApprovalStatus;
  approved: boolean;
  artifact?: string;
  artifact_hash?: string;
};

export type ApprovalRuntime = {
  shell: (
    strings: TemplateStringsArray,
    ...values: string[]
  ) => { json(): Promise<unknown> };
  agents: () => Promise<Array<{ name?: string; id?: string }>>;
  prompt: (input: PromptInput) => Promise<unknown>;
  promptAsync?: (input: PromptInput) => Promise<unknown>;
  sessionID: string;
  directory: string;
  approvalAgent: string;
};

export type PromptInput = {
  path: { id: string };
  body: { agent: string; parts: [{ type: "text"; text: string }] };
  query: { directory: string };
};

export type SubmissionResult = {
  status: ApprovalStatus | "feedback";
  hash: string;
  feedback?: string;
  error?: string;
  approval_preserved?: boolean;
};
