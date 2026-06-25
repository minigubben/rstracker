export type SessionUser = {
  id: number;
  username: string;
};

export type CharacterSummary = {
  id: number;
  displayName: string;
  status: string;
  syncStatus: string;
  lastSuccessfulSyncAt: string | null;
  nextAutoRefreshAt: string | null;
  lastSyncError: string | null;
  latestOverallLevel: number | null;
  latestOverallXp: number | null;
};

export type CharacterMetric = {
  id: number;
  name: string;
};

export type CharacterDetail = {
  character: {
    id: number;
    displayName: string;
    status: string;
    syncStatus: string;
    lastSuccessfulSyncAt: string | null;
    nextAutoRefreshAt: string | null;
    lastSyncError: string | null;
  };
  latestSnapshot: {
    id: number;
    fetchedAt: string;
  } | null;
  skills: Array<{
    skillId: number;
    skillName: string;
    rank: number;
    level: number;
    xp: number;
  }>;
  activities: Array<{
    activityId: number;
    activityName: string;
    rank: number;
    score: number;
  }>;
  syncRuns: Array<{
    id: number;
    triggerType: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
};

type ApiError = {
  error: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: SessionUser }>("/api/auth/me"),
  login: (payload: { username: string; password: string }) =>
    request<{ user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
    }),
  listCharacters: () => request<{ items: CharacterSummary[] }>("/api/characters"),
  addCharacter: (payload: { name: string }) =>
    request<CharacterDetail>("/api/characters", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeCharacter: (characterId: number) =>
    request<void>(`/api/characters/${characterId}`, {
      method: "DELETE",
    }),
  refreshCharacter: (characterId: number) =>
    request<{ item: CharacterSummary }>(`/api/characters/${characterId}/refresh`, {
      method: "POST",
    }),
  getCharacter: (characterId: number) =>
    request<CharacterDetail>(`/api/characters/${characterId}`),
  getMetrics: (characterId: number) =>
    request<{ skills: CharacterMetric[]; activities: CharacterMetric[] }>(
      `/api/characters/${characterId}/metrics`,
    ),
  getTimeseries: (
    characterId: number,
    params: { kind: "skill" | "activity"; metricId: number; valueField: string },
  ) =>
    request<{
      valueField: string;
      points: Array<Record<string, string | number>>;
    }>(
      `/api/characters/${characterId}/timeseries?kind=${params.kind}&metricId=${params.metricId}&valueField=${params.valueField}`,
    ),
};
