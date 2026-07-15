/**
 * 클라이언트 → API Route 호출 헬퍼.
 * 응답 규격: 성공 { data }, 실패 { error } (+ HTTP status)
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const json = (await res.json().catch(() => null)) as {
    data?: T;
    error?: string;
  } | null;

  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? "요청에 실패했어요.");
  }

  return json?.data as T;
}
