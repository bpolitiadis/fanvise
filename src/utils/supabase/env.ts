const requireEnv = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`[Supabase] Missing required environment variable: ${key}`);
  }

  return value;
};

export const getSupabaseUrl = (): string =>
  requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");

export const isValidJWT = (token: string): boolean => {
  if (!token || typeof token !== 'string') return false;
  // Allow strict JWTs (3 parts) OR Supabase publishable keys (start with sb_ or pk_)
  return token.split('.').length === 3 || token.startsWith('sb_') || token.startsWith('pk_');
};

export const getSupabasePublishableKey = (): string => {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    requireEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!isValidJWT(key)) {
    console.warn(`[Supabase] The provided Publishable/Anon Key does not appear to be a valid key. It should be a JWT (3 parts) or a Publishable Key (starts with sb_ or pk_). Got: ${key.substring(0, 5)}...`);
  }

  return key;
};
