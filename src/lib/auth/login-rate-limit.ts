interface LoginAttemptBucket {
  count: number
  resetAt: number
}

const loginAttempts = new Map<string, LoginAttemptBucket>()

export function checkLoginRateLimit(
  key: string,
  maxAttempts = 8,
  nowMs = Date.now()
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const existing = loginAttempts.get(key)
  if (!existing || existing.resetAt <= nowMs) {
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 }
  }

  if (existing.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - existing.count),
    retryAfterSeconds: 0,
  }
}

export function recordFailedLoginAttempt(
  key: string,
  windowMs = 15 * 60_000,
  nowMs = Date.now()
): number {
  const existing = loginAttempts.get(key)
  if (!existing || existing.resetAt <= nowMs) {
    loginAttempts.set(key, { count: 1, resetAt: nowMs + windowMs })
    return 1
  }
  existing.count += 1
  return existing.count
}

export function clearLoginAttempts(key: string) {
  loginAttempts.delete(key)
}
