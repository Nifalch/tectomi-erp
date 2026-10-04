"use client";

import { useMemo, useState } from "react";
import {
  addMonths, addWeeks, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameDay, isSameMonth, isToday, isWithinInterval,
  setHours, setMinutes, differenceInMinutes, parseISO,
} from "date-fns";
import {
  Plus, ChevronLeft, ChevronRight, Trash2, MapPin, Clock,
  Calendar as CalendarIcon, Users, Building2, ExternalLink,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useCalendarEvents, useHolidays } from "@/lib/api/hooks";
import {
  useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent,
} from "@/lib/api/mutations";
import { toArray, cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────
type EventType = "MEETING" | "APPOINTMENT" | "REMINDER" | "EVENT";

interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
  organizer?: { firstName?: string; lastName?: string } | null;
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  type?: string;
}

// All items rendered on the calendar are normalised to this shape so the
// views don't have to special-case holidays vs events.
interface CalendarItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  kind: "event" | "holiday";
  type: EventType | "HOLIDAY";
  source?: CalendarEvent; // only set for kind=event
  location?: string;
}

const VIEWS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "agenda", label: "Agenda" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

// Type → colour tokens. Holidays get the gray track so they're visible but
// don't compete with real events for attention.
const TYPE_STYLES: Record<string, { dot: string; badge: string; bar: string }> = {
  MEETING:     { dot: "bg-sky-500",     badge: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",         bar: "bg-sky-500" },
  APPOINTMENT: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200", bar: "bg-emerald-500" },
  REMINDER:    { dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200", bar: "bg-amber-500" },
  EVENT:       { dot: "bg-violet-500",  badge: "bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200", bar: "bg-violet-500" },
  HOLIDAY:     { dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300", bar: "bg-slate-400" },
};

const TYPE_OPTIONS = [
  { value: "MEETING",     label: "Meeting" },
  { value: "APPOINTMENT", label: "Appointment" },
  { value: "REMINDER",    label: "Reminder" },
  { value: "EVENT",       label: "Event" },
];

// Week view's visible hours. Anything outside this band is hidden — we
// scroll past midnight events rather than render a 24-row column.
const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 21; // exclusive
const WEEK_HOURS = Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR }, (_, i) => WEEK_START_HOUR + i);
const HOUR_HEIGHT = 56; // px per hour row

// ── Page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const eventsQuery = useCalendarEvents();
  const holidaysQuery = useHolidays();

  const [view, setView] = useState<ViewKey>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date()); // the date we're navigated to

  // Dialog state — used for both create and edit; `editingId` is null on create.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("MEETING");
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date | undefined>();
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CalendarItem | undefined>();

  const createMutation = useCreateCalendarEvent();
  const updateMutation = useUpdateCalendarEvent(editingId ?? "");
  const deleteMutation = useDeleteCalendarEvent();

  // Normalise both data sources into a unified `CalendarItem[]`.
  const items: CalendarItem[] = useMemo(() => {
    const evs = toArray<CalendarEvent>(eventsQuery.data);
    const hols = toArray<Holiday>(holidaysQuery.data);
    const normEvents: CalendarItem[] = evs.map((e) => {
      const s = parseISO(e.startTime);
      const en = e.endTime ? parseISO(e.endTime) : s;
      return {
        id: e.id,
        title: e.title,
        start: s,
        end: en,
        allDay: false,
        kind: "event",
        type: e.type,
        source: e,
        location: e.location ?? undefined,
      };
    });
    const normHolidays: CalendarItem[] = hols.map((h) => {
      const d = parseISO(h.date);
      // Holidays span the whole day for the calendar's purposes.
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const en = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      return {
        id: `holiday-${h.id}`,
        title: h.name,
        start: s,
        end: en,
        allDay: true,
        kind: "holiday",
        type: "HOLIDAY",
      };
    });
    return [...normEvents, ...normHolidays].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [eventsQuery.data, holidaysQuery.data]);

  if (eventsQuery.isLoading || holidaysQuery.isLoading) return <LoadingState label="Loading calendar..." />;
  if (eventsQuery.isError) return <ErrorState label="Unable to load events." />;

  // ── Dialog open helpers ──
  const openCreateAt = (anchorDate: Date, hour?: number) => {
    setEditingId(null);
    setTitle(""); setType("MEETING"); setLocation(""); setDescription("");
    const s = new Date(anchorDate);
    s.setHours(hour ?? 9, 0, 0, 0);
    setStart(s);
    const e = new Date(s);
    e.setHours(s.getHours() + 1);
    setEnd(e);
    setDialogOpen(true);
  };
  const openEdit = (item: CalendarItem) => {
    if (item.kind !== "event" || !item.source) return; // holidays are read-only
    setEditingId(item.id);
    setTitle(item.source.title);
    setType(item.source.type);
    setStart(parseISO(item.source.startTime));
    setEnd(item.source.endTime ? parseISO(item.source.endTime) : undefined);
    setLocation(item.source.location ?? "");
    setDescription(item.source.description ?? "");
    setDialogOpen(true);
  };

  const submit = () => {
    const payload = {
      title: title.trim(),
      type,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      location: location.trim() || undefined,
      description: description.trim() || undefined,
    };
    if (!payload.title) return;
    if (editingId) {
      updateMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  // Navigation: prev/next changes meaning per view.
  const goPrev = () => {
    if (view === "month") setCursor((c) => addMonths(c, -1));
    else if (view === "week") setCursor((c) => addWeeks(c, -1));
    else setCursor((c) => addDays(c, -7));
  };
  const goNext = () => {
    if (view === "month") setCursor((c) => addMonths(c, 1));
    else if (view === "week") setCursor((c) => addWeeks(c, 1));
    else setCursor((c) => addDays(c, 7));
  };
  const goToday = () => setCursor(new Date());

  const cursorLabel =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "MMM d, yyyy")}`
        : "Upcoming";

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="dashboard"
        title="Calendar"
        description="Schedule meetings, appointments, and reminders. Holidays show as a gray strip."
        primaryAction={{ label: "New Event", icon: <Plus className="mr-1 size-4" />, onClick: () => openCreateAt(new Date()) }}
        counts={[
          { label: "events", value: items.filter((i) => i.kind === "event").length },
          { label: "holidays", value: items.filter((i) => i.kind === "holiday").length, tone: "neutral" },
        ]}
      />

      {/* Toolbar: view toggle + nav + period label */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-3 dark:bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goToday}>Today</Button>
          <Button variant="ghost" size="sm" onClick={goPrev} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-2 text-base font-semibold">{cursorLabel}</h2>
        </div>
        <div className="inline-flex rounded-xl border border-border p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                view === v.key
                  ? "bg-slate-900 text-white dark:bg-white/10"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend chip strip — quick reference for what each colour means. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {Object.entries({
          MEETING: "Meeting",
          APPOINTMENT: "Appointment",
          REMINDER: "Reminder",
          EVENT: "Event",
          HOLIDAY: "Holiday",
        }).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", TYPE_STYLES[k].dot)} />
            {label}
          </span>
        ))}
      </div>

      {view === "month" && (
        <MonthView
          cursor={cursor}
          items={items}
          onCellClick={(d) => openCreateAt(d, 9)}
          onItemClick={openEdit}
        />
      )}
      {view === "week" && (
        <WeekView
          cursor={cursor}
          items={items}
          onSlotClick={(d, hour) => openCreateAt(d, hour)}
          onItemClick={openEdit}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          items={items}
          onItemClick={openEdit}
          onDelete={(item) => setDeleteTarget(item)}
        />
      )}

      {/* Create / edit dialog — shared so we don't double-maintain the form. */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project kickoff with Acme" autoFocus />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type">
                <Select value={type} onValueChange={(v) => setType(v as EventType)} options={TYPE_OPTIONS} />
              </FormField>
              <FormField label="Location">
                {/* Input + adjoining "Open" affordance. When the value is a
                    URL we show a small external-link button so the user can
                    open the meeting straight from the edit dialog without
                    selecting the text first. Pure-text addresses keep the
                    button hidden. */}
                <div className="flex items-stretch gap-2">
                  <div className="flex-1">
                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Conference room / Zoom URL" />
                  </div>
                  {isOpenableUrl(location) && (
                    <a
                      href={toOpenableHref(location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center gap-1 rounded-2xl border border-border bg-white px-3 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:bg-slate-900/60 dark:text-sky-400 dark:hover:bg-slate-800"
                      title={location.trim()}
                    >
                      <ExternalLink className="size-3.5" /> Open
                    </a>
                  )}
                </div>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date">
                <DatePicker
                  value={start}
                  onChange={(d) => {
                    if (!d) return;
                    const next = new Date(d);
                    next.setHours(start.getHours(), start.getMinutes(), 0, 0);
                    setStart(next);
                  }}
                />
              </FormField>
              <FormField label="Start Time">
                <Input
                  type="time"
                  value={toTimeStr(start)}
                  onChange={(e) => setStart(applyTime(start, e.target.value))}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="End Date">
                <DatePicker
                  value={end}
                  onChange={(d) => {
                    if (!d) return setEnd(undefined);
                    const base = end ?? new Date(start.getTime() + 60 * 60 * 1000);
                    const next = new Date(d);
                    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
                    setEnd(next);
                  }}
                />
              </FormField>
              <FormField label="End Time">
                <Input
                  type="time"
                  value={toTimeStr(end)}
                  onChange={(e) => setEnd(applyTime(end ?? new Date(start.getTime() + 60 * 60 * 1000), e.target.value))}
                />
              </FormField>
            </div>
            <FormField label="Description">
              <TextArea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Agenda, link, attendees, prep notes..."
              />
              {/* TextArea isn't clickable, so we surface any URLs/emails in
                  the description as small openable chips right below it.
                  Keeps the textarea editable while still giving the user a
                  way to launch the link from the dialog. */}
              {extractLinks(description).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {extractLinks(description).map((href, i) => (
                    <a
                      key={`${href}-${i}`}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-300"
                      title={href}
                    >
                      <ExternalLink className="size-3" />
                      <span className="truncate">{linkLabel(href)}</span>
                    </a>
                  ))}
                </div>
              )}
            </FormField>
          </div>
          <DialogFooter>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const item = items.find((i) => i.id === editingId);
                  if (item) setDeleteTarget(item);
                  setDialogOpen(false);
                }}
                className="mr-auto text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="mr-1 size-4" /> Delete
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={!title.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? "Saving…"
                : editingId ? "Save changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(undefined); }}
        title="Delete event"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget && deleteTarget.kind === "event") {
            deleteMutation.mutate(deleteTarget.source!.id, {
              onSuccess: () => setDeleteTarget(undefined),
            });
          }
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Month view ───────────────────────────────────────────────────────────
function MonthView({
  cursor,
  items,
  onCellClick,
  onItemClick,
}: {
  cursor: Date;
  items: CalendarItem[];
  onCellClick: (d: Date) => void;
  onItemClick: (item: CalendarItem) => void;
}) {
  // Days to render — extends to the full week boundaries so we always have
  // a 6-row grid that doesn't shift visually as months change.
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-slate-900/60">
      <div className="grid grid-cols-7 border-b border-border bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayItems = items
            .filter((it) => isSameDay(it.start, day))
            .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
          const inMonth = isSameMonth(day, cursor);
          const today = isToday(day);
          const visible = dayItems.slice(0, 3);
          const extra = dayItems.length - visible.length;

          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onCellClick(day)}
              className={cn(
                "group flex min-h-[110px] flex-col gap-1 border-b border-r border-border/60 p-1.5 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
                !inMonth && "bg-slate-50/40 dark:bg-slate-900/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs",
                    today ? "bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900" : "text-slate-500",
                    !inMonth && !today && "text-slate-300",
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
              {visible.map((it) => (
                <span
                  key={it.id}
                  onClick={(e) => { e.stopPropagation(); onItemClick(it); }}
                  className={cn(
                    "truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                    TYPE_STYLES[it.type].badge,
                  )}
                  title={`${it.title}${it.allDay ? "" : ` · ${format(it.start, "HH:mm")}`}`}
                >
                  {!it.allDay && <span className="opacity-70">{format(it.start, "HH:mm")} </span>}
                  {it.title}
                </span>
              ))}
              {extra > 0 && (
                <span className="px-1.5 text-[10px] text-slate-400">+{extra} more</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view ────────────────────────────────────────────────────────────
function WeekView({
  cursor,
  items,
  onSlotClick,
  onItemClick,
}: {
  cursor: Date;
  items: CalendarItem[];
  onSlotClick: (d: Date, hour: number) => void;
  onItemClick: (item: CalendarItem) => void;
}) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // All-day strip lives above the timed grid so holidays / multi-day spans
  // don't fight with hourly events for real estate.
  const allDayByDay = days.map((d) => items.filter((i) => i.allDay && isSameDay(i.start, d)));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-slate-900/60">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-slate-50 text-xs dark:bg-slate-900">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="px-2 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{format(d, "EEE")}</div>
            <div
              className={cn(
                "mt-0.5 inline-flex size-7 items-center justify-center rounded-full text-sm",
                isToday(d) ? "bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900" : "text-slate-700 dark:text-slate-300",
              )}
            >
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* All-day strip */}
      {allDayByDay.some((a) => a.length > 0) && (
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-slate-50/60 dark:bg-slate-900/40">
          <div className="flex items-center justify-end px-2 py-1.5 text-[10px] uppercase tracking-wide text-slate-400">All-day</div>
          {allDayByDay.map((dayItems, i) => (
            <div key={i} className="flex flex-col gap-0.5 px-1 py-1">
              {dayItems.map((it) => (
                <span
                  key={it.id}
                  onClick={() => onItemClick(it)}
                  className={cn(
                    "cursor-pointer truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                    TYPE_STYLES[it.type].badge,
                  )}
                >
                  {it.title}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Timed grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)]">
        {/* Hour axis */}
        <div>
          {WEEK_HOURS.map((h) => (
            <div
              key={h}
              className="border-b border-border/70 pr-2 pt-1 text-right text-[10px] text-slate-400"
              style={{ height: HOUR_HEIGHT }}
            >
              {format(setHours(new Date(), h), "ha")}
            </div>
          ))}
        </div>
        {/* 7 day columns */}
        {days.map((day) => {
          const dayItems = items.filter(
            (i) => !i.allDay && isSameDay(i.start, day),
          );
          return (
            <div key={day.toISOString()} className="relative border-l border-border/70">
              {/* Hour slot click targets */}
              {WEEK_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSlotClick(day, h)}
                  className="w-full border-b border-border/70 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  style={{ height: HOUR_HEIGHT }}
                  aria-label={`Add event at ${format(setHours(new Date(), h), "ha")}`}
                />
              ))}
              {/* Positioned event blocks */}
              {dayItems.map((it) => {
                const startMin = it.start.getHours() * 60 + it.start.getMinutes();
                const visibleStartMin = WEEK_START_HOUR * 60;
                const visibleEndMin = WEEK_END_HOUR * 60;
                const endMin = Math.max(
                  startMin + 30,
                  it.end.getHours() * 60 + it.end.getMinutes(),
                );
                // Clip to visible window so off-hours events still appear as edge slivers.
                const top = Math.max(0, (startMin - visibleStartMin) / 60) * HOUR_HEIGHT;
                const bottom = Math.min(visibleEndMin, endMin) - visibleStartMin;
                if (bottom <= 0 || top >= (visibleEndMin - visibleStartMin) / 60 * HOUR_HEIGHT) return null;
                const height = Math.max(20, (bottom / 60) * HOUR_HEIGHT - top);
                return (
                  <div
                    key={it.id}
                    onClick={() => onItemClick(it)}
                    style={{ top, height }}
                    className={cn(
                      "absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md p-1.5 text-[11px] shadow-sm transition hover:shadow-md",
                      TYPE_STYLES[it.type].badge,
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <span className={cn("inline-block size-1.5 rounded-full", TYPE_STYLES[it.type].dot)} />
                      <span className="truncate font-medium">{it.title}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-70">
                      {format(it.start, "HH:mm")}
                      {differenceInMinutes(it.end, it.start) > 0 && ` – ${format(it.end, "HH:mm")}`}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Agenda view ──────────────────────────────────────────────────────────
function AgendaView({
  items,
  onItemClick,
  onDelete,
}: {
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}) {
  // Group by yyyy-MM-dd; only show today and forward — past entries clutter
  // the upcoming view (Month/Week handle history).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = items.filter((i) => i.start >= today || isSameDay(i.start, today));

  const groups: Record<string, CalendarItem[]> = {};
  for (const i of upcoming) {
    const key = format(i.start, "yyyy-MM-dd");
    (groups[key] ??= []).push(i);
  }
  const dateKeys = Object.keys(groups).sort();

  if (dateKeys.length === 0) {
    return (
      <Card>
        <div className="py-12 text-center text-sm text-slate-400">
          Nothing scheduled. Click <strong>New Event</strong> or pick a slot from Month/Week view.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {dateKeys.map((key) => {
        const day = parseISO(key);
        const dayItems = groups[key];
        return (
          <section key={key}>
            <div className="mb-2 flex items-baseline gap-3">
              <h3 className="text-sm font-semibold">{format(day, "EEEE, MMMM d")}</h3>
              <span className="text-xs text-slate-400">{format(day, "yyyy")}</span>
              {isToday(day) && <Badge tone="info" size="sm">Today</Badge>}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {dayItems.map((it) => (
                <Card key={it.id} className="group relative cursor-pointer transition hover:shadow-md" onClick={() => onItemClick(it)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-full", TYPE_STYLES[it.type].dot)} />
                      <span className="font-medium text-slate-900 dark:text-white">{it.title}</span>
                    </div>
                    <Badge tone="neutral" size="sm">{it.type}</Badge>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      <span>
                        {it.allDay
                          ? "All day"
                          : `${format(it.start, "HH:mm")}${differenceInMinutes(it.end, it.start) > 0 ? ` – ${format(it.end, "HH:mm")}` : ""}`}
                      </span>
                    </div>
                    {it.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        <LocationField value={it.location} />
                      </div>
                    )}
                    {it.source?.description && (
                      <Linkified text={it.source.description} className="line-clamp-2 text-xs text-slate-500" />
                    )}
                    {it.source?.organizer && (
                      <div className="flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        <span>{it.source.organizer.firstName} {it.source.organizer.lastName}</span>
                      </div>
                    )}
                    {it.kind === "holiday" && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5" />
                        <span>Company holiday</span>
                      </div>
                    )}
                  </div>
                  {it.kind === "event" && (
                    <button
                      type="button"
                      className="absolute right-2 top-2 hidden text-red-500 group-hover:flex"
                      onClick={(e) => { e.stopPropagation(); onDelete(it); }}
                      aria-label="Delete event"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Linkified text bits ──────────────────────────────────────────────────
// Three patterns:
//   1. Full URLs starting with http(s)://
//   2. Bare domains like youtube.com/x, www.example.com, zoom.us/j/123 —
//      anything that looks like host.tld optionally followed by a path.
//      Requires the TLD-ish suffix (2+ letters) and at least one dot, so
//      "Room 5.A" stays plain text.
//   3. Email addresses → mailto:
// Trailing punctuation isn't captured (regex stops at whitespace / <).
const URL_REGEX = /(https?:\/\/[^\s<]+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<]*)?|\b[\w.+-]+@[\w-]+\.[\w.-]+)/gi;

/** Splits a string into runs of plain text and clickable anchors. Stops
 *  click propagation so clicking a link inside an Agenda card doesn't also
 *  open the edit dialog. */
function Linkified({ text, className }: { text: string; className?: string }) {
  const parts: Array<{ text: string; href: string | null }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_REGEX)) {
    const raw = m[0];
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ text: text.slice(last, idx), href: null });
    const href = raw.includes("@") && !raw.startsWith("http") ? `mailto:${raw}` : raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push({ text: raw, href });
    last = idx + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), href: null });

  return (
    <span className={className}>
      {parts.map((p, i) => p.href ? (
        <a
          key={i}
          href={p.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
        >
          {p.text}
        </a>
      ) : (
        <span key={i}>{p.text}</span>
      ))}
    </span>
  );
}

/** Used for the Location row — if the whole value is a single URL, render
 *  it as a compact "Join meeting" link; otherwise it's an address + we
 *  linkify any URL embedded inside it. */
function LocationField({ value }: { value: string }) {
  const trimmed = value.trim();
  const isUrl = /^https?:\/\//i.test(trimmed) || /^(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)\//i.test(trimmed);
  if (isUrl) {
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="truncate text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
        title={trimmed}
      >
        Join meeting
      </a>
    );
  }
  return <Linkified text={trimmed} className="truncate" />;
}

// True when the location field looks like something we can launch in a
// new tab. Matches `https://...`, bare `www.foo.com/path`, or any
// `host.tld/path` form so YouTube / Google Drive / generic webpages all
// open from the inline "Open" button.
function isOpenableUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/\s/.test(v)) return false; // multi-word strings are addresses, not URLs
  return /^https?:\/\/\S+$/i.test(v) || /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(v);
}

function toOpenableHref(value: string): string {
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Pulls every URL / email out of a free-text blob so we can render them
 *  as openable chips below the Description textarea. Returns canonicalised
 *  href strings (`https://…` or `mailto:…`). */
function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_REGEX)) {
    const raw = m[0];
    const href = raw.includes("@") && !raw.startsWith("http")
      ? `mailto:${raw}`
      : raw.startsWith("http") ? raw : `https://${raw}`;
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

/** Compact label for a link chip: hostname + first path segment, or the
 *  email for mailto: links. Keeps the chip readable when the URL is long. */
function linkLabel(href: string): string {
  if (href.startsWith("mailto:")) return href.slice(7);
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/^\/$/, "");
    return path ? `${u.host}${path}` : u.host;
  } catch {
    return href;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────
function toTimeStr(d: Date | undefined | null): string {
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function applyTime(base: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const next = new Date(base);
  return setMinutes(setHours(next, h ?? 0), m ?? 0);
}

// Suppress lint warnings for icon imports we keep for future overlays (leaves, tasks).
void CalendarIcon; void isWithinInterval;
