'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Task = {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
  categoryId: number | null;
  categoryName?: string;
  categoryColor?: string;
  dueDate: string | null;
};

export type Category = {
  id: number;
  name: string;
  color: string;
  isCustom: boolean;
};

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type CategoryRow = {
  id: number;
  name: string;
  color: string;
  isCustom: boolean | number;
};

type TaskRow = {
  id: number;
  title: string;
  completed: boolean | number;
  createdAt: string;
  categoryId: number | null;
  dueDate: string | null;
  categories?: Pick<CategoryRow, 'name' | 'color'> | null;
};

function formatDatabaseError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === '42P01') {
    return 'Supabase tables are missing. Open the Supabase SQL Editor and run supabase_schema.sql.';
  }

  if (error.code === 'PGRST204') {
    return 'Supabase columns do not match the app. Re-run the updated supabase_schema.sql in the SQL Editor.';
  }

  return error.message || fallback;
}

async function getCurrentUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return { user: null, error: error.message };
  if (!user) return { user: null, error: 'Please sign in again.' };
  return { user, error: null };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed === true || row.completed === 1,
    createdAt: row.createdAt,
    categoryId: row.categoryId,
    categoryName: row.categories?.name,
    categoryColor: row.categories?.color,
    dueDate: row.dueDate
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isCustom: row.isCustom === true || row.isCustom === 1
  };
}

async function validateCategoryAccess(supabase: SupabaseClient, categoryId: number | null) {
  if (categoryId === null) return null;

  const { error } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .single();

  return error ? formatDatabaseError(error, 'Selected tag is not available.') : null;
}

export async function getTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { user } = await getCurrentUser(supabase);
  if (!user) return [];

  const { data, error } = await supabase
    .from('tasks')
    .select('*, categories(name, color)')
    .order('completed', { ascending: true })
    .order('createdAt', { ascending: false });

  if (error || !data) {
    console.error('Failed to fetch tasks:', error);
    return [];
  }

  return data.map(mapTask);
}

export async function addTask(title: string, categoryId: number | null, dueDate: string | null = null): Promise<ActionResult<Task>> {
  if (!title || title.trim() === '') return { ok: false, error: 'Task title is required.' };
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };
  const categoryError = await validateCategoryAccess(supabase, categoryId);
  if (categoryError) return { ok: false, error: categoryError };

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: title.trim(),
      categoryId: categoryId,
      dueDate: dueDate,
      user_id: user.id
    })
    .select('*, categories(name, color)')
    .single();

  if (error || !data) {
    return { ok: false, error: formatDatabaseError(error || {}, 'Failed to add task.') };
  }

  revalidatePath('/');
  return { ok: true, data: mapTask(data) };
}

export async function toggleTask(id: number, completed: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };

  const { error } = await supabase.from('tasks').update({ completed }).eq('id', id);
  if (error) return { ok: false, error: formatDatabaseError(error, 'Failed to update task.') };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function deleteTask(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };

  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { ok: false, error: formatDatabaseError(error, 'Failed to delete task.') };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { user } = await getCurrentUser(supabase);
  if (!user) return [];

  // Fetch categories
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('isCustom', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data) {
    console.error('Failed to fetch categories:', error);
    return [];
  }

  // Seed default categories if none exist
  if (data.length === 0) {
    const defaultCategories = [
      { name: 'Inbox', color: '#94a3b8', isCustom: false, user_id: user.id },
      { name: 'Work', color: '#a78bfa', isCustom: false, user_id: user.id },
      { name: 'Personal', color: '#34d399', isCustom: false, user_id: user.id },
      { name: 'Shopping', color: '#fbbf24', isCustom: false, user_id: user.id },
    ];
    
    const { error: insertError } = await supabase.from('categories').insert(defaultCategories);
    if (insertError) {
      console.error('Failed to seed categories:', insertError);
      return [];
    }
    
    // Refetch
    const { data: refetched } = await supabase
      .from('categories')
      .select('*')
      .order('isCustom', { ascending: true })
      .order('name', { ascending: true });
      
    return (refetched || []).map(mapCategory);
  }

  return data.map(mapCategory);
}

export async function addCategory(name: string, color: string): Promise<ActionResult<Category>> {
  if (!name || name.trim() === '' || !color) return { ok: false, error: 'Category name and color are required.' };
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: name.trim(),
      color,
      user_id: user.id,
      isCustom: true
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: formatDatabaseError(error || {}, 'Failed to add category.') };
  }

  revalidatePath('/');
  return { ok: true, data: mapCategory(data) };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };

  const { error } = await supabase.from('categories').delete().eq('id', id).eq('isCustom', true);
  if (error) return { ok: false, error: formatDatabaseError(error, 'Failed to delete category.') };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function updateTaskTitle(id: number, title: string): Promise<ActionResult> {
  if (!title || title.trim() === '') return { ok: false, error: 'Task title is required.' };
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };

  const { error } = await supabase.from('tasks').update({ title: title.trim() }).eq('id', id);
  if (error) return { ok: false, error: formatDatabaseError(error, 'Failed to update task.') };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function updateTaskDueDate(id: number, dueDate: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };

  const { error } = await supabase.from('tasks').update({ dueDate }).eq('id', id);
  if (error) return { ok: false, error: formatDatabaseError(error, 'Failed to update task.') };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function updateTaskCategory(id: number, categoryId: number | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: authError || 'Please sign in again.' };
  const categoryError = await validateCategoryAccess(supabase, categoryId);
  if (categoryError) return { ok: false, error: categoryError };

  const { error } = await supabase.from('tasks').update({ categoryId }).eq('id', id);
  if (error) return { ok: false, error: formatDatabaseError(error, 'Failed to update task tag.') };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/');
  redirect('/login');
}
