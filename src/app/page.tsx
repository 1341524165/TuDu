import { getTasks, getCategories } from '@/app/actions';
import type { Task, Category } from '@/app/actions';
import TodoList from '@/components/TodoList';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let tasks: Task[] = [];
  let categories: Category[] = [];
  let initialLoadError: string | null = null;

  const [taskResult, categoryResult] = await Promise.allSettled([getTasks(), getCategories()]);
  if (taskResult.status === 'fulfilled') {
    tasks = taskResult.value;
  } else {
    console.error('Failed to load initial tasks:', taskResult.reason);
    initialLoadError = 'Failed to load tasks. Please refresh and try again.';
  }
  if (categoryResult.status === 'fulfilled') {
    categories = categoryResult.value;
  } else {
    console.error('Failed to load initial categories:', categoryResult.reason);
    initialLoadError = initialLoadError || 'Failed to load categories. Please refresh and try again.';
  }

  return (
    <main className="app-container">
      <TodoList initialTasks={tasks} initialCategories={categories} initialLoadError={initialLoadError} />
    </main>
  );
}

