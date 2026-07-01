import type { Task } from '@/app/actions';

/** Which lifecycle moment of the task produced this event. */
export type CalendarEventType = 'created' | 'due' | 'result';

/** Current outcome of a task. */
export type TaskOutcome = 'pending' | 'succeeded' | 'failed';

/** A single calendar event derived from a task. */
export interface CalendarEvent {
  /** The underlying task snapshot (current values, not historical). */
  task: Task;
  /** The date this event falls on, as local YYYY-MM-DD. */
  eventDate: string;
  /** Which lifecycle event this represents. */
  eventType: CalendarEventType;
  /** Current outcome of the task. */
  outcome: TaskOutcome;
  /** Stable sort key: `${eventDate}_${eventType}_${taskId}` */
  sortKey: string;
}

/** Filters for querying calendar events. */
export interface CalendarQuery {
  /** Start of date range, inclusive, as local YYYY-MM-DD. */
  dateStart?: string;
  /** End of date range, inclusive, as local YYYY-MM-DD. */
  dateEnd?: string;
  /** ISO timestamp for the start of dateStart in user's timezone. */
  isoStart?: string;
  /** ISO timestamp for the end of dateEnd in user's timezone (end of day). */
  isoEnd?: string;
  /** Case-insensitive keyword to match against title and failureReason. */
  keyword?: string;
  /** Filter by single category ID, or null/undefined for all. */
  categoryId?: number | null;
  /** Filter by task outcome(s). Empty = all. */
  outcomes?: TaskOutcome[];
  /** Filter by event type(s). Empty = all. */
  eventTypes?: CalendarEventType[];
  /** Page number for search results, 1-indexed. */
  page?: number;
  /** Items per page. Default 50. */
  pageSize?: number;
  /** Browser's IANA timezone, e.g. Asia/Shanghai. */
  timezone?: string;
}

/** Unified return type for calendar read queries to handle errors cleanly. */
export type CalendarReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Response from calendar month view query. */
export interface CalendarMonthData {
  /** All events within the 42-cell range. */
  events: CalendarEvent[];
  /** Map of YYYY-MM-DD → { taskCount, hasFailed } for month grid display. */
  daySummary: Record<string, { taskCount: number; hasFailed: boolean }>;
}

/** Response from calendar search query. */
export interface CalendarSearchResult {
  events: CalendarEvent[];
  hasMore: boolean;
  totalCount: number;
}
