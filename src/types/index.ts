// --- Auth ---
export interface User {
  id: string; // UUID
  username: string;
  createdAt: string; // ISO
}

// --- Sessions ---
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
  type: 'image' | 'document' | 'audio';
  name: string;
  mimeType: string;
  url: string; // relative path under BASE_STORAGE_PATH
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
  role: 'user' | 'assistant' | 'tool';
  content: string;
  attachments: Attachment[];
  toolCalls: ToolCall[];
  thinkingContent: string;
  createdAt: string;
}

// --- Medical Profile ---
export type ProfileSource = 'auto' | 'manual';

export interface Condition {
  id: string;
  name: string;
  diagnosedAt?: string;
  resolvedAt?: string;
  severity?: string;
  notes?: string;
  source: ProfileSource;
  confidence?: number; // auto entries only, 0–1
}

export interface Medication {
  id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  startedAt?: string;
  notes?: string;
  source: ProfileSource;
}

export interface Allergy {
  id: string;
  substance: string;
  reaction?: string;
  severity?: string;
  source: ProfileSource;
}

export interface VitalReading {
  id: string;
  type: string; // e.g. "blood_pressure", "heart_rate"
  value: string; // e.g. "120/80", "72 bpm"
  recordedAt: string;
  source: ProfileSource;
}

export interface LabResult {
  id: string;
  name: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  recordedAt: string;
  source: ProfileSource;
}

export interface Surgery {
  id: string;
  name: string;
  date?: string;
  notes?: string;
  source: ProfileSource;
}

export interface FamilyCondition {
  id: string;
  relation: string;
  condition: string;
  notes?: string;
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
  };
  freeNotes?: string;
}

// --- Profile Breathing ---
export interface ProfilePatch {
  field: keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>;
  operation: 'add' | 'update' | 'remove';
  value: unknown;
  confidence: number; // 0–1
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

// --- Documents ---
export interface MedicalDocument {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  path: string;
  extractedContent?: string;
  uploadedAt: string;
}

// --- SSE Events ---
export type SSEEvent =
  | { event: 'thinking'; data: { token: string } }
  | { event: 'tool_call'; data: { id: string; name: string; args: unknown } }
  | { event: 'tool_result'; data: { id: string; name: string; result: unknown } }
  | { event: 'content'; data: { token: string } }
  | { event: 'profile_updated'; data: { fields: string[]; flagged: boolean } }
  | { event: 'done'; data: { messageId: string; sessionId: string } }
  | { event: 'error'; data: { message: string } };

// --- Tool Definitions ---
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// --- API Types ---
export interface LoginRequest {
  username: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ChatRequest {
  message: string;
}

export interface SearchResult {
  hits: unknown[];
  query: string;
}
