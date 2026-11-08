/** Throws a Supabase error with what was being done, so a failed read is never an empty answer. */
export const check = (what: string, error: { message: string } | null): void => {
  if (error) throw new Error(`${what}: ${error.message}`);
};
