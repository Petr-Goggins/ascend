type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

export function isMissingSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (['42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) return true;
  return /column .* does not exist|could not find .* column|schema cache|relation .* does not exist/i.test(error.message ?? '');
}
