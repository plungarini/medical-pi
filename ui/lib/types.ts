// Auth types
export interface User {
  id: string; // UUID
  username: string;
  createdAt: string; // ISO
}

// Session types
export interface Session {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinned: boolean;
}

export interface Attachment {
  type: "image" | "document" | "audio";
  name: string;
  mimeType: string;
  url: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  attachments: Attachment[];
  toolCalls: ToolCall[];
  thinkingContent: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

// Medical Profile types
export type ProfileSource = "auto" | "manual";

export interface Condition {
  id: string;
  condition: string;
  name?: string; // Legacy support
  diagnosedAt?: string;
  resolvedAt?: string;
  severity?: string;
  notes?: string;
  recordedAt?: string;
  source: ProfileSource;
  confidence?: number;
}

export interface Medication {
  id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  startedAt?: string;
  notes?: string;
  recordedAt?: string;
  source: ProfileSource;
}

export interface Allergy {
  id: string;
  substance: string;
  reaction?: string;
  severity?: string;
  notes?: string;
  recordedAt?: string;
  source: ProfileSource;
}

export interface VitalReading {
  id: string;
  type: string;
  value: string;
  recordedAt: string;
  notes?: string;
  source: ProfileSource;
}

export interface LabResult {
  id: string;
  name: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  recordedAt: string;
  notes?: string;
  source: ProfileSource;
}

export interface Surgery {
  id: string;
  name: string;
  date?: string;
  notes?: string;
  recordedAt?: string;
  source: ProfileSource;
}

export interface FamilyCondition {
  id: string;
  relation: string;
  condition: string;
  notes?: string;
  recordedAt?: string;
  source: ProfileSource;
}

export interface MedicalProfile {
  userId: string;
  updatedAt: string;
  demographics: {
    dateOfBirth?: string;
    sex?: string;
    height?: string;
    weight?: string;
    bloodType?: string;
  };
  currentConditions: Condition[];
  persistentConditions: Condition[];
  pastConditions: Condition[];
  medications: Medication[];
  allergies: Allergy[];
  vitals: VitalReading[];
  labResults: LabResult[];
  surgeries: Surgery[];
  familyHistory: FamilyCondition[];
  lifestyle: {
    smoking?: string;
    alcohol?: string;
    exercise?: string;
    diet?: string;
    sleep?: string;
    notes?: string;
  };
  freeNotes?: string;
}

export interface ProfilePatch {
  field: keyof Omit<MedicalProfile, "userId" | "updatedAt">;
  operation: "add" | "update" | "remove";
  value: unknown;
  confidence: number;
}

export interface ProfileDiff {
  hasNewInfo: boolean;
  patches: ProfilePatch[];
}

export interface ProfileHistoryEntry {
  id: string;
  userId: string;
  diff: ProfileDiff;
  createdAt: string;
}

// Document types
export interface MedicalDocument {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  path: string;
  extractedContent?: string;
  uploadedAt: string;
}

// SSE Event types
export type SSEEvent =
  | { event: "thinking"; data: { token: string } }
  | { event: "tool_call"; data: { id: string; name: string; args: unknown } }
  | { event: "tool_result"; data: { id: string; name: string; result: unknown } }
  | { event: "content"; data: { token: string } }
  | { event: "profile_updated"; data: { fields: string[]; flagged: boolean } }
  | { event: "done"; data: { messageId: string; sessionId: string } }
  | { event: "error"; data: { message: string } };
