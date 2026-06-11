import { apiGet, apiPut } from './client';
import type { PromptRecord } from '@micah/types';
import { fetchPromptsFromPmi, isPmiBacked, savePromptsToPmi } from './pmi_backend';

export async function fetchPrompts(): Promise<Record<string, PromptRecord>> {
  if (isPmiBacked()) return fetchPromptsFromPmi();
  return apiGet<Record<string, PromptRecord>>('/api/admin/prompts');
}

export async function savePrompts(prompts: Record<string, PromptRecord>): Promise<{ status: string }> {
  if (isPmiBacked()) return savePromptsToPmi(prompts);
  return apiPut<{ status: string }, Record<string, PromptRecord>>('/api/admin/prompts', prompts);
}
