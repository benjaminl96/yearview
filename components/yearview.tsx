"use client";

import {
  CalendarDays, Check, ChevronRight, CircleHelp, Clock3, Layers3, LocateFixed,
  LogIn, MapPin, Menu, Minus, MousePointer2, Plus, Search, Settings2, Sparkles,
  Trash2, X,
} from "lucide-react";
import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type CalendarSource = { id: string; summary: string; color: string; visible: boolean; primary?: boolean };
type CalendarEvent = {
  id: string; calendarId: string; title: string; start: string; end: string;
  allDay: boolean; color: string; location?: string; description?: string; reminders?: number[];
};

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: (opts?: Record<string, unknown>) => void } } } };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const COLORS = ["#277a51", "#d96956", "#5479c8", "#9a64c7", "#d49b35", "#3b8a91"];
const BOARD_HEIGHT = 990;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 201 }, (_, index) => CURRENT_YEAR - 100 + index);

const isoDate = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const dayKey = (value: string) => value.slice(0, 10);
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function demoEvents(): CalendarEvent[] {
  const y = CURRENT_YEAR;
  return [
    { id: "demo-1", calendarId: "work", title: "Product offsite", start: `${y}-01-15`, end: `${y}-01-17`, allDay: true, color: COLORS[2], location: "Austin, TX", reminders: [1440] },
    { id: "demo-2", calendarId: "personal", title: "Dinner with Maya", start: `${y}-02-07T19:00:00`, end: `${y}-02-07T21:00:00`, allDay: false, color: COLORS[1], location: "Bar La Grassa", reminders: [60] },
    { id: "demo-3", calendarId: "work", title: "Design review", start: `${y}-02-18T10:00:00`, end: `${y}-02-18T11:00:00`, allDay: false, color: COLORS[2], reminders: [10] },
    { id: "demo-4", calendarId: "personal", title: "Dad’s birthday", start: `${y}-03-11`, end: `${y}-03-12`, allDay: true, color: COLORS[1], reminders: [1440] },
    { id: "demo-5", calendarId: "focus", title: "Deep work", start: `${y}-04-06T09:00:00`, end: `${y}-04-06T12:00:00`, allDay: false, color: COLORS[0] },
    { id: "demo-6", calendarId: "travel", title: "Lisbon", start: `${y}-05-22`, end: `${y}-05-29`, allDay: true, color: COLORS[4], location: "Lisbon, Portugal", reminders: [2880] },
    { id: "demo-7", calendarId: "work", title: "Launch week", start: `${y}-06-09`, end: `${y}-06-14`, allDay: true, color: COLORS[2] },
    { id: "demo-8", calendarId: "personal", title: "Dentist", start: `${y}-07-16T14:30:00`, end: `${y}-07-16T15:30:00`, allDay: false, color: COLORS[1], reminders: [60, 1440] },
    { id: "demo-9", calendarId: "focus", title: "No meetings", start: `${y}-08-03`, end: `${y}-08-04`, allDay: true, color: COLORS[0] },
    { id: "demo-10", calendarId: "travel", title: "Cabin weekend", start: `${y}-09-18`, end: `${y}-09-21`, allDay: true, color: COLORS[4] },
    { id: "demo-11", calendarId: "work", title: "Planning ’27", start: `${y}-10-12T13:00:00`, end: `${y}-10-12T16:00:00`, allDay: false, color: COLORS[2] },
    { id: "demo-12", calendarId: "personal", title: "Thanksgiving", start: `${y}-11-26`, end: `${y}-11-27`, allDay: true, color: COLORS[1] },
    { id: "demo-13", calendarId: "personal", title: "Winter break", start: `${y}-12-21`, end: `${y + 1}-01-03`, allDay: true, color: COLORS[1] },
  ];
}

const INITIAL_CALENDARS: CalendarSource[] = [
  { id: "personal", summary: "Personal", color: COLORS[1], visible: true, primary: true },
  { id: "work", summary: "Work", color: COLORS[2], visible: true },
  { id: "focus", summary: "Focus time", color: COLORS[0], visible: true },
  { id: "travel", summary: "Travel", color: COLORS[4], visible: true },
];

function googleEventToLocal(item: any, calendar: CalendarSource): CalendarEvent {
  const start = item.start?.date ?? item.start?.dateTime ?? new Date().toISOString();
  const end = item.end?.date ?? item.end?.dateTime ?? start;
  return {
    id: item.id, calendarId: calendar.id, title: item.summary || "Untitled event", start, end,
    allDay: Boolean(item.start?.date), color: calendar.color,
    location: item.location, description: item.description,
    reminders: item.reminders?.overrides?.map((r: any) => r.minutes) ?? [],
  };
}

async function googleFetch(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message || "Google Calendar request failed");
  return response.status === 204 ? null : response.json();
}

export default function Yearview() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: .72 });
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [calendars, setCalendars] = useState(INITIAL_CALENDARS);
  const [events, setEvents] = useState<CalendarEvent[]>(demoEvents);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [connectionNote, setConnectionNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const centerYear = useCallback((year: number, nextScale = view.scale) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const index = year - YEARS[0];
    const fittedScale = Math.min(nextScale, Math.max(.42, (viewport.clientWidth - 28) / 1260));
    setView({
      scale: fittedScale,
      x: (viewport.clientWidth - 1260 * fittedScale) / 2,
      y: 42 - index * BOARD_HEIGHT * fittedScale,
    });
  }, [view.scale]);

  useEffect(() => {
    const timer = window.setTimeout(() => { centerYear(CURRENT_YEAR, .82); setReady(true); }, 20);
    fetch("/api/config").then(r => r.json()).then(data => setGoogleClientId(data.googleClientId)).catch(() => null);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.head.appendChild(script);
    return () => { window.clearTimeout(timer); script.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key.toLowerCase() === "t" && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) centerYear(CURRENT_YEAR);
      if (event.key === "Escape") { setSelected(null); setDraftDate(null); setSearchOpen(false); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [centerYear]);

  const visibleCalendarIds = useMemo(() => new Set(calendars.filter(c => c.visible).map(c => c.id)), [calendars]);
  const visibleYears = useMemo(() => {
    const focusIndex = Math.max(0, Math.min(YEARS.length - 1, Math.floor(((340 - view.y) / view.scale) / BOARD_HEIGHT)));
    return YEARS.map((year, index) => ({ year, index })).filter(item => Math.abs(item.index - focusIndex) <= 2);
  }, [view]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      if (!visibleCalendarIds.has(event.calendarId) || (search && !event.title.toLowerCase().includes(search.toLowerCase()))) continue;
      const key = dayKey(event.start);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events, search, visibleCalendarIds]);

  const zoomAt = useCallback((nextScale: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scale = Math.min(1.45, Math.max(.42, nextScale));
    setView(current => {
      const px = (clientX ?? viewport.clientWidth / 2) - viewport.getBoundingClientRect().left;
      const py = (clientY ?? viewport.clientHeight / 2) - viewport.getBoundingClientRect().top;
      const ratio = scale / current.scale;
      return { scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
    });
  }, []);

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) zoomAt(view.scale * Math.exp(-event.deltaY * .006), event.clientX, event.clientY);
    else setView(v => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y };
    event.currentTarget.classList.add("is-panning");
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    setView(v => ({ ...v, x: dragRef.current!.originX + event.clientX - dragRef.current!.x, y: dragRef.current!.originY + event.clientY - dragRef.current!.y }));
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    dragRef.current = null;
    event.currentTarget.classList.remove("is-panning");
  };

  const connectGoogle = () => {
    if (!googleClientId) { setConnectionNote("Add GOOGLE_CLIENT_ID in the Site settings to connect a real Google Calendar. The complete product is available in demo mode right now."); return; }
    if (!window.google) { flash("Google sign-in is still loading — try once more."); return; }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: "https://www.googleapis.com/auth/calendar",
      callback: async (response: any) => {
        if (!response.access_token) return;
        setToken(response.access_token);
        await syncGoogle(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  };

  const syncGoogle = async (accessToken = token) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const list = await googleFetch("/users/me/calendarList", accessToken);
      const liveCalendars: CalendarSource[] = (list.items ?? []).map((item: any, index: number) => ({
        id: item.id, summary: item.summary, color: item.backgroundColor || COLORS[index % COLORS.length], visible: !item.hidden, primary: item.primary,
      }));
      const start = new Date(CURRENT_YEAR - 2, 0, 1).toISOString();
      const end = new Date(CURRENT_YEAR + 3, 0, 1).toISOString();
      const chunks = await Promise.all(liveCalendars.filter(c => c.visible).map(async calendar => {
        const data = await googleFetch(`/calendars/${encodeURIComponent(calendar.id)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&maxResults=2500`, accessToken);
        return (data.items ?? []).filter((item: any) => item.status !== "cancelled").map((item: any) => googleEventToLocal(item, calendar));
      }));
      setCalendars(liveCalendars);
      setEvents(chunks.flat());
      flash("Google Calendar synced");
    } catch (error) { flash(error instanceof Error ? error.message : "Couldn’t sync Google Calendar"); }
    finally { setLoading(false); }
  };

  const saveEvent = async (event: CalendarEvent) => {
    const exists = events.some(item => item.id === event.id);
    if (token) {
      try {
        const body = {
          summary: event.title, location: event.location || undefined, description: event.description || undefined,
          start: event.allDay ? { date: dayKey(event.start) } : { dateTime: event.start },
          end: event.allDay ? { date: dayKey(event.end) } : { dateTime: event.end },
          reminders: event.reminders?.length ? { useDefault: false, overrides: event.reminders.map(minutes => ({ method: "popup", minutes })) } : { useDefault: true },
        };
        const method = exists ? "PUT" : "POST";
        const path = `/calendars/${encodeURIComponent(event.calendarId)}/events${exists ? `/${encodeURIComponent(event.id)}` : ""}`;
        const data = await googleFetch(path, token, { method, body: JSON.stringify(body) });
        const calendar = calendars.find(c => c.id === event.calendarId)!;
        event = googleEventToLocal(data, calendar);
      } catch (error) { flash(error instanceof Error ? error.message : "Couldn’t save event"); return; }
    }
    setEvents(current => exists ? current.map(item => item.id === event.id ? event : item) : [...current, event]);
    setSelected(null); setDraftDate(null); flash(exists ? "Event updated" : "Event created");
  };

  const deleteEvent = async (event: CalendarEvent) => {
    if (token) {
      try { await googleFetch(`/calendars/${encodeURIComponent(event.calendarId)}/events/${encodeURIComponent(event.id)}`, token, { method: "DELETE" }); }
      catch (error) { flash(error instanceof Error ? error.message : "Couldn’t delete event"); return; }
    }
    setEvents(current => current.filter(item => item.id !== event.id));
    setSelected(null); flash("Event deleted");
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#f5f4ef] text-[#18201c]">
      <header className="absolute inset-x-0 top-0 z-40 flex h-[68px] items-center gap-3 border-b border-[#d9ddd7] bg-[#fbfbf8]/95 px-4 backdrop-blur-xl md:px-5">
        <button aria-label="Toggle sidebar" onClick={() => setSidebarOpen(v => !v)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#e9ece7]"><Menu size={19} /></button>
        <button onClick={() => centerYear(CURRENT_YEAR)} className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#1f6f4a] text-white shadow-sm"><Layers3 size={18} /></span>
          <span className="hidden text-[18px] font-bold tracking-[-.04em] sm:inline">Yearview</span>
        </button>
        <div className="mx-1 h-6 w-px bg-[#d9ddd7]" />
        <button onClick={() => centerYear(CURRENT_YEAR)} className="rounded-full border border-[#cfd5cf] bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:border-[#aeb8b0]">Today</button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setSearchOpen(true)} className="desktop-only flex h-10 w-[220px] items-center gap-2 rounded-full border border-[#d9ddd7] bg-white px-3.5 text-sm text-[#6c756f] shadow-sm hover:border-[#b9c1bb]">
            <Search size={16} /><span>Search events</span><span className="ml-auto rounded-md bg-[#eef0ec] px-1.5 py-0.5 text-[11px]">⌘K</span>
          </button>
          <button aria-label="Help" className="desktop-only grid h-10 w-10 place-items-center rounded-full hover:bg-[#e9ece7]"><CircleHelp size={18} /></button>
          <button onClick={connectGoogle} className={`flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition ${token ? "bg-[#dcece3] text-[#15583a]" : "bg-[#1f6f4a] text-white hover:bg-[#15583a]"}`}>
            {token ? <Check size={16} /> : <LogIn size={16} />}<span className="hidden sm:inline">{token ? "Google connected" : "Connect Google"}</span>
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-[#e2a277] text-sm font-bold text-white">B</button>
        </div>
      </header>

      <aside className={`absolute bottom-0 left-0 top-[68px] z-30 w-[230px] border-r border-[#d9ddd7] bg-[#fbfbf8]/96 px-4 py-5 backdrop-blur-xl transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button onClick={() => setDraftDate(new Date().toISOString().slice(0, 10))} className="soft-shadow mb-7 flex w-full items-center gap-3 rounded-2xl bg-[#1f6f4a] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#15583a]"><Plus size={19} />Create event</button>
        <div className="mb-3 flex items-center justify-between px-1"><span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#7a837d]">My calendars</span><button aria-label="Calendar options"><Settings2 size={15} /></button></div>
        <div className="space-y-1">
          {calendars.map(calendar => <button key={calendar.id} onClick={() => setCalendars(items => items.map(item => item.id === calendar.id ? { ...item, visible: !item.visible } : item))} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-[#eef0ec]">
            <span className="grid h-4 w-4 place-items-center rounded-[5px]" style={{ background: calendar.visible ? calendar.color : "transparent", border: `1.5px solid ${calendar.color}` }}>{calendar.visible && <Check size={11} className="text-white" strokeWidth={3} />}</span>
            <span className="truncate">{calendar.summary}</span>{calendar.primary && <span className="ml-auto text-[9px] font-bold uppercase text-[#8a928d]">Main</span>}
          </button>)}
        </div>
        <div className="my-6 h-px bg-[#e0e3df]" />
        <div className="rounded-2xl bg-[#eef1ec] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold"><MousePointer2 size={14} />Navigate the canvas</div>
          <p className="text-[11px] leading-relaxed text-[#6d756f]">Drag to travel through time. Pinch or hold <b>⌘</b> while scrolling to zoom.</p>
        </div>
        <div className="absolute bottom-5 left-4 right-4 flex items-center gap-2 text-[11px] text-[#818984]"><Sparkles size={13} />{token ? "Live Google data" : "Interactive demo data"}</div>
      </aside>

      <section
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="calendar-canvas absolute bottom-0 right-0 top-[68px] overflow-hidden"
        style={{ left: sidebarOpen ? 230 : 0 }}
      >
        <div className={`absolute left-0 top-0 origin-top-left transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`} style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
          {visibleYears.map(({ year, index }) => <YearBoard key={year} year={year} y={index * BOARD_HEIGHT} eventsByDate={eventsByDate} zoom={view.scale} onDay={setDraftDate} onEvent={setSelected} />)}
        </div>
      </section>

      <div className="absolute bottom-5 right-5 z-30 flex items-center gap-1 rounded-2xl border border-[#d9ddd7] bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <button aria-label="Zoom out" onClick={() => zoomAt(view.scale - .12)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-[#eef0ec]"><Minus size={17} /></button>
        <span className="w-12 text-center text-xs font-bold tabular-nums">{Math.round(view.scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => zoomAt(view.scale + .12)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-[#eef0ec]"><Plus size={17} /></button>
        <div className="mx-1 h-6 w-px bg-[#d9ddd7]" />
        <button aria-label="Go to today" onClick={() => centerYear(CURRENT_YEAR)} className="grid h-9 w-9 place-items-center rounded-xl text-[#1f6f4a] hover:bg-[#e5eee8]"><LocateFixed size={17} /></button>
      </div>

      {loading && <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-[#18201c] px-4 py-2 text-xs font-semibold text-white shadow-lg">Syncing your calendars…</div>}
      {toast && <div className="absolute bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#18201c] px-4 py-2.5 text-sm font-semibold text-white shadow-xl">{toast}</div>}
      {(selected || draftDate) && <EventEditor event={selected} initialDate={draftDate} calendars={calendars} onClose={() => { setSelected(null); setDraftDate(null); }} onSave={saveEvent} onDelete={deleteEvent} />}
      {searchOpen && <SearchPanel value={search} setValue={setSearch} events={events} onClose={() => setSearchOpen(false)} onSelect={event => { setSelected(event); setSearchOpen(false); }} />}
      {connectionNote && <InfoModal onClose={() => setConnectionNote(null)}>{connectionNote}</InfoModal>}
    </main>
  );
}

function YearBoard({ year, y, eventsByDate, zoom, onDay, onEvent }: { year: number; y: number; eventsByDate: Map<string, CalendarEvent[]>; zoom: number; onDay: (date: string) => void; onEvent: (event: CalendarEvent) => void }) {
  return <div className="year-board absolute left-0" style={{ top: y }}>
    <div className="mb-5 flex items-end justify-between border-b-2 border-[#25352c] pb-3">
      <div className="flex items-baseline gap-4"><h2 className="text-[56px] font-black leading-none tracking-[-.075em]">{year}</h2>{year === CURRENT_YEAR && <span className="rounded-full bg-[#1f6f4a] px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-white">This year</span>}</div>
      <span className="pb-1 text-sm font-medium text-[#707972]">{year % 4 === 0 ? "366 days · leap year" : "365 days"}</span>
    </div>
    <div className="grid grid-cols-4 gap-4">
      {MONTHS.map((month, monthIndex) => <MonthCard key={month} year={year} month={monthIndex} eventsByDate={eventsByDate} zoom={zoom} onDay={onDay} onEvent={onEvent} />)}
    </div>
  </div>;
}

function MonthCard({ year, month, eventsByDate, zoom, onDay, onEvent }: { year: number; month: number; eventsByDate: Map<string, CalendarEvent[]>; zoom: number; onDay: (date: string) => void; onEvent: (event: CalendarEvent) => void }) {
  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  return <article className="month-card overflow-hidden rounded-[18px] border border-[#d9ddd7] bg-[#fbfbf8]">
    <div className="flex items-center justify-between border-b border-[#e1e4df] px-3.5 py-2.5"><h3 className="text-[15px] font-bold tracking-[-.025em]">{MONTHS[month]}</h3><span className="text-[10px] font-semibold text-[#929993]">{String(month + 1).padStart(2, "0")}</span></div>
    <div className="month-grid border-b border-[#e7e9e5] bg-[#f1f2ee] px-1.5 py-1.5">{WEEKDAYS.map((day, index) => <span key={index} className="text-center text-[9px] font-bold text-[#89918b]">{day}</span>)}</div>
    <div className="month-grid p-1.5">
      {Array.from({ length: 42 }, (_, index) => {
        const day = index - first + 1;
        const valid = day > 0 && day <= total;
        const key = valid ? isoDate(year, month, day) : "";
        const dayEvents = valid ? eventsByDate.get(key) ?? [] : [];
        const isToday = valid && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        return <button key={index} disabled={!valid} onClick={() => valid && onDay(key)} className={`day-cell group relative min-w-0 rounded-[7px] px-0.5 pt-0.5 text-left transition ${valid ? "hover:bg-[#edf1ec]" : "opacity-0"}`}>
          {valid && <><span className={`mb-0.5 grid h-[15px] w-[15px] place-items-center rounded-full text-[9px] font-semibold ${isToday ? "bg-[#1f6f4a] text-white" : "text-[#4f5852]"}`}>{day}</span>
          <span className="block space-y-[2px]">{dayEvents.slice(0, zoom < .58 ? 1 : 2).map(event => <span key={event.id} onClick={e => { e.stopPropagation(); onEvent(event); }} className="event-pill block rounded-[3px] px-1 py-[1px] text-[7.5px] font-bold leading-[10px] text-white" style={{ background: event.color }}>{zoom < .5 ? "" : event.title}</span>)}</span>
          {dayEvents.length > 2 && zoom >= .58 && <span className="absolute bottom-0 right-1 text-[7px] font-bold text-[#737c76]">+{dayEvents.length - 2}</span>}</>}
        </button>;
      })}
    </div>
  </article>;
}

function EventEditor({ event, initialDate, calendars, onClose, onSave, onDelete }: { event: CalendarEvent | null; initialDate: string | null; calendars: CalendarSource[]; onClose: () => void; onSave: (event: CalendarEvent) => void; onDelete: (event: CalendarEvent) => void }) {
  const baseDate = initialDate ?? dayKey(event?.start ?? new Date().toISOString());
  const defaultCalendar = calendars.find(c => c.primary) ?? calendars[0];
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(baseDate);
  const [time, setTime] = useState(event && !event.allDay ? event.start.slice(11, 16) : "09:00");
  const [endTime, setEndTime] = useState(event && !event.allDay ? event.end.slice(11, 16) : "10:00");
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? defaultCalendar?.id ?? "personal");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [reminder, setReminder] = useState(event?.reminders?.[0]?.toString() ?? "30");
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!title.trim()) return;
    const calendar = calendars.find(c => c.id === calendarId) ?? defaultCalendar;
    const start = allDay ? date : `${date}T${time}:00`;
    const end = allDay ? new Date(new Date(`${date}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : `${date}T${endTime}:00`;
    onSave({ id: event?.id ?? uid(), calendarId, title: title.trim(), start, end, allDay, color: calendar?.color ?? COLORS[0], location, description, reminders: reminder === "none" ? [] : [Number(reminder)] });
  };
  return <div className="modal-backdrop absolute inset-0 z-[60] grid place-items-center bg-[#18201c]/25 p-4 backdrop-blur-[3px]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form onSubmit={submit} className="modal-card soft-shadow w-full max-w-[510px] overflow-hidden rounded-[24px] border border-white/80 bg-[#fbfbf8]">
      <div className="flex items-center justify-between border-b border-[#e0e3df] px-6 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7c857f]">{event ? "Edit event" : "New event"}</p><h2 className="text-lg font-bold tracking-[-.03em]">{event ? "Make it fit your year" : "Add something to your year"}</h2></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#ecefea]"><X size={18} /></button></div>
      <div className="space-y-4 p-6">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" className="w-full border-0 border-b-2 border-[#cad1cb] bg-transparent px-0 py-2 text-[25px] font-bold tracking-[-.04em] outline-none placeholder:text-[#aeb5b0] focus:border-[#1f6f4a]" />
        <div className="grid grid-cols-[22px_1fr] gap-3"><CalendarDays size={17} className="mt-2.5 text-[#778079]" /><div className="flex flex-wrap gap-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border border-[#d6dbd6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f6f4a]" />{!allDay && <><input type="time" value={time} onChange={e => setTime(e.target.value)} className="rounded-xl border border-[#d6dbd6] bg-white px-3 py-2 text-sm" /><span className="self-center text-xs text-[#7b837e]">to</span><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="rounded-xl border border-[#d6dbd6] bg-white px-3 py-2 text-sm" /></>}<label className="ml-auto flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="accent-[#1f6f4a]" />All day</label></div></div>
        <Field icon={<Layers3 size={17} />}><select value={calendarId} onChange={e => setCalendarId(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none">{calendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}</select></Field>
        <Field icon={<MapPin size={17} />}><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Add location" className="w-full bg-transparent py-2 text-sm outline-none" /></Field>
        <Field icon={<Clock3 size={17} />}><select value={reminder} onChange={e => setReminder(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none"><option value="none">No reminder</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></Field>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add notes or a description" rows={2} className="w-full resize-none rounded-xl border border-[#d6dbd6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1f6f4a]" />
      </div>
      <div className="flex items-center gap-2 border-t border-[#e0e3df] bg-[#f3f4f0] px-6 py-4">{event && <button type="button" onClick={() => onDelete(event)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#b74f43] hover:bg-[#f7e5e2]"><Trash2 size={16} />Delete</button>}<button type="button" onClick={onClose} className="ml-auto rounded-xl px-4 py-2 text-sm font-semibold hover:bg-[#e7eae6]">Cancel</button><button type="submit" className="rounded-xl bg-[#1f6f4a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#15583a]">{event ? "Save changes" : "Create event"}</button></div>
    </form>
  </div>;
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <div className="grid grid-cols-[22px_1fr] items-center gap-3 border-b border-[#e2e5e1] text-[#778079]">{icon}<div className="text-[#263029]">{children}</div></div>; }

function SearchPanel({ value, setValue, events, onClose, onSelect }: { value: string; setValue: (value: string) => void; events: CalendarEvent[]; onClose: () => void; onSelect: (event: CalendarEvent) => void }) {
  const results = value ? events.filter(event => event.title.toLowerCase().includes(value.toLowerCase())).slice(0, 8) : events.slice(0, 6);
  return <div className="modal-backdrop absolute inset-0 z-[65] flex justify-center bg-[#18201c]/20 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal-card soft-shadow h-fit w-full max-w-[590px] overflow-hidden rounded-[22px] border border-white/70 bg-[#fbfbf8]"><div className="flex items-center gap-3 border-b border-[#dfe3de] px-4"><Search size={20} className="text-[#68716b]" /><input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="Search every event in your year…" className="h-14 flex-1 bg-transparent text-[16px] outline-none" /><button onClick={onClose} className="rounded-lg bg-[#e9ece7] px-2 py-1 text-[10px] font-bold text-[#737b75]">ESC</button></div><div className="max-h-[390px] overflow-auto p-2">{results.length ? results.map(event => <button key={event.id} onClick={() => onSelect(event)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#edf0eb]"><span className="h-9 w-1 rounded-full" style={{ background: event.color }} /><span><span className="block text-sm font-semibold">{event.title}</span><span className="text-xs text-[#727b74]">{new Date(event.start).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span></span><ChevronRight size={16} className="ml-auto text-[#929a94]" /></button>) : <div className="p-8 text-center text-sm text-[#747d77]">No events found. The year is wide open.</div>}</div></div></div>;
}

function InfoModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop absolute inset-0 z-[70] grid place-items-center bg-[#18201c]/25 p-4 backdrop-blur-[3px]" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal-card soft-shadow w-full max-w-md rounded-[22px] bg-[#fbfbf8] p-6"><div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#dfece4] text-[#1f6f4a]"><LogIn size={20} /></div><h2 className="mb-2 text-xl font-bold tracking-[-.03em]">Google connection setup</h2><p className="text-sm leading-relaxed text-[#68716b]">{children}</p><button onClick={onClose} className="mt-6 w-full rounded-xl bg-[#1f6f4a] px-4 py-2.5 text-sm font-semibold text-white">Got it</button></div></div>; }
