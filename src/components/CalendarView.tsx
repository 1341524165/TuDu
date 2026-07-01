'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Category, Task } from '@/app/actions';
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarMonthData,
  CalendarSearchResult,
  TaskOutcome,
} from '@/types/calendar';
import {
  getCalendarGridDates,
  getCalendarGridRange,
  formatDateLocal,
  formatMonthYear,
  formatDateDisplay,
  localDateStartISO,
  localDateEndISO,
  todayLocal,
  isSameDate,
  parseDateLocal,
} from '@/utils/dateUtils';
import { getCalendarMonthEvents, searchCalendarEvents, getCalendarDateEvents } from '@/app/calendarActions';

interface CalendarViewProps {
  categories: Category[];
  onOpenInTasks: (dateStr: string, state: CalendarSavedState) => void;
  /** Saved state to restore when returning from Tasks date mode. */
  savedState?: CalendarSavedState | null;
}

export interface CalendarSavedState {
  year: number;
  month: number;
  selectedDate: string | null;
  searchExpanded: boolean;
  keyword: string;
  filterCategoryId: number | null;
  filterOutcomes: TaskOutcome[];
  filterEventTypes: CalendarEventType[];
  filterDateStart: string;
  filterDateEnd: string;
  searchResults: CalendarSearchResult | null;
  searchResultsVisible: boolean;
  searchPage: number;
  highlightEventKey: string | null;
  searchResultsScrollPos?: number;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EVENT_TYPE_ORDER: Record<CalendarEventType, number> = {
  result: 0,
  due: 1,
  created: 2,
};

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.eventDate !== b.eventDate) return b.eventDate.localeCompare(a.eventDate);
  const typeA = EVENT_TYPE_ORDER[a.eventType];
  const typeB = EVENT_TYPE_ORDER[b.eventType];
  if (typeA !== typeB) return typeA - typeB;
  return a.task.id - b.task.id;
}

export default function CalendarView({ categories, onOpenInTasks, savedState }: CalendarViewProps) {
  const today = todayLocal();
  const todayDate = parseDateLocal(today);

  // Month navigation
  const [year, setYear] = useState(savedState?.year ?? todayDate.getFullYear());
  const [month, setMonth] = useState(savedState?.month ?? todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(savedState?.selectedDate ?? null);

  // Roving keyboard navigation focus tracking
  const [focusedDate, setFocusedDate] = useState<string | null>(savedState?.selectedDate ?? null);

  // Month data
  const [monthData, setMonthData] = useState<CalendarMonthData | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  const monthRequestId = useRef(0);

  // Date detail
  const [dateEvents, setDateEvents] = useState<CalendarEvent[]>([]);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const dateRequestId = useRef(0);

  // Search & Filter
  const [searchExpanded, setSearchExpanded] = useState(savedState?.searchExpanded ?? false);
  const [keyword, setKeyword] = useState(savedState?.keyword ?? '');
  const [debouncedKeyword, setDebouncedKeyword] = useState(savedState?.keyword ?? '');
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(savedState?.filterCategoryId ?? null);
  const [filterOutcomes, setFilterOutcomes] = useState<TaskOutcome[]>(savedState?.filterOutcomes ?? []);
  const [filterEventTypes, setFilterEventTypes] = useState<CalendarEventType[]>(savedState?.filterEventTypes ?? []);
  const [filterDateStart, setFilterDateStart] = useState(savedState?.filterDateStart ?? '');
  const [filterDateEnd, setFilterDateEnd] = useState(savedState?.filterDateEnd ?? '');

  // Search results
  const [searchResults, setSearchResults] = useState<CalendarSearchResult | null>(savedState?.searchResults ?? null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchPage, setSearchPage] = useState(savedState?.searchPage ?? 1);
  const [searchResultsVisible, setSearchResultsVisible] = useState(savedState?.searchResultsVisible ?? false);
  const searchRequestId = useRef(0);
  const [searchRetryNonce, setSearchRetryNonce] = useState(0);

  // Highlight
  const [highlightEventKey, setHighlightEventKey] = useState<string | null>(savedState?.highlightEventKey ?? null);

  // Results scroll position
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchResultsScrollPos = useRef(savedState?.searchResultsScrollPos ?? 0);

  const hasActiveFilters = !!(
    debouncedKeyword.trim() ||
    filterCategoryId !== null ||
    filterOutcomes.length > 0 ||
    filterEventTypes.length > 0 ||
    filterDateStart ||
    filterDateEnd
  );

  // Debounce keyword
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // Fetch month data
  const fetchMonth = useCallback(async () => {
    const reqId = ++monthRequestId.current;
    setMonthLoading(true);
    setMonthError(null);

    try {
      const range = getCalendarGridRange(year, month);
      const res = await getCalendarMonthEvents({
        dateStart: range.dateStart,
        dateEnd: range.dateEnd,
        isoStart: range.isoStart,
        isoEnd: range.isoEnd,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (reqId !== monthRequestId.current) return;
      if (res.ok) {
        setMonthData(res.data);
      } else {
        setMonthError(res.error);
      }
    } catch {
      if (reqId !== monthRequestId.current) return;
      setMonthError('Failed to load calendar data.');
    } finally {
      if (reqId === monthRequestId.current) {
        setMonthLoading(false);
      }
    }
  }, [year, month]);

  useEffect(() => {
    fetchMonth();
  }, [fetchMonth]);

  // Fetch date detail
  const fetchSelectedDate = useCallback(async () => {
    if (!selectedDate) {
      setDateEvents([]);
      setDateError(null);
      return;
    }

    const reqId = ++dateRequestId.current;
    setDateLoading(true);
    setDateError(null);

    const isoStart = localDateStartISO(selectedDate);
    const isoEnd = localDateEndISO(selectedDate);

    try {
      const res = await getCalendarDateEvents(
        selectedDate,
        isoStart,
        isoEnd,
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      if (reqId !== dateRequestId.current) return;
      if (res.ok) {
        setDateEvents(res.data);
      } else {
        setDateError(res.error);
        setDateEvents([]);
      }
    } catch {
      if (reqId !== dateRequestId.current) return;
      setDateError('Failed to load events for this date.');
      setDateEvents([]);
    } finally {
      if (reqId === dateRequestId.current) setDateLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void fetchSelectedDate();
  }, [fetchSelectedDate]);

  // Search when filters change
  useEffect(() => {
    if (!hasActiveFilters) {
      setSearchResults(null);
      setSearchResultsVisible(false);
      setSearchError(null);
      return;
    }

    const reqId = ++searchRequestId.current;
    setSearchLoading(true);
    setSearchError(null);

    if (searchPage === 1) {
      setSearchResults(null);
    }

    searchCalendarEvents({
      keyword: debouncedKeyword || undefined,
      categoryId: filterCategoryId,
      outcomes: filterOutcomes.length > 0 ? filterOutcomes : undefined,
      eventTypes: filterEventTypes.length > 0 ? filterEventTypes : undefined,
      dateStart: filterDateStart || undefined,
      dateEnd: filterDateEnd || undefined,
      page: searchPage,
      pageSize: 50,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then(res => {
      if (reqId !== searchRequestId.current) return;
      if (res.ok) {
        setSearchResults(prev => {
          if (!prev || searchPage === 1) {
            return res.data;
          }
          // Append and deduplicate by sortKey
          const existingKeys = new Set(prev.events.map(e => e.sortKey));
          const newEvents = res.data.events.filter(e => !existingKeys.has(e.sortKey));
          const mergedEvents = [...prev.events, ...newEvents];

          // Sort in memory to guarantee stable sorting
          mergedEvents.sort(compareEvents);

          return {
            events: mergedEvents,
            hasMore: res.data.hasMore,
            totalCount: res.data.totalCount,
          };
        });
        setSearchResultsVisible(true);
      } else {
        setSearchError(res.error);
      }
      setSearchLoading(false);
    }).catch(() => {
      if (reqId === searchRequestId.current) {
        setSearchError('Search failed.');
        setSearchLoading(false);
      }
    });
  }, [debouncedKeyword, filterCategoryId, filterOutcomes, filterEventTypes, filterDateStart, filterDateEnd, searchPage, hasActiveFilters, searchRetryNonce]);

  // Restore search results scroll position
  useEffect(() => {
    if (searchResultsVisible && resultsRef.current) {
      resultsRef.current.scrollTop = searchResultsScrollPos.current;
    }
  }, [searchResultsVisible]);

  // Calendar grid
  const gridDates = getCalendarGridDates(year, month);
  const gridDateStrings = gridDates.map(d => formatDateLocal(d));

  // Roving keyboard navigation default finder
  const getGridDefaultFocus = useCallback(() => {
    if (selectedDate && gridDateStrings.includes(selectedDate)) {
      return selectedDate;
    }
    if (gridDateStrings.includes(today)) {
      return today;
    }
    // Default to 1st of month
    return formatDateLocal(new Date(year, month, 1));
  }, [year, month, selectedDate, gridDateStrings, today]);

  // Handle focus movement using arrow keys
  const moveFocus = (days: number) => {
    const activeDateStr = focusedDate || getGridDefaultFocus();
    const current = parseDateLocal(activeDateStr);
    const next = new Date(current);
    next.setDate(current.getDate() + days);
    const nextStr = formatDateLocal(next);

    // Sync month navigation if boundary crossed
    if (next.getMonth() !== month || next.getFullYear() !== year) {
      setYear(next.getFullYear());
      setMonth(next.getMonth());
    }
    setFocusedDate(nextStr);

    setTimeout(() => {
      const btn = document.querySelector(`button[data-date="${nextStr}"]`) as HTMLButtonElement;
      if (btn) btn.focus();
    }, 50);
  };

  // Keyboard navigation on day grid cells
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, dateStr: string) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(7);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleDateClick(dateStr);
        break;
      default:
        break;
    }
  };

  // Focus restore effect on mount/state restoration
  useEffect(() => {
    if (savedState) {
      const dateToFocus = savedState.selectedDate || formatDateLocal(new Date(savedState.year, savedState.month, 1));
      setFocusedDate(dateToFocus);
      setTimeout(() => {
        const btn = document.querySelector(`button[data-date="${dateToFocus}"]`) as HTMLButtonElement;
        if (btn) btn.focus();
      }, 100);
    }
  }, [savedState]);

  // Navigation
  const goToPrevMonth = () => {
    setMonth(prev => {
      let newY = year;
      let newM = prev;
      if (prev === 0) { newY = year - 1; newM = 11; }
      else { newM = prev - 1; }
      setYear(newY);
      setFocusedDate(formatDateLocal(new Date(newY, newM, 1)));
      return newM;
    });
  };

  const goToNextMonth = () => {
    setMonth(prev => {
      let newY = year;
      let newM = prev;
      if (prev === 11) { newY = year + 1; newM = 0; }
      else { newM = prev + 1; }
      setYear(newY);
      setFocusedDate(formatDateLocal(new Date(newY, newM, 1)));
      return newM;
    });
  };

  const goToToday = () => {
    const todayY = todayDate.getFullYear();
    const todayM = todayDate.getMonth();
    setYear(todayY);
    setMonth(todayM);
    setSelectedDate(today);
    setFocusedDate(today);
    setTimeout(() => {
      const btn = document.querySelector(`button[data-date="${today}"]`) as HTMLButtonElement;
      if (btn) btn.focus();
    }, 50);
  };

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setFocusedDate(dateStr);
    setHighlightEventKey(null);

    // Navigation if clicked date is in adjacent month
    const d = parseDateLocal(dateStr);
    if (d.getMonth() !== month || d.getFullYear() !== year) {
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  };

  // Search result click
  const handleResultClick = (event: CalendarEvent) => {
    // Save scroll position
    const scrollPos = resultsRef.current ? resultsRef.current.scrollTop : 0;
    searchResultsScrollPos.current = scrollPos;

    // Navigate to the event's month/date
    const d = parseDateLocal(event.eventDate);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(event.eventDate);
    setFocusedDate(event.eventDate);
    setHighlightEventKey(event.sortKey);

    // Collapse results to summary bar
    setSearchResultsVisible(false);

  };

  const handleBackToResults = () => {
    setSearchResultsVisible(true);
    setHighlightEventKey(null);
  };

  const clearAllFilters = () => {
    setKeyword('');
    setDebouncedKeyword('');
    setFilterCategoryId(null);
    setFilterOutcomes([]);
    setFilterEventTypes([]);
    setFilterDateStart('');
    setFilterDateEnd('');
    setSearchPage(1);
    setSearchResults(null);
    setSearchResultsVisible(false);
    setSearchError(null);
    setHighlightEventKey(null);
  };

  const toggleOutcome = (outcome: TaskOutcome) => {
    setFilterOutcomes(prev =>
      prev.includes(outcome) ? prev.filter(o => o !== outcome) : [...prev, outcome]
    );
    setSearchPage(1);
  };

  const toggleEventType = (type: CalendarEventType) => {
    setFilterEventTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
    setSearchPage(1);
  };

  // Group date events by type for the detail panel
  const createdEvents = dateEvents.filter(e => e.eventType === 'created');
  const dueEvents = dateEvents.filter(e => e.eventType === 'due');
  const resultEvents = dateEvents.filter(e => e.eventType === 'result');

  const activeFocusDate = focusedDate || getGridDefaultFocus();

  return (
    <div className="calendar-view">
      {/* Search & Filter */}
      <div className="calendar-search-section">
        <button
          type="button"
          className={`calendar-search-toggle ${searchExpanded ? 'active' : ''}`}
          onClick={() => setSearchExpanded(!searchExpanded)}
          aria-expanded={searchExpanded}
          aria-label="Toggle search and filter"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search &amp; Filter</span>
          {hasActiveFilters && <span className="filter-active-dot" />}
        </button>

        {searchExpanded && (
          <div className="calendar-search-panel">
            {/* Keyword */}
            <div className="search-field">
              <input
                type="text"
                placeholder="Search tasks..."
                value={keyword}
                onChange={e => { setKeyword(e.target.value); setSearchPage(1); }}
                className="calendar-search-input"
                aria-label="Search keyword"
              />
            </div>

            {/* Category filter */}
            <div className="search-field">
              <label className="search-label">Category</label>
              <div className="search-pills">
                <button
                  type="button"
                  className={`search-pill ${filterCategoryId === null ? 'active' : ''}`}
                  onClick={() => { setFilterCategoryId(null); setSearchPage(1); }}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`search-pill ${filterCategoryId === cat.id ? 'active' : ''}`}
                    onClick={() => { setFilterCategoryId(cat.id); setSearchPage(1); }}
                    style={{ '--pill-color': cat.color } as React.CSSProperties}
                  >
                    <span className="pill-dot" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div className="search-field">
              <label className="search-label">Status</label>
              <div className="search-pills">
                {(['pending', 'succeeded', 'failed'] as TaskOutcome[]).map(outcome => (
                  <button
                    key={outcome}
                    type="button"
                    className={`search-pill ${filterOutcomes.includes(outcome) ? 'active' : ''}`}
                    onClick={() => toggleOutcome(outcome)}
                  >
                    {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Event type filter */}
            <div className="search-field">
              <label className="search-label">Event Type</label>
              <div className="search-pills">
                {(['created', 'due', 'result'] as CalendarEventType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`search-pill ${filterEventTypes.includes(type) ? 'active' : ''}`}
                    onClick={() => toggleEventType(type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="search-field search-date-range">
              <label className="search-label">Date Range</label>
              <div className="search-date-inputs">
                <input
                  type="date"
                  value={filterDateStart}
                  onChange={e => { setFilterDateStart(e.target.value); setSearchPage(1); }}
                  className="calendar-date-input"
                  aria-label="Start date"
                />
                <span className="date-range-sep">to</span>
                <input
                  type="date"
                  value={filterDateEnd}
                  onChange={e => { setFilterDateEnd(e.target.value); setSearchPage(1); }}
                  className="calendar-date-input"
                  aria-label="End date"
                />
              </div>
            </div>

            {/* Clear all */}
            {hasActiveFilters && (
              <button type="button" className="clear-filters-btn" onClick={clearAllFilters}>
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Results */}
      {hasActiveFilters && (
        <>
          {searchResultsVisible ? (
            <div
              className="search-results"
              ref={resultsRef}
              onScroll={e => { searchResultsScrollPos.current = e.currentTarget.scrollTop; }}
            >
              {searchError ? (
                <div className="calendar-error">
                  {searchError}
                  <button type="button" onClick={() => setSearchRetryNonce(value => value + 1)} className="retry-btn">
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="search-results-header">
                    <span className="search-results-count">
                      {searchResults?.totalCount ?? 0} result{(searchResults?.totalCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {searchLoading && !searchResults && <div className="calendar-loading">Searching...</div>}

                  {!searchLoading && searchResults && searchResults.events.length === 0 && (
                    <div className="calendar-empty">No events match your filters.</div>
                  )}

                  {searchResults?.events.map(event => (
                    <button
                      key={event.sortKey}
                      type="button"
                      className="search-result-item"
                      onClick={() => handleResultClick(event)}
                    >
                      <div className="result-item-header">
                        <span className={`event-type-badge ${event.eventType}`}>
                          {event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1)}
                        </span>
                        <span className={`event-outcome-badge ${event.outcome}`}>
                          {event.outcome.charAt(0).toUpperCase() + event.outcome.slice(1)}
                        </span>
                      </div>
                      <span className="result-item-title">{event.task.title}</span>
                      <div className="result-item-meta">
                        <span className="result-item-date">{formatDateDisplay(event.eventDate)}</span>
                        {event.task.categoryName && (
                          <span className="result-item-category" style={{ color: event.task.categoryColor }}>
                            {event.task.categoryName}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}

                  {searchResults?.hasMore && (
                    <button
                      type="button"
                      className="load-more-btn"
                      onClick={() => setSearchPage(p => p + 1)}
                      disabled={searchLoading}
                    >
                      {searchLoading ? 'Loading...' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            searchResults && (
              <div className="search-results-summary">
                <span>{searchResults.totalCount} result{searchResults.totalCount !== 1 ? 's' : ''}</span>
                <button type="button" className="back-to-results-btn" onClick={handleBackToResults}>
                  &larr; Back to results
                </button>
              </div>
            )
          )}
        </>
      )}

      {/* Month Header */}
      <div className="calendar-header">
        <button type="button" className="cal-nav-btn" onClick={goToPrevMonth} aria-label="Previous month">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="calendar-month-title">{formatMonthYear(year, month)}</h2>
        <button type="button" className="cal-nav-btn" onClick={goToNextMonth} aria-label="Next month">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button type="button" className="cal-today-btn" onClick={goToToday}>
          Today
        </button>
      </div>

      {/* Weekday headers */}
      <div className="calendar-weekdays">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="calendar-weekday">{label}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid" role="grid" aria-label="Calendar">
        {monthLoading && !monthData && (
          <div className="calendar-loading calendar-grid-overlay">Loading calendar...</div>
        )}
        {monthError && (
          <div className="calendar-error calendar-grid-overlay">
            {monthError}
            <button type="button" onClick={fetchMonth} className="retry-btn">Retry</button>
          </div>
        )}
        {gridDates.map((date, i) => {
          const dateStr = formatDateLocal(date);
          const isCurrentMonth = date.getMonth() === month;
          const isToday = isSameDate(date, todayDate);
          const isSelected = selectedDate === dateStr;
          const isFocused = dateStr === activeFocusDate;
          const summary = monthData?.daySummary[dateStr];

          return (
            <button
              key={i}
              type="button"
              data-date={dateStr}
              className={[
                'calendar-day',
                !isCurrentMonth && 'other-month',
                isToday && 'today',
                isSelected && 'selected',
                summary?.hasFailed && 'has-failed',
              ].filter(Boolean).join(' ')}
              onClick={() => handleDateClick(dateStr)}
              onKeyDown={e => handleKeyDown(e, dateStr)}
              onFocus={() => setFocusedDate(dateStr)}
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${summary ? `, ${summary.taskCount} task${summary.taskCount !== 1 ? 's' : ''}` : ''}`}
              aria-selected={isSelected}
              tabIndex={isFocused ? 0 : -1}
              role="gridcell"
            >
              <span className="day-number">{date.getDate()}</span>
              {summary && summary.taskCount > 0 && (
                <div className="day-indicators">
                  <span className="day-count">{summary.taskCount}</span>
                  {summary.hasFailed && <span className="day-failed-dot" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Date Detail Panel */}
      {selectedDate && (
        <div className="calendar-date-detail">
          <div className="date-detail-header">
            <h3 className="date-detail-title">{formatDateDisplay(selectedDate)}</h3>
            <button
              type="button"
              className="open-in-tasks-btn"
              onClick={() => {
                // Save state through the parent callback
                const state: CalendarSavedState = {
                  year,
                  month,
                  selectedDate,
                  searchExpanded,
                  keyword,
                  filterCategoryId,
                  filterOutcomes,
                  filterEventTypes,
                  filterDateStart,
                  filterDateEnd,
                  searchResults,
                  searchResultsVisible,
                  searchPage,
                  highlightEventKey,
                  searchResultsScrollPos: searchResultsScrollPos.current,
                };
                onOpenInTasks(selectedDate, state);
              }}
            >
              Open in Tasks &rarr;
            </button>
          </div>

          {dateLoading && <div className="calendar-loading">Loading events...</div>}

          {dateError && (
            <div className="calendar-error">
              {dateError}
              <button type="button" onClick={fetchSelectedDate} className="retry-btn">Retry</button>
            </div>
          )}

          {!dateLoading && !dateError && dateEvents.length === 0 && (
            <div className="calendar-empty">No events on this date.</div>
          )}

          {!dateLoading && !dateError && dateEvents.length > 0 && (
            <div className="date-event-groups">
              {createdEvents.length > 0 && (
                <div className="event-group">
                  <div className="event-group-header">
                    <span className="event-type-badge created">Created</span>
                    <span className="event-group-count">{createdEvents.length}</span>
                  </div>
                  {createdEvents.map(event => (
                    <EventCard
                      key={event.sortKey}
                      event={event}
                      highlighted={highlightEventKey === event.sortKey}
                    />
                  ))}
                </div>
              )}

              {dueEvents.length > 0 && (
                <div className="event-group">
                  <div className="event-group-header">
                    <span className="event-type-badge due">Due</span>
                    <span className="event-group-count">{dueEvents.length}</span>
                  </div>
                  {dueEvents.map(event => (
                    <EventCard
                      key={event.sortKey}
                      event={event}
                      highlighted={highlightEventKey === event.sortKey}
                    />
                  ))}
                </div>
              )}

              {resultEvents.length > 0 && (
                <div className="event-group">
                  <div className="event-group-header">
                    <span className="event-type-badge result">
                      {resultEvents.some(e => e.outcome === 'failed') ? 'Completed / Failed' : 'Completed'}
                    </span>
                    <span className="event-group-count">{resultEvents.length}</span>
                  </div>
                  {resultEvents.map(event => (
                    <EventCard
                      key={event.sortKey}
                      event={event}
                      highlighted={highlightEventKey === event.sortKey}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only event card for the date detail panel. */
function EventCard({ event, highlighted }: { event: CalendarEvent; highlighted: boolean }) {
  return (
    <div className={`event-card ${highlighted ? 'highlighted' : ''} ${event.outcome === 'failed' ? 'failed' : ''}`}>
      <div className="event-card-content">
        <span className={`event-card-title ${event.task.completed ? 'completed' : ''}`}>
          {event.task.title}
        </span>
        <div className="event-card-meta">
          <span className={`event-outcome-badge ${event.outcome}`}>
            {event.outcome.charAt(0).toUpperCase() + event.outcome.slice(1)}
          </span>
          {event.task.categoryName && (
            <span className="event-card-category" style={{ color: event.task.categoryColor }}>
              <span className="badge-dot" style={{ backgroundColor: event.task.categoryColor }} />
              {event.task.categoryName}
            </span>
          )}
          {event.task.dueDate && (
            <span className="event-card-due">
              Due: {event.task.dueDate}
            </span>
          )}
        </div>
        {event.task.failureReason && (
          <div className="event-card-failure">
            Reason: {event.task.failureReason}
          </div>
        )}
      </div>
    </div>
  );
}
