import type { AuthResponse, User } from '@micah/types';
import { apiGet, apiPost } from './client';

export async function signup(email: string, password: string, displayName: string): Promise<AuthResponse> {
  return apiPost<AuthResponse>('/signup', { email, password, display_name: displayName });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiPost<AuthResponse>('/login', { email, password });
}

export async function getMe(current_user: string): Promise<User> {
  return apiGet<User>('/me', { current_user });
}
