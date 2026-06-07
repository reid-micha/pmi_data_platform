import { apiGet, apiPut } from './client';
import type { PromptRecord } from '@micah/types';

export async function fetchPrompts(): Promise<Record<string, PromptRecord>> {
  return apiGet<Record<string, PromptRecord>>('/api/admin/prompts');
}

export async function savePrompts(prompts: Record<string, PromptRecord>): Promise<{ status: string }> {
  return apiPut<{ status: string }, Record<string, PromptRecord>>('/api/admin/prompts', prompts);
}
