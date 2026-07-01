'use client';

import { useState, useRef } from 'react';
import { Task, Category, getTasks, addTask, toggleTask, failTask, updateFailureReason, deleteTask, addCategory, deleteCategory, updateTaskDetails, logout } from '@/app/actions';
import CalendarView from '@/components/CalendarView';
import type { CalendarSavedState } from '@/components/CalendarView';
import DateTaskList from '@/components/DateTaskList';

const isTempId = (id: number) => !Number.isSafeInteger(id);

const premiumColors = [
  '#a78bfa', // Violet
  '#60a5fa', // Blue
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f87171', // Rose
  '#22d3ee', // Cyan
];

const getDefaultCategoryId = (categories: Category[]) => {
  const inbox = categories.find(c => c.name === 'Inbox');
  return inbox ? inbox.id : categories[0]?.id ?? null;
};

export default function TodoList({
  initialTasks,
  initialCategories,
  initialLoadError = null,
}: {
  initialTasks: Task[];
  initialCategories: Category[];
  initialLoadError?: string | null;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [actionError, setActionError] = useState<string | null>(initialLoadError);

  // Tab state
  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar'>('tasks');
  // Date mode: when opening a date from Calendar in the Tasks tab
  const [dateMode, setDateMode] = useState<string | null>(null);
  // Calendar saved state for context preservation
  const calendarSavedState = useRef<CalendarSavedState | null>(null);

  const refreshTasks = async () => {
    if (calendarSavedState.current) {
      calendarSavedState.current = {
        ...calendarSavedState.current,
        searchResults: null,
        searchResultsVisible: true,
        searchPage: 1,
        highlightEventKey: null,
        searchResultsScrollPos: 0,
      };
    }

    try {
      const latestTasks = await getTasks();
      setTasks(latestTasks);
    } catch (err) {
      console.error('Failed to refresh tasks:', err);
      throw err;
    }
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    const activeTheme = document.documentElement.getAttribute('data-theme');
    return activeTheme === 'dark' ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const [newTaskCategoryId, setNewTaskCategoryId] = useState<number | null>(() => getDefaultCategoryId(initialCategories));
  const [selectedFilterCategoryId, setSelectedFilterCategoryId] = useState<number | null>(null);
  const [isManageDrawerOpen, setIsManageDrawerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(premiumColors[0]);

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');
  const [editingTaskCategoryId, setEditingTaskCategoryId] = useState<number | null>(null);
  const [failingTaskId, setFailingTaskId] = useState<number | null>(null);
  const [failureReason, setFailureReason] = useState('');

  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  const handleStartEdit = (id: number, currentTitle: string, currentDueDate: string | null, currentCategoryId: number | null) => {
    if (isTempId(id)) return;
    setEditingTaskId(id);
    setEditingTaskText(currentTitle);
    setEditingTaskDueDate(currentDueDate || '');
    setEditingTaskCategoryId(currentCategoryId);
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingTaskText('');
    setEditingTaskDueDate('');
    setEditingTaskCategoryId(null);
  };

  const handleBlur = (id: number) => {
    setTimeout(() => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.classList.contains('edit-task-input') || activeEl.classList.contains('edit-task-date-input') || activeEl.classList.contains('edit-task-category-select'))) {
        return;
      }
      handleSaveEdit(id);
    }, 100);
  };

  const handleSaveEdit = async (id: number) => {
    if (editingTaskId !== id) return;

    const trimmedTitle = editingTaskText.trim();
    if (!trimmedTitle) {
      handleCancelEdit();
      return;
    }

    const currentTask = tasks.find(t => t.id === id);
    if (!currentTask) {
      handleCancelEdit();
      return;
    }

    const newDueDate = editingTaskDueDate || null;

    if (currentTask.title === trimmedTitle && currentTask.dueDate === newDueDate && currentTask.categoryId === editingTaskCategoryId) {
      handleCancelEdit();
      return;
    }

    const previousTasks = tasks;
    setActionError(null);
    const selectedCategory = categories.find(category => category.id === editingTaskCategoryId);
    setTasks(tasks.map(t => t.id === id ? {
      ...t,
      title: trimmedTitle,
      dueDate: newDueDate,
      categoryId: editingTaskCategoryId,
      categoryName: selectedCategory?.name,
      categoryColor: selectedCategory?.color
    } : t));
    setEditingTaskId(null);
    setEditingTaskText('');
    setEditingTaskDueDate('');
    setEditingTaskCategoryId(null);

    try {
      const result = await updateTaskDetails(id, {
        title: trimmedTitle,
        dueDate: newDueDate,
        categoryId: editingTaskCategoryId,
      });

      if (!result.ok) {
        setTasks(previousTasks);
        setActionError(result.error);
      } else {
        setTasks(currentTasks => currentTasks.map(t => t.id === id ? result.data : t));
      }
    } catch {
      setTasks(previousTasks);
      setActionError('Failed to update task details.');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const selectedCat = categories.find(c => c.id === newTaskCategoryId);
    const dueDate = newTaskDueDate || null;
    const title = newTaskTitle.trim();
    const previousTasks = tasks;
    setActionError(null);

    const tempId = Math.random();
    const newTask: Task = {
      id: tempId,
      title,
      completed: false,
      createdAt: new Date().toISOString(),
      categoryId: newTaskCategoryId,
      categoryName: selectedCat?.name,
      categoryColor: selectedCat?.color,
      dueDate: dueDate
    };

    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskDueDate('');

    try {
      const result = await addTask(newTask.title, newTask.categoryId, newTask.dueDate);
      if (result.ok) {
        setTasks(currentTasks => currentTasks.map(task => task.id === tempId ? result.data : task));
      } else {
        setTasks(previousTasks);
        setNewTaskTitle(title);
        setActionError(result.error);
      }
    } catch {
      setTasks(previousTasks);
      setNewTaskTitle(title);
      setActionError('Failed to add task.');
    }
  };

  const handleToggle = async (id: number, currentStatus: boolean) => {
    if (isTempId(id)) return;
    const previousTasks = tasks;
    setActionError(null);
    setTasks(tasks.map(t => t.id === id ? {
      ...t,
      completed: !currentStatus,
      completedAt: !currentStatus ? new Date().toISOString() : null,
      failureReason: null
    } : t).sort((a, b) => {
      const aCompleted = a.id === id ? !currentStatus : a.completed;
      const bCompleted = b.id === id ? !currentStatus : b.completed;
      if (aCompleted === bCompleted) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return aCompleted ? 1 : -1;
    }));

    try {
      const result = await toggleTask(id, !currentStatus);
      if (!result.ok) {
        setTasks(previousTasks);
        setActionError(result.error);
      }
    } catch {
      setTasks(previousTasks);
      setActionError('Failed to update task.');
    }
  };

  const handleDelete = async (id: number) => {
    if (isTempId(id)) return;
    const previousTasks = tasks;
    setActionError(null);
    setTasks(tasks.filter(t => t.id !== id));
    try {
      const result = await deleteTask(id);
      if (!result.ok) {
        setTasks(previousTasks);
        setActionError(result.error);
      }
    } catch {
      setTasks(previousTasks);
      setActionError('Failed to delete task.');
    }
  };

  const handleFailTask = async (id: number) => {
    const reason = failureReason.trim();
    if (!reason || isTempId(id)) return;

    const currentTask = tasks.find(task => task.id === id);
    if (!currentTask) return;

    const previousTasks = tasks;
    const completedAt = new Date().toISOString();
    setActionError(null);
    setTasks(tasks.map(task => task.id === id
      ? { ...task, completed: true, completedAt: task.completedAt || completedAt, failureReason: reason }
      : task));
    setFailingTaskId(null);
    setFailureReason('');

    try {
      const result = currentTask.failureReason
        ? await updateFailureReason(id, reason)
        : await failTask(id, reason);
      if (!result.ok) {
        setTasks(previousTasks);
        setActionError(result.error);
      }
    } catch {
      setTasks(previousTasks);
      setActionError('Failed to mark task as failed.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    const name = newCategoryName.trim();
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert('Category already exists!');
      return;
    }

    const previousCategories = categories;
    setActionError(null);
    const tempId = Math.random();
    const newCat: Category = {
      id: tempId,
      name,
      color: newCategoryColor,
      isCustom: true
    };

    setCategories([...categories, newCat]);
    setNewCategoryName('');

    const result = await addCategory(name, newCategoryColor);
    if (result.ok) {
      setCategories(currentCategories => currentCategories.map(cat => cat.id === tempId ? result.data : cat));
      if (newTaskCategoryId === null) {
        setNewTaskCategoryId(result.data.id);
      }
    } else {
      setCategories(previousCategories);
      setNewCategoryName(name);
      setActionError(result.error);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    const inbox = categories.find(c => c.name === 'Inbox');
    const fallbackId = inbox ? inbox.id : null;

    const previousCategories = categories;
    const previousTasks = tasks;
    setActionError(null);
    setCategories(categories.filter(c => c.id !== id));

    // Reset active filters if needed
    if (selectedFilterCategoryId === id) {
      setSelectedFilterCategoryId(null);
    }
    if (newTaskCategoryId === id) {
      setNewTaskCategoryId(fallbackId);
    }

    // Optimistic update tasks to fallback category
    setTasks(tasks.map(t => t.categoryId === id ? {
      ...t,
      categoryId: fallbackId,
      categoryName: inbox?.name,
      categoryColor: inbox?.color
    } : t));

    const result = await deleteCategory(id);
    if (!result.ok) {
      setCategories(previousCategories);
      setTasks(previousTasks);
      setActionError(result.error);
    }
  };

  const todayTasks = tasks.filter(isTodayTask);
  const totalTodayTasks = todayTasks.length;
  const completedTodayTasks = todayTasks.filter(t => t.completed).length;
  const completionPercentage = totalTodayTasks > 0 ? Math.round((completedTodayTasks / totalTodayTasks) * 100) : 0;

  const filteredTasks = selectedFilterCategoryId === null
    ? tasks
    : tasks.filter(t => t.categoryId === selectedFilterCategoryId);

  const filteredTodayTasks = filteredTasks.filter(isTodayTask);
  const activeFilteredTodayTasks = filteredTodayTasks.filter(t => !t.completed);
  const completedFilteredTodayTasks = filteredTodayTasks.filter(t => t.completed);
  const filteredUpcomingTasks = filteredTasks.filter(t => !t.completed && !isTodayTask(t));

  const renderTaskItem = (task: Task) => (
    <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''} ${task.failureReason ? 'failed' : ''}`}>
      <div className="task-outcome-controls">
        <label className="checkbox-container">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => handleToggle(task.id, task.completed)}
            aria-label={task.completed ? 'Reopen task' : 'Mark task as succeeded'}
          />
          <span className="checkmark"></span>
        </label>
        {!task.completed && failingTaskId !== task.id && (
          <button
            type="button"
            className="fail-btn"
            onClick={() => { setFailingTaskId(task.id); setFailureReason(''); }}
            aria-label="Mark task as failed"
            title="Mark as failed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      <div
        className="task-content"
        onDoubleClick={() => editingTaskId !== task.id && handleStartEdit(task.id, task.title, task.dueDate, task.categoryId)}
        title="Double-click to edit"
      >
        {editingTaskId === task.id ? (
          <div className="edit-task-row">
            <input
              type="text"
              className="edit-task-input"
              value={editingTaskText}
              onChange={(e) => setEditingTaskText(e.target.value)}
              onBlur={() => handleBlur(task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit(task.id);
                if (e.key === 'Escape') handleCancelEdit();
              }}
              autoFocus
            />
            <input
              type="date"
              className="edit-task-date-input"
              value={editingTaskDueDate}
              onChange={(e) => setEditingTaskDueDate(e.target.value)}
              onBlur={() => handleBlur(task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit(task.id);
                if (e.key === 'Escape') handleCancelEdit();
              }}
            />
            <select
              className="edit-task-category-select"
              value={editingTaskCategoryId ?? ''}
              onChange={(e) => setEditingTaskCategoryId(e.target.value === '' ? null : Number(e.target.value))}
              onBlur={() => handleBlur(task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit(task.id);
                if (e.key === 'Escape') handleCancelEdit();
              }}
              aria-label="Edit task tag"
            >
              <option value="">No tag</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <span
            className="task-text"
            onDoubleClick={(e) => {
              e.stopPropagation(); // Avoid double triggering
              handleStartEdit(task.id, task.title, task.dueDate, task.categoryId);
            }}
            title="Double-click to edit"
          >
            {task.title}
          </span>
        )}
        <div className="task-meta-row">
          {task.completed && (
            <span className={`task-outcome-badge ${task.failureReason ? 'failure' : 'success'}`}>
              {task.failureReason ? 'Failed' : 'Succeeded'}
            </span>
          )}
          {task.categoryName && (
            <span className="task-category-badge" style={{ color: task.categoryColor } as React.CSSProperties}>
              <span className="badge-dot" style={{ backgroundColor: task.categoryColor }}></span>
              {task.categoryName}
            </span>
          )}
          {task.dueDate && (
            <span className={`due-date-badge ${getDueDateClass(task.dueDate, task.completed)}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="calendar-icon">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              {getDueDateText(task.dueDate)}
            </span>
          )}
        </div>
        {task.failureReason && failingTaskId !== task.id && (
          <button
            type="button"
            className="failure-reason"
            onClick={() => { setFailingTaskId(task.id); setFailureReason(task.failureReason || ''); }}
            aria-label="Edit failure reason"
            title="Click to edit failure reason"
          >
            {task.failureReason}
          </button>
        )}
        {failingTaskId === task.id && (
          <form className="failure-reason-form" onSubmit={(event) => { event.preventDefault(); handleFailTask(task.id); }}>
            <input
              type="text"
              value={failureReason}
              onChange={(event) => setFailureReason(event.target.value)}
              placeholder="What prevented this task from succeeding?"
              aria-label="Failure reason"
              autoFocus
            />
            <button type="submit" disabled={!failureReason.trim()}>Save</button>
            <button type="button" onClick={() => { setFailingTaskId(null); setFailureReason(''); }}>Cancel</button>
          </form>
        )}
      </div>
      <button
        type="button"
        onClick={() => handleStartEdit(task.id, task.title, task.dueDate, task.categoryId)}
        className="edit-btn"
        aria-label="Edit task"
        title="Edit task"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button onClick={() => handleDelete(task.id)} className="delete-btn" aria-label="Delete task">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    </li>
  );

  return (
    <>
      {/* Dynamic Header */}
      <header>
        <div className="header-top">
          <h1>TuDu</h1>
          <div className="header-actions">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              data-theme-state={theme}
              suppressHydrationWarning
            >
              <span className="theme-toggle-thumb" aria-hidden="true"></span>
              <span className="theme-toggle-icon theme-toggle-icon-sun" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"></circle>
                  <line x1="12" y1="2" x2="12" y2="4"></line>
                  <line x1="12" y1="20" x2="12" y2="22"></line>
                  <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line>
                  <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line>
                  <line x1="2" y1="12" x2="4" y2="12"></line>
                  <line x1="20" y1="12" x2="22" y2="12"></line>
                  <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"></line>
                  <line x1="17.66" y1="6.34" x2="19.07" y2="4.93"></line>
                </svg>
              </span>
              <span className="theme-toggle-icon theme-toggle-icon-moon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              </span>
            </button>
            <button type="button" onClick={() => logout()} className="logout-btn" aria-label="Sign Out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
        <p className="subtitle">Focus on what matters today.</p>

        {/* Tab Switcher */}
        <div className="tab-switcher">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'tasks' && !dateMode ? 'active' : ''}`}
            onClick={() => { setActiveTab('tasks'); setDateMode(null); calendarSavedState.current = null; }}
          >
            Tasks
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => { setActiveTab('calendar'); setDateMode(null); calendarSavedState.current = null; }}
          >
            Calendar
          </button>
        </div>
      </header>

      {/* Date Task List Mode */}
      {dateMode && activeTab === 'tasks' ? (
        <DateTaskList
          dateStr={dateMode}
          categories={categories}
          onBack={() => {
            setDateMode(null);
            setActiveTab('calendar');
          }}
          refreshTasks={refreshTasks}
        />
      ) : activeTab === 'calendar' ? (
        <CalendarView
          categories={categories}
          onOpenInTasks={(dateStr, state) => {
            calendarSavedState.current = state;
            setDateMode(dateStr);
            setActiveTab('tasks');
          }}
          savedState={calendarSavedState.current}
        />
      ) : (
        <>
          {/* Stats Dashboard */}
          <div className="stats-dashboard">
            <div className="stats-info">
              <span className="stats-count">
                {completedTodayTasks} of {totalTodayTasks} completed today
              </span>
              <p className="stats-quote">
                {getMotivationalText(completionPercentage)}
              </p>
            </div>
            <div className="stats-progress-container">
              <svg className="progress-ring" width="70" height="70">
                {/* Background circle */}
                <circle
                  className="progress-ring-bg"
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="5"
                  fill="transparent"
                  r="28"
                  cx="35"
                  cy="35"
                />
                {/* Active progress circle */}
                <circle
                  className="progress-ring-bar"
                  stroke="var(--accent)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="transparent"
                  r="28"
                  cx="35"
                  cy="35"
                  style={{
                    strokeDasharray: 176,
                    strokeDashoffset: 176 - (176 * completionPercentage) / 100
                  }}
                />
              </svg>
              <span className="progress-percentage">{completionPercentage}%</span>
            </div>
          </div>

          {/* Category Section */}
          <div className="category-section">
            <div className="category-filters-container">
              <div className="category-pills">
                <button
                  type="button"
                  className={`filter-pill ${selectedFilterCategoryId === null ? 'active' : ''}`}
                  onClick={() => setSelectedFilterCategoryId(null)}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`filter-pill ${selectedFilterCategoryId === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedFilterCategoryId(cat.id)}
                    style={{ '--pill-color': cat.color } as React.CSSProperties}
                  >
                    <span className="pill-dot" style={{ backgroundColor: cat.color }}></span>
                    {cat.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`manage-categories-btn ${isManageDrawerOpen ? 'active' : ''}`}
                onClick={() => setIsManageDrawerOpen(!isManageDrawerOpen)}
                aria-label="Manage Categories"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
            </div>

            {/* Manage Drawer */}
            {isManageDrawerOpen && (
              <div className="manage-drawer">
                <div className="drawer-header">
                  <h3>Manage Categories</h3>
                </div>

                <form onSubmit={handleAddCategory} className="new-category-form">
                  <input
                    type="text"
                    placeholder="New category..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    maxLength={15}
                  />
                  <div className="color-selector">
                    {premiumColors.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`color-dot ${newCategoryColor === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewCategoryColor(color)}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                  <button type="submit" className="add-category-submit-btn">
                    Add
                  </button>
                </form>

                <div className="drawer-categories-list">
                  {categories.map(cat => (
                    <div key={cat.id} className="drawer-category-item">
                      <div className="category-info">
                        <span className="category-dot" style={{ backgroundColor: cat.color }}></span>
                        <span className="category-name">{cat.name}</span>
                        {!cat.isCustom && <span className="system-tag">Default</span>}
                      </div>
                      {cat.isCustom && (
                        <button
                          type="button"
                          className="delete-category-btn"
                          onClick={() => handleDeleteCategory(cat.id)}
                          aria-label={`Delete ${cat.name} category`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Task input form */}
          <form onSubmit={handleAddTask} className="input-group">
            <input
              type="text"
              placeholder="What needs to be done?"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button type="submit" className="add-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </form>

          {actionError && (
            <div className="action-error" role="alert">
              {actionError}
            </div>
          )}

          {/* Task Creation Metadata Controls */}
          <div className="task-creation-controls">
            {/* Category tagging */}
            {categories.length > 0 && (
              <div className="task-category-picker">
                <span className="picker-label">Tag:</span>
                <div className="picker-pills">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`picker-pill ${newTaskCategoryId === cat.id ? 'selected' : ''}`}
                      style={{ '--pill-color': cat.color } as React.CSSProperties}
                      onClick={() => setNewTaskCategoryId(cat.id)}
                    >
                      <span className="pill-dot" style={{ backgroundColor: cat.color }}></span>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date Selector */}
            <div className="task-date-picker">
              <span className="picker-label">Due:</span>
              <input
                type="date"
                className="creation-date-input"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                aria-label="Set due date"
              />
            </div>
          </div>

          {/* Task Sections */}
          {filteredTasks.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <p>{selectedFilterCategoryId === null ? "All caught up! You're good to go." : "No tasks in this category."}</p>
            </div>
          ) : (
            <div className="task-sections">
              {/* Today's Focus Section */}
              {(filteredTodayTasks.length > 0 || filteredUpcomingTasks.length > 0) && (
                <div className="task-section today-focus-section">
                  <div className="section-header">
                    <div className="section-title">
                      <span>Today&apos;s Focus</span>
                    </div>
                    <span className="section-count">{activeFilteredTodayTasks.length}</span>
                  </div>

                  {activeFilteredTodayTasks.length === 0 ? (
                    <>
                      <div className="today-empty-card">
                        <span className="today-empty-icon">{filteredTodayTasks.length > 0 ? '🎉' : '☀️'}</span>
                        <h4 className="today-empty-title">
                          {filteredTodayTasks.length > 0 ? 'All caught up for today!' : 'No tasks for today'}
                        </h4>
                        <p className="today-empty-subtitle">
                          {selectedFilterCategoryId !== null
                            ? "No tasks due today in this tag. Keep up the great work!"
                            : filteredTodayTasks.length > 0
                              ? "Outstanding! You crushed all your goals today. Enjoy your day!"
                              : "Nothing scheduled for today. Add a task or enjoy a free day!"}
                        </p>
                      </div>
                      {completedFilteredTodayTasks.length > 0 && (
                        <ul className="task-list" style={{ marginTop: '0.75rem' }}>
                          {completedFilteredTodayTasks.map((task) => renderTaskItem(task))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <ul className="task-list">
                        {activeFilteredTodayTasks.map((task) => renderTaskItem(task))}
                      </ul>
                      {completedFilteredTodayTasks.length > 0 && (
                        <ul className="task-list" style={{ marginTop: '0.75rem' }}>
                          {completedFilteredTodayTasks.map((task) => renderTaskItem(task))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Upcoming Section */}
              {filteredUpcomingTasks.length > 0 && (
                <div className="task-section upcoming-section">
                  <div className="section-header">
                    <div className="section-title">
                      <span>Upcoming</span>
                    </div>
                    <span className="section-count">{filteredUpcomingTasks.length}</span>
                  </div>

                  <ul className="task-list">
                    {filteredUpcomingTasks.map((task) => renderTaskItem(task))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

const isTodayTask = (task: Task) => {
  if (task.completed) {
    if (!task.completedAt) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedDate = new Date(task.completedAt);
    completedDate.setHours(0, 0, 0, 0);
    return completedDate.getTime() === today.getTime();
  }

  if (!task.dueDate) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);

  return due.getTime() <= today.getTime();
};

const getDueDateText = (dueDate: string | null) => {
  if (!dueDate) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'Overdue';
  } else if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else {
    const month = String(due.getMonth() + 1).padStart(2, '0');
    const day = String(due.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  }
};

const getDueDateClass = (dueDate: string | null, completed: boolean) => {
  if (!dueDate || completed) return 'date-normal';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'date-overdue';
  } else if (diffDays === 0) {
    return 'date-today';
  } else if (diffDays === 1) {
    return 'date-tomorrow';
  } else {
    return 'date-future';
  }
};

const getMotivationalText = (percentage: number) => {
  if (percentage === 0) {
    return "Ready to start? Let's take the first step!";
  } else if (percentage < 40) {
    return "Off to a great start! Keep going.";
  } else if (percentage < 80) {
    return "You're doing amazing! Keep up the momentum.";
  } else if (percentage < 100) {
    return "So close! Just a few more to go.";
  } else {
    return "Outstanding! You crushed all your goals today!";
  }
};
