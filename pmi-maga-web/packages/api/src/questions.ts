import type { AnchorQuestion } from '@micah/types';
import { apiGet } from './client';

const MIN_PEER_COUNT = 3;

export async function fetchAnchorQuestions(): Promise<AnchorQuestion[]> {
  const questions = await apiGet<AnchorQuestion[]>('/api/index/hourly/question');
  return questions.filter((q) => (q.peerCount ?? 0) >= MIN_PEER_COUNT);
}

export async function fetchAnchorQuestion(peerGroupId: number): Promise<AnchorQuestion> {
  return apiGet<AnchorQuestion>(`/api/index/hourly/question/${peerGroupId}`);
}
