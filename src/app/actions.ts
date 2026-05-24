'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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

export async function getTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('tasks')
    .select('*, categories(name, color)')
    .order('completed', { ascending: true })
    .order('createdAt', { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    title: row.title,
    completed: row.completed === true || row.completed === 1,
    createdAt: row.createdAt,
    categoryId: row.categoryId,
    categoryName: row.categories?.name,
    categoryColor: row.categories?.color,
    dueDate: row.dueDate
  }));
}

export async function addTask(title: string, categoryId: number | null, dueDate: string | null = null) {
  if (!title || title.trim() === '') return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('tasks').insert({
    title: title.trim(),
    categoryId: categoryId,
    dueDate: dueDate,
    user_id: user.id
  });
  revalidatePath('/');
}

export async function toggleTask(id: number, completed: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('tasks').update({ completed }).eq('id', id);
  revalidatePath('/');
}

export async function deleteTask(id: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('tasks').delete().eq('id', id);
  revalidatePath('/');
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch categories
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('isCustom', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data) return [];

  // Seed default categories if none exist
  if (data.length === 0) {
    const defaultCategories = [
      { name: 'Inbox', color: '#94a3b8', isCustom: false, user_id: user.id },
      { name: 'Work', color: '#a78bfa', isCustom: false, user_id: user.id },
      { name: 'Personal', color: '#34d399', isCustom: false, user_id: user.id },
      { name: 'Shopping', color: '#fbbf24', isCustom: false, user_id: user.id },
    ];
    
    await supabase.from('categories').insert(defaultCategories);
    
    // Refetch
    const { data: refetched } = await supabase
      .from('categories')
      .select('*')
      .order('isCustom', { ascending: true })
      .order('name', { ascending: true });
      
    return (refetched || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      isCustom: row.isCustom === true || row.isCustom === 1
    }));
  }

  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isCustom: row.isCustom === true || row.isCustom === 1
  }));
}

export async function addCategory(name: string, color: string) {
  if (!name || name.trim() === '' || !color) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('categories').insert({
    name: name.trim(),
    color,
    user_id: user.id,
    isCustom: true
  });
  revalidatePath('/');
}

export async function deleteCategory(id: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('categories').delete().eq('id', id).eq('isCustom', true);
  revalidatePath('/');
}

export async function updateTaskTitle(id: number, title: string) {
  if (!title || title.trim() === '') return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('tasks').update({ title: title.trim() }).eq('id', id);
  revalidatePath('/');
}

export async function updateTaskDueDate(id: number, dueDate: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('tasks').update({ dueDate }).eq('id', id);
  revalidatePath('/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/');
  redirect('/login');
}
