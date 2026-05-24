'use client';

import { useState, useEffect } from 'react';
import { Task, Category, addTask, toggleTask, deleteTask, addCategory, deleteCategory, updateTaskTitle, updateTaskDueDate } from '@/app/actions';

const premiumColors = [
  '#a78bfa', // Violet
  '#60a5fa', // Blue
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f87171', // Rose
  '#22d3ee', // Cyan
];

export default function TodoList({ 
  initialTasks, 
  initialCategories 
}: { 
  initialTasks: Task[]; 
  initialCategories: Category[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  
  const [newTaskCategoryId, setNewTaskCategoryId] = useState<number | null>(null);
  const [selectedFilterCategoryId, setSelectedFilterCategoryId] = useState<number | null>(null);
  const [isManageDrawerOpen, setIsManageDrawerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(premiumColors[0]);

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');

  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  const handleStartEdit = (id: number, currentTitle: string, currentDueDate: string | null) => {
    setEditingTaskId(id);
    setEditingTaskText(currentTitle);
    setEditingTaskDueDate(currentDueDate || '');
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingTaskText('');
    setEditingTaskDueDate('');
  };

  const handleBlur = (id: number) => {
    setTimeout(() => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.classList.contains('edit-task-input') || activeEl.classList.contains('edit-task-date-input'))) {
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

    if (currentTask.title === trimmedTitle && currentTask.dueDate === newDueDate) {
      handleCancelEdit();
      return;
    }

    // Optimistic update
    setTasks(tasks.map(t => t.id === id ? { ...t, title: trimmedTitle, dueDate: newDueDate } : t));
    setEditingTaskId(null);
    setEditingTaskText('');
    setEditingTaskDueDate('');

    if (currentTask.title !== trimmedTitle) {
      await updateTaskTitle(id, trimmedTitle);
    }
    if (currentTask.dueDate !== newDueDate) {
      await updateTaskDueDate(id, newDueDate);
    }
  };


  // Sync state with server-side props
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  // Initialize new task category ID once categories load
  useEffect(() => {
    if (newTaskCategoryId === null && categories.length > 0) {
      const inbox = categories.find(c => c.name === 'Inbox');
      setNewTaskCategoryId(inbox ? inbox.id : categories[0].id);
    }
  }, [categories, newTaskCategoryId]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    const selectedCat = categories.find(c => c.id === newTaskCategoryId);
    const dueDate = newTaskDueDate || null;
    
    // Optimistic update
    const tempId = Math.random();
    const newTask: Task = {
      id: tempId,
      title: newTaskTitle.trim(),
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
    
    // Server action
    await addTask(newTask.title, newTask.categoryId, newTask.dueDate);
  };

  const handleToggle = async (id: number, currentStatus: boolean) => {
    // Optimistic update
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !currentStatus } : t).sort((a, b) => {
      const aCompleted = a.id === id ? !currentStatus : a.completed;
      const bCompleted = b.id === id ? !currentStatus : b.completed;
      if (aCompleted === bCompleted) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return aCompleted ? 1 : -1;
    }));
    
    await toggleTask(id, !currentStatus);
  };

  const handleDelete = async (id: number) => {
    // Optimistic update
    setTasks(tasks.filter(t => t.id !== id));
    await deleteTask(id);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    
    const name = newCategoryName.trim();
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert('Category already exists!');
      return;
    }
    
    // Optimistic update
    const tempId = Math.random();
    const newCat: Category = {
      id: tempId,
      name,
      color: newCategoryColor,
      isCustom: true
    };
    
    setCategories([...categories, newCat]);
    setNewCategoryName('');
    
    await addCategory(name, newCategoryColor);
  };

  const handleDeleteCategory = async (id: number) => {
    const inbox = categories.find(c => c.name === 'Inbox');
    const fallbackId = inbox ? inbox.id : null;
    
    // Optimistic update categories
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

    await deleteCategory(id);
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const filteredTasks = selectedFilterCategoryId === null
    ? tasks
    : tasks.filter(t => t.categoryId === selectedFilterCategoryId);

  return (
    <>
      {/* Stats Dashboard */}
      <div className="stats-dashboard">
        <div className="stats-info">
          <span className="stats-count">
            {completedTasks} of {totalTasks} completed
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

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <p>{selectedFilterCategoryId === null ? "All caught up! You're good to go." : "No tasks in this category."}</p>
        </div>
      ) : (
        <ul className="task-list">
          {filteredTasks.map((task) => (
            <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => handleToggle(task.id, task.completed)}
                />
                <span className="checkmark"></span>
              </label>
              <div className="task-content">
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
                  </div>
                ) : (
                  <span 
                    className="task-text"
                    onDoubleClick={() => !task.completed && handleStartEdit(task.id, task.title, task.dueDate)}
                    title={task.completed ? undefined : "Double-click to edit"}
                  >
                    {task.title}
                  </span>
                )}
                <div className="task-meta-row">
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
              </div>
              <button onClick={() => handleDelete(task.id)} className="delete-btn" aria-label="Delete task">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

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
