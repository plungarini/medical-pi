import type {
  User,
  Session,
  Message,
  MedicalProfile,
  ProfileHistoryEntry,
  MedicalDocument,
} from "./types";

// API client configuration
const API_BASE = "/api/server";

// Token storage
let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("auth-token", token);
    // Also set as cookie for server-side auth check
    document.cookie = `auth-token=${token}; path=/; max-age=2592000; SameSite=Lax`; // 30 days
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    // Try localStorage first
    const fromStorage = localStorage.getItem("auth-token");
    if (fromStorage) return fromStorage;
    
    // Fallback to cookie
    const match = document.cookie.match(/auth-token=([^;]+)/);
    return match ? match[1] : null;
  }
  return null;
}

export function clearAuthToken() {
  authToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth-token");
    // Clear the cookie
    document.cookie = "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

// Generic API request helper
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  // Only set Content-Type if there's a body and it's not already set
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  // Return null for 204 No Content
  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: (username: string): Promise<{ token: string; user: User }> =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),

  me: (): Promise<{ user: User }> => apiRequest("/auth/me"),
};

// Sessions API
export const sessionsApi = {
  list: (page = 1, limit = 20): Promise<Session[]> =>
    apiRequest(`/sessions?page=${page}&limit=${limit}`),

  create: (): Promise<Session> =>
    apiRequest("/sessions", { method: "POST" }),

  get: (id: string): Promise<Session & { messages: Message[] }> =>
    apiRequest(`/sessions/${id}`),

  update: (
    id: string,
    data: { title?: string; pinned?: boolean }
  ): Promise<Session> =>
    apiRequest(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string): Promise<void> =>
    apiRequest(`/sessions/${id}`, { method: "DELETE" }),
};

// Profile API
export const profileApi = {
  get: (): Promise<MedicalProfile> => apiRequest("/profile"),

  update: (data: Partial<MedicalProfile>): Promise<MedicalProfile> =>
    apiRequest("/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  getHistory: (): Promise<ProfileHistoryEntry[]> =>
    apiRequest("/profile/history"),

  deleteEntry: (field: string, id: string): Promise<void> =>
    apiRequest(`/profile/entry/${field}/${id}`, { method: "DELETE" }),

  updateEntry: (field: string, id: string, data: any): Promise<void> =>
    apiRequest(`/profile/entry/${field}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Documents API
export const documentsApi = {
  list: (): Promise<MedicalDocument[]> => apiRequest("/documents"),

  upload: (file: File): Promise<MedicalDocument> => {
    const formData = new FormData();
    formData.append("file", file);

    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return fetch(`${API_BASE}/documents`, {
      method: "POST",
      headers,
      body: formData,
    }).then((response) => {
      if (!response.ok) {
        return response.json().then((error) => {
          throw new Error(error.message || `Upload failed: ${response.status}`);
        });
      }
      return response.json();
    });
  },

  get: (id: string): Promise<MedicalDocument> =>
    apiRequest(`/documents/${id}`),

  delete: (id: string): Promise<void> =>
    apiRequest(`/documents/${id}`, { method: "DELETE" }),
};

// Search API
export const searchApi = {
  search: (params: {
    q: string;
    sessionId?: string;
    after?: string;
    before?: string;
    limit?: number;
  }): Promise<{ hits: unknown[]; query: string }> => {
    const queryParams = new URLSearchParams();
    queryParams.append("q", params.q);
    if (params.sessionId) queryParams.append("sessionId", params.sessionId);
    if (params.after) queryParams.append("after", params.after);
    if (params.before) queryParams.append("before", params.before);
    if (params.limit) queryParams.append("limit", String(params.limit));

    return apiRequest(`/search?${queryParams.toString()}`);
  },
};
