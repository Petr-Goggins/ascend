import type { Profile } from '@/types';

export function isQuestionnaireComplete(profile: Profile | null): boolean {
  return Boolean(profile?.questionnaire_completed_at);
}
