'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// Helper to convert username to a virtual email format for Supabase
const toVirtualEmail = (username: string) => {
  return `${username.trim().toLowerCase()}@tudu.com`;
};

export async function login(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  
  if (!username || !password) {
    return { error: 'Please enter both username and password.' };
  }

  // Sanitize username to alphanumeric and underscores only
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
  if (!sanitizedUsername) {
    return { error: 'Username can only contain letters, numbers, and underscores.' };
  }

  const email = toVirtualEmail(sanitizedUsername);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message === 'Invalid login credentials' ? 'Invalid username or password.' : error.message };
  }

  revalidatePath('/');
  return { success: true };
}

export async function signup(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  
  if (!username || !password) {
    return { error: 'Please enter both username and password.' };
  }

  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
  if (sanitizedUsername.length < 3) {
    return { error: 'Username must be at least 3 characters long and contain only alphanumeric characters/underscores.' };
  }

  const email = toVirtualEmail(sanitizedUsername);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    // If username is already taken, Supabase will return a relevant error
    return { error: error.message };
  }

  await supabase.auth.signOut({ scope: 'local' });

  return { success: 'Account created successfully! You can now Sign In.' };
}
