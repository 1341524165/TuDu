import { getTasks, getCategories } from '@/app/actions';
import TodoList from '@/components/TodoList';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [tasks, categories] = await Promise.all([getTasks(), getCategories()]);

  return (
    <main className="app-container">
      <TodoList initialTasks={tasks} initialCategories={categories} />
    </main>
  );
}


