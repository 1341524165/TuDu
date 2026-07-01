'use server';

import { createClient } from '@/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '@/app/actions';
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarQuery,
  CalendarMonthData,
  CalendarSearchResult,
  TaskOutcome,
  CalendarReadResult,
} from '@/types/calendar';

type TaskRow = {
  id: number;
  title: string;
  completed: boolean | number;
  createdAt: string;
  categoryId: number | null;
  dueDate: string | null;
  completedAt: string | null;
  failureReason: string | null;
  categories?: { name: string; color: string } | null;
};

const DATABASE_PAGE_SIZE = 1000;

type TaskPageResult = {
  data: TaskRow[] | null;
  error: { message?: string } | null;
};

async function fetchAllTaskRows(
  buildPage: (from: number, to: number) => PromiseLike<TaskPageResult>
): Promise<TaskRow[]> {
  const rows: TaskRow[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + DATABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < DATABASE_PAGE_SIZE) break;
  }

  return rows;
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
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    failureReason: row.failureReason,
  };
}

function getOutcome(task: Task): TaskOutcome {
  if (!task.completed) return 'pending';
  return task.failureReason ? 'failed' : 'succeeded';
}

async function getCurrentUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** Convert ISO timestamp to YYYY-MM-DD in the specified IANA timezone. */
function isoToLocalDateInTimezone(isoStr: string, timeZone: string): string {
  const date = new Date(isoStr);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch (err) {
    // Fallback to UTC if timezone formatting fails
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Derive calendar events from a task, using browser's local timezone for ISO conversion.
 */
function deriveEvents(task: Task, timezone: string): CalendarEvent[] {
  const outcome = getOutcome(task);
  const events: CalendarEvent[] = [];

  // Created event — createdAt is always present
  if (task.createdAt) {
    const createdDate = isoToLocalDateInTimezone(task.createdAt, timezone);
    events.push({
      task,
      eventDate: createdDate,
      eventType: 'created',
      outcome,
      sortKey: `${createdDate}_created_${task.id}`,
    });
  }

  // Due event — dueDate is a local YYYY-MM-DD string
  if (task.dueDate) {
    events.push({
      task,
      eventDate: task.dueDate,
      eventType: 'due',
      outcome,
      sortKey: `${task.dueDate}_due_${task.id}`,
    });
  }

  // Result event — only if completedAt is set
  if (task.completedAt) {
    const resultDate = isoToLocalDateInTimezone(task.completedAt, timezone);
    events.push({
      task,
      eventDate: resultDate,
      eventType: 'result',
      outcome,
      sortKey: `${resultDate}_result_${task.id}`,
    });
  }

  return events;
}

function matchesKeyword(event: CalendarEvent, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (event.task.title.toLowerCase().includes(kw)) return true;
  if (event.task.failureReason && event.task.failureReason.toLowerCase().includes(kw)) return true;
  return false;
}

function matchesFilters(event: CalendarEvent, query: CalendarQuery): boolean {
  // Category filter
  if (query.categoryId !== undefined && query.categoryId !== null) {
    if (event.task.categoryId !== query.categoryId) return false;
  }

  // Outcome filter
  if (query.outcomes && query.outcomes.length > 0) {
    if (!query.outcomes.includes(event.outcome)) return false;
  }

  // Event type filter
  if (query.eventTypes && query.eventTypes.length > 0) {
    if (!query.eventTypes.includes(event.eventType)) return false;
  }

  // Keyword filter
  if (query.keyword && query.keyword.trim()) {
    if (!matchesKeyword(event, query.keyword.trim())) return false;
  }

  // Date range filter (on eventDate, which is YYYY-MM-DD)
  if (query.dateStart && event.eventDate < query.dateStart) return false;
  if (query.dateEnd && event.eventDate > query.dateEnd) return false;

  return true;
}

/** Sort order for event types within the same date (Result first, then Due, then Created). */
const EVENT_TYPE_ORDER: Record<CalendarEventType, number> = {
  result: 0,
  due: 1,
  created: 2,
};

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  // Date descending
  if (a.eventDate !== b.eventDate) return b.eventDate.localeCompare(a.eventDate);
  // Type: Result > Due > Created
  const typeA = EVENT_TYPE_ORDER[a.eventType];
  const typeB = EVENT_TYPE_ORDER[b.eventType];
  if (typeA !== typeB) return typeA - typeB;
  // Stable by task ID
  return a.task.id - b.task.id;
}

/** Validate timezone format */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isValidIsoString(value: string): boolean {
  return ISO_REGEX.test(value) && !Number.isNaN(Date.parse(value));
}

function validateCalendarQuery(query: CalendarQuery): void {
  if (query.timezone && !isValidTimezone(query.timezone)) {
    throw new Error('Invalid timezone.');
  }
  if (query.dateStart && !isValidDateString(query.dateStart)) {
    throw new Error('Invalid dateStart format.');
  }
  if (query.dateEnd && !isValidDateString(query.dateEnd)) {
    throw new Error('Invalid dateEnd format.');
  }
  if (query.isoStart && !isValidIsoString(query.isoStart)) {
    throw new Error('Invalid isoStart format.');
  }
  if (query.isoEnd && !isValidIsoString(query.isoEnd)) {
    throw new Error('Invalid isoEnd format.');
  }
  if (query.categoryId !== undefined && query.categoryId !== null) {
    if (typeof query.categoryId !== 'number' || query.categoryId <= 0 || !Number.isInteger(query.categoryId)) {
      throw new Error('Invalid categoryId.');
    }
  }
  if (query.eventTypes) {
    for (const type of query.eventTypes) {
      if (type !== 'created' && type !== 'due' && type !== 'result') {
        throw new Error('Invalid eventType.');
      }
    }
  }
  if (query.outcomes) {
    for (const outcome of query.outcomes) {
      if (outcome !== 'pending' && outcome !== 'succeeded' && outcome !== 'failed') {
        throw new Error('Invalid outcome.');
      }
    }
  }
  if (query.page !== undefined) {
    if (typeof query.page !== 'number' || query.page <= 0 || !Number.isInteger(query.page)) {
      throw new Error('Invalid page.');
    }
  }
  if (query.pageSize !== undefined && query.pageSize !== 50) {
    throw new Error('Invalid pageSize. Must be exactly 50.');
  }
  if (query.keyword) {
    if (typeof query.keyword !== 'string' || query.keyword.length > 100) {
      throw new Error('Keyword is too long.');
    }
  }
  if (query.dateStart && query.dateEnd && query.dateStart > query.dateEnd) {
    throw new Error('dateStart must not be after dateEnd.');
  }
  if (query.isoStart && query.isoEnd && Date.parse(query.isoStart) > Date.parse(query.isoEnd)) {
    throw new Error('isoStart must not be after isoEnd.');
  }
  if (query.timezone && query.dateStart && query.isoStart
      && isoToLocalDateInTimezone(query.isoStart, query.timezone) !== query.dateStart) {
    throw new Error('isoStart does not match dateStart in the requested timezone.');
  }
  if (query.timezone && query.dateEnd && query.isoEnd
      && isoToLocalDateInTimezone(query.isoEnd, query.timezone) !== query.dateEnd) {
    throw new Error('isoEnd does not match dateEnd in the requested timezone.');
  }
}

function validateDateAndRange(dateStr: string, isoStart: string, isoEnd: string, timezone: string): void {
  if (!isValidDateString(dateStr)) {
    throw new Error('Invalid date format.');
  }
  if (!isValidIsoString(isoStart) || !isValidIsoString(isoEnd)) {
    throw new Error('Invalid ISO boundary format.');
  }
  if (!isValidTimezone(timezone)) {
    throw new Error('Invalid timezone.');
  }
  if (Date.parse(isoStart) > Date.parse(isoEnd)) {
    throw new Error('Invalid date boundary order.');
  }
  if (isoToLocalDateInTimezone(isoStart, timezone) !== dateStr
      || isoToLocalDateInTimezone(isoEnd, timezone) !== dateStr) {
    throw new Error('Date boundaries do not match the requested date and timezone.');
  }
}

/**
 * Fetch all tasks that could produce events in the queried time range.
 * Throws DB errors directly so calling actions fail atomically.
 */
async function fetchTasksForRange(
  supabase: SupabaseClient,
  query: CalendarQuery
): Promise<Task[]> {
  const select = '*, categories(name, color)';
  const taskMap = new Map<number, Task>();

  // Build parallel queries
  const queries: Promise<TaskRow[]>[] = [];

  // 1. Created events — filter by createdAt timestamp range
  if (!query.eventTypes || query.eventTypes.length === 0 || query.eventTypes.includes('created')) {
    queries.push(fetchAllTaskRows((from, to) => {
      let q = supabase.from('tasks').select(select);
      if (query.isoStart) q = q.gte('createdAt', query.isoStart);
      if (query.isoEnd) q = q.lte('createdAt', query.isoEnd);
      return q.order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<TaskPageResult>;
    }));
  }

  // 2. Due events — filter by dueDate (YYYY-MM-DD text comparison)
  if (!query.eventTypes || query.eventTypes.length === 0 || query.eventTypes.includes('due')) {
    queries.push(fetchAllTaskRows((from, to) => {
      let q = supabase.from('tasks').select(select).not('dueDate', 'is', null);
      if (query.dateStart) q = q.gte('dueDate', query.dateStart);
      if (query.dateEnd) q = q.lte('dueDate', query.dateEnd);
      return q.order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<TaskPageResult>;
    }));
  }

  // 3. Result events — filter by completedAt timestamp range
  if (!query.eventTypes || query.eventTypes.length === 0 || query.eventTypes.includes('result')) {
    queries.push(fetchAllTaskRows((from, to) => {
      let q = supabase.from('tasks').select(select).not('completedAt', 'is', null);
      if (query.isoStart) q = q.gte('completedAt', query.isoStart);
      if (query.isoEnd) q = q.lte('completedAt', query.isoEnd);
      return q.order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<TaskPageResult>;
    }));
  }

  const results = await Promise.all(queries);
  for (const rows of results) {
    for (const row of rows) {
      if (!taskMap.has(row.id)) {
        taskMap.set(row.id, mapTask(row));
      }
    }
  }

  return Array.from(taskMap.values());
}

/**
 * Get calendar events for a month grid (42-cell range).
 * Returns day summaries and all events within range.
 */
export async function getCalendarMonthEvents(
  query: CalendarQuery
): Promise<CalendarReadResult<CalendarMonthData>> {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser(supabase);
    if (!user) return { ok: false, error: 'Please sign in again.' };

    validateCalendarQuery(query);

    const tasks = await fetchTasksForRange(supabase, query);
    const timezone = query.timezone || 'UTC';

    // Derive all events from tasks
    let allEvents: CalendarEvent[] = [];
    for (const task of tasks) {
      allEvents.push(...deriveEvents(task, timezone));
    }

    // Filter events to the requested date range
    allEvents = allEvents.filter(e => {
      if (query.dateStart && e.eventDate < query.dateStart) return false;
      if (query.dateEnd && e.eventDate > query.dateEnd) return false;
      return true;
    });

    // Build day summary: per day, count unique tasks and check for failures
    const daySummary: Record<string, { taskCount: number; hasFailed: boolean }> = {};
    const dayTaskSets: Record<string, Set<number>> = {};

    for (const event of allEvents) {
      if (!dayTaskSets[event.eventDate]) {
        dayTaskSets[event.eventDate] = new Set();
        daySummary[event.eventDate] = { taskCount: 0, hasFailed: false };
      }
      dayTaskSets[event.eventDate].add(event.task.id);
      if (event.outcome === 'failed') {
        daySummary[event.eventDate].hasFailed = true;
      }
    }

    // Set deduped task counts
    for (const [date, taskSet] of Object.entries(dayTaskSets)) {
      daySummary[date].taskCount = taskSet.size;
    }

    // Sort events for display
    allEvents.sort(compareEvents);

    return { ok: true, data: { events: allEvents, daySummary } };
  } catch (err: any) {
    console.error('getCalendarMonthEvents error:', err);
    return { ok: false, error: err.message || 'Failed to load calendar data.' };
  }
}

/**
 * Search calendar events across all history with filters and pagination.
 * Safely filters keywords in-memory to support arbitrary special characters without breaking Supabase parser.
 */
export async function searchCalendarEvents(
  query: CalendarQuery
): Promise<CalendarReadResult<CalendarSearchResult>> {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser(supabase);
    if (!user) return { ok: false, error: 'Please sign in again.' };

    validateCalendarQuery(query);

    const select = '*, categories(name, color)';
    const rows = await fetchAllTaskRows((from, to) => {
      let dbQuery = supabase.from('tasks').select(select);
      if (query.categoryId !== undefined && query.categoryId !== null) {
        dbQuery = dbQuery.eq('categoryId', query.categoryId);
      }
      return dbQuery.order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<TaskPageResult>;
    });

    const tasks = rows.map(mapTask);
    const timezone = query.timezone || 'UTC';

    // Derive all events
    let allEvents: CalendarEvent[] = [];
    for (const task of tasks) {
      allEvents.push(...deriveEvents(task, timezone));
    }

    // Apply filters safely in memory
    allEvents = allEvents.filter(e => matchesFilters(e, query));

    // Sort: date descending, then type order, then task ID
    allEvents.sort(compareEvents);

    const totalCount = allEvents.length;
    const page = query.page || 1;
    const pageSize = 50;
    const startIdx = (page - 1) * pageSize;
    const paged = allEvents.slice(startIdx, startIdx + pageSize);
    const hasMore = startIdx + pageSize < totalCount;

    return { ok: true, data: { events: paged, hasMore, totalCount } };
  } catch (err: any) {
    console.error('searchCalendarEvents error:', err);
    return { ok: false, error: err.message || 'Failed to search calendar events.' };
  }
}

/**
 * Get all events for a specific date (used for date detail panel).
 */
export async function getCalendarDateEvents(
  dateStr: string,
  isoStart: string,
  isoEnd: string,
  timezone: string
): Promise<CalendarReadResult<CalendarEvent[]>> {
  try {
    validateDateAndRange(dateStr, isoStart, isoEnd, timezone);

    const query: CalendarQuery = {
      dateStart: dateStr,
      dateEnd: dateStr,
      isoStart,
      isoEnd,
      timezone,
    };

    const supabase = await createClient();
    const user = await getCurrentUser(supabase);
    if (!user) return { ok: false, error: 'Please sign in again.' };

    const tasks = await fetchTasksForRange(supabase, query);

    let events: CalendarEvent[] = [];
    for (const task of tasks) {
      const derived = deriveEvents(task, timezone);
      events.push(...derived.filter(e => e.eventDate === dateStr));
    }

    // Sort: Result first, then Due, then Created
    events.sort((a, b) => {
      const typeA = EVENT_TYPE_ORDER[a.eventType];
      const typeB = EVENT_TYPE_ORDER[b.eventType];
      if (typeA !== typeB) return typeA - typeB;
      return a.task.id - b.task.id;
    });

    return { ok: true, data: events };
  } catch (err: any) {
    console.error('getCalendarDateEvents error:', err);
    return { ok: false, error: err.message || 'Failed to load date events.' };
  }
}
