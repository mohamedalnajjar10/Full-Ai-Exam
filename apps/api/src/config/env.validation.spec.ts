import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgresql://localhost:5432/db' };

  it('coerces numeric vars to numbers instead of leaving them as strings', () => {
    // this is the bug that made GET /questions/quota return "quotaLimit": "20"
    const env = validateEnv({
      ...base,
      DAILY_GENERATION_QUOTA: '20',
      EMBEDDING_DIMENSIONS: '768',
      EMAIL_PORT: '465',
      PORT: '3002',
    });

    expect(env.DAILY_GENERATION_QUOTA).toBe(20);
    expect(env.EMBEDDING_DIMENSIONS).toBe(768);
    expect(env.EMAIL_PORT).toBe(465);
    expect(env.PORT).toBe(3002);
  });

  it('applies defaults for empty strings, which are not nullish', () => {
    // `config.get<number>(x) ?? 20` never fired because "" is not nullish
    const env = validateEnv({ ...base, DAILY_GENERATION_QUOTA: '' });
    expect(env.DAILY_GENERATION_QUOTA).toBe(20);
  });

  it('throws in production when a required secret is missing', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET is required/,
    );
  });

  it('throws in staging when a required secret is missing', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(
      /JWT_SECRET is required/,
    );
  });

  it('rejects the default dev secret in production and staging', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'ai-exam-dev-secret',
        ENCRYPTION_KEY: 'k',
      }),
    ).toThrow(/JWT_SECRET cannot use the insecure default dev secret/);

    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'staging',
        JWT_SECRET: 'ai-exam-dev-secret',
        ENCRYPTION_KEY: 'k',
      }),
    ).toThrow(/JWT_SECRET cannot use the insecure default dev secret/);
  });

  it('does not throw in development, so local runs still work', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('reports a non-numeric value rather than silently yielding NaN', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 's',
        REDIS_URL: 'r',
        ENCRYPTION_KEY: 'k',
        DAILY_GENERATION_QUOTA: 'twenty',
      }),
    ).toThrow(/DAILY_GENERATION_QUOTA must be an integer/);
  });

  it('does not require REDIS_URL in production — background jobs are optional', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 's',
        ENCRYPTION_KEY: 'k',
      }),
    ).not.toThrow();
  });
});
