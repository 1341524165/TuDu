'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Task, Category } from '@/app/actions';
import {
  toggleTask,
  failTask,
  updateFailureReason,
  deleteTask,
  updateTaskDetails,
} from '@/app/actions';
import type { CalendarEvent, CalendarEventType } from '@/types/calendar';
import { getCalendarDateEvents } from '@/app/calendarActions';
import { formatDateDisplay, localDateStartISO, localDateEndISO } from '@/utils/dateUtils';

const isTempId = (id: number) => !Number.isSafeInteger(id);

interface DateTaskListProps {
  dateStr: string;
  categories: Category[];
  onBack: () => void;
  refreshTasks: () => Promise<void>;
}

/** A task with its associated event type labels for the date. */
interface DateTaskEntry {
  task: Task;
  eventTypes: CalendarEventType[];
}

export default function DateTaskList({ dateStr, categories, onBack, refreshTasks }: DateTaskListProps) {
  const [entries, setEntries] = useState<DateTaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');
  const [editingTaskCategoryId, setEditingTaskCategoryId] = useState<number | null>(null);
  const [failingTaskId, setFailingTaskId] = useState<number | null>(null);
  const [failureReason, setFailureReason] = useState('');

  const fetchDateTasks = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const isoStart = localDateStartISO(dateStr);
      const isoEnd = localDateEndISO(dateStr);
      const res = await getCalendarDateEvents(dateStr, isoStart, isoEnd, Intl.DateTimeFormat().resolvedOptions().timeZone);

      if (!res.ok) {
        setActionError(res.error);
        return false;
      }

      // Deduplicate: group by task ID, collect event types
      const taskMap = new Map<number, DateTaskEntry>();
      for (const event of res.data) {
        const existing = taskMap.get(event.task.id);
        if (existing) {
          if (!existing.eventTypes.includes(event.eventType)) {
            existing.eventTypes.push(event.eventType);
          }
          existing.task = event.task;
        } else {
          taskMap.set(event.task.id, {
            task: event.task,
            eventTypes: [event.eventType],
          });
        }
      }

      setEntries(Array.from(taskMap.values()));
      return true;
    } catch {
      setActionError('Failed to load tasks for this date.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    fetchDateTasks();
  }, [fetchDateTasks]);

  const handleStartEdit = (task: Task) => {
    if (isTempId(task.id)) return;
    setEditingTaskId(task.id);
    setEditingTaskText(task.title);
    setEditingTaskDueDate(task.dueDate || '');
    setEditingTaskCategoryId(task.categoryId);
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
      if (activeEl && (
        activeEl.classList.contains('edit-task-input') ||
        activeEl.classList.contains('edit-task-date-input') ||
        activeEl.classList.contains('edit-task-category-select')
      )) {
        return;
      }
      handleSaveEdit(id);
    }, 100);
  };

  const handleSaveEdit = async (id: number) => {
    if (editingTaskId !== id) return;
    const trimmedTitle = editingTaskText.trim();
    if (!trimmedTitle) { handleCancelEdit(); return; }

    const entry = entries.find(e => e.task.id === id);
    if (!entry) { handleCancelEdit(); return; }

    const currentTask = entry.task;
    const newDueDate = editingTaskDueDate || null;

    if (currentTask.title === trimmedTitle &&
        currentTask.dueDate === newDueDate &&
        currentTask.categoryId === editingTaskCategoryId) {
      handleCancelEdit();
      return;
    }

    const previousEntries = entries;
    setActionError(null);
    const selectedCategory = categories.find(c => c.id === editingTaskCategoryId);

    // Optimistic update
    setEntries(entries.map(e => e.task.id === id ? {
      ...e,
      task: {
        ...e.task,
        title: trimmedTitle,
        dueDate: newDueDate,
        categoryId: editingTaskCategoryId,
        categoryName: selectedCategory?.name,
        categoryColor: selectedCategory?.color,
      },
    } : e));
    handleCancelEdit();

    try {
      const result = await updateTaskDetails(id, {
        title: trimmedTitle,
        dueDate: newDueDate,
        categoryId: editingTaskCategoryId,
      });

      if (!result.ok) {
        setEntries(previousEntries);
        setActionError(result.error);
        return;
      }

      const fetchedOk = await fetchDateTasks();
      try {
        await refreshTasks();
      } catch {
        setActionError('Failed to synchronize tasks.');
      }
      if (!fetchedOk) setActionError('Failed to synchronize tasks.');
    } catch {
      setEntries(previousEntries);
      setActionError('Failed to update task details.');
    }
  };

  const handleToggle = async (id: number, currentStatus: boolean) => {
    if (isTempId(id)) return;
    const previousEntries = entries;
    setActionError(null);

    // Optimistic update
    setEntries(entries.map(e => e.task.id === id ? {
      ...e,
      task: {
        ...e.task,
        completed: !currentStatus,
        completedAt: !currentStatus ? new Date().toISOString() : null,
        failureReason: null,
      },
    } : e));

    try {
      const result = await toggleTask(id, !currentStatus);
      if (!result.ok) {
        setEntries(previousEntries);
        setActionError(result.error);
        return;
      }

      const fetchedOk = await fetchDateTasks();
      try {
        await refreshTasks();
      } catch {
        setActionError('Failed to synchronize tasks.');
      }
      if (!fetchedOk) setActionError('Failed to synchronize tasks.');
    } catch {
      setEntries(previousEntries);
      setActionError('Failed to update task.');
    }
  };

  const handleDelete = async (id: number) => {
    if (isTempId(id)) return;
    const previousEntries = entries;
    setActionError(null);
    setEntries(entries.filter(e => e.task.id !== id));

    try {
      const result = await deleteTask(id);
      if (!result.ok) {
        setEntries(previousEntries);
        setActionError(result.error);
        return;
      }

      try {
        await refreshTasks();
      } catch {
        setActionError('Failed to synchronize tasks.');
      }
    } catch {
      setEntries(previousEntries);
      setActionError('Failed to delete task.');
    }
  };

  const handleFailTask = async (id: number) => {
    const reason = failureReason.trim();
    if (!reason || isTempId(id)) return;

    const entry = entries.find(e => e.task.id === id);
    if (!entry) return;

    const previousEntries = entries;
    const completedAt = new Date().toISOString();
    setActionError(null);

    setEntries(entries.map(e => e.task.id === id ? {
      ...e,
      task: {
        ...e.task,
        completed: true,
        completedAt: e.task.completedAt || completedAt,
        failureReason: reason,
      },
    } : e));
    setFailingTaskId(null);
    setFailureReason('');

    try {
      const result = entry.task.failureReason
        ? await updateFailureReason(id, reason)
        : await failTask(id, reason);

      if (!result.ok) {
        setEntries(previousEntries);
        setActionError(result.error);
        return;
      }

      const fetchedOk = await fetchDateTasks();
      try {
        await refreshTasks();
      } catch {
        setActionError('Failed to synchronize tasks.');
      }
      if (!fetchedOk) setActionError('Failed to synchronize tasks.');
    } catch {
      setEntries(previousEntries);
      setActionError('Failed to mark task as failed.');
    }
  };

  return (
    <div className="date-task-list">
      <div className="date-task-list-header">
        <button type="button" className="back-to-calendar-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Calendar
        </button>
        <h3 className="date-task-list-title">{formatDateDisplay(dateStr)}</h3>
      </div>

      {actionError && (
        <div className="action-error" role="alert">{actionError}</div>
      )}

      {loading && <div className="calendar-loading">Loading tasks...</div>}

      {!loading && entries.length === 0 && (
        <div className="calendar-empty">No tasks on this date.</div>
      )}

      {!loading && entries.length > 0 && (
        <ul className="task-list">
          {entries.map(({ task, eventTypes }) => (
            <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''} ${task.failureReason ? 'failed' : ''}`}>
              <div className="task-outcome-controls">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggle(task.id, task.completed)}
                    aria-label={task.completed ? 'Reopen task' : 'Mark task as succeeded'}
                  />
                  <span className="checkmark" />
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
                onDoubleClick={() => editingTaskId !== task.id && handleStartEdit(task)}
                title="Double-click to edit"
              >
                {editingTaskId === task.id ? (
                  <div className="edit-task-row">
                    <input
                      type="text"
                      className="edit-task-input"
                      value={editingTaskText}
                      onChange={e => setEditingTaskText(e.target.value)}
                      onBlur={() => handleBlur(task.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(task.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      autoFocus
                    />
                    <input
                      type="date"
                      className="edit-task-date-input"
                      value={editingTaskDueDate}
                      onChange={e => setEditingTaskDueDate(e.target.value)}
                      onBlur={() => handleBlur(task.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(task.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <select
                      className="edit-task-category-select"
                      value={editingTaskCategoryId ?? ''}
                      onChange={e => setEditingTaskCategoryId(e.target.value === '' ? null : Number(e.target.value))}
                      onBlur={() => handleBlur(task.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(task.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      aria-label="Edit task tag"
                    >
                      <option value="">No tag</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="task-text" title="Double-click to edit">
                    {task.title}
                  </span>
                )}

                <div className="task-meta-row">
                  {/* Event type labels */}
                  {eventTypes.map(type => (
                    <span key={type} className={`event-type-badge ${type}`}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                  ))}

                  {task.completed && (
                    <span className={`task-outcome-badge ${task.failureReason ? 'failure' : 'success'}`}>
                      {task.failureReason ? 'Failed' : 'Succeeded'}
                    </span>
                  )}

                  {task.categoryName && (
                    <span className="task-category-badge" style={{ color: task.categoryColor } as React.CSSProperties}>
                      <span className="badge-dot" style={{ backgroundColor: task.categoryColor }} />
                      {task.categoryName}
                    </span>
                  )}

                  {task.dueDate && (
                    <span className="due-date-badge date-normal">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="calendar-icon">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {task.dueDate}
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
                  <form className="failure-reason-form" onSubmit={e => { e.preventDefault(); handleFailTask(task.id); }}>
                    <input
                      type="text"
                      value={failureReason}
                      onChange={e => setFailureReason(e.target.value)}
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
                onClick={() => handleStartEdit(task)}
                className="edit-btn"
                aria-label="Edit task"
                title="Edit task"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>

              <button onClick={() => handleDelete(task.id)} className="delete-btn" aria-label="Delete task">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
