import { AppData, DAYS, DayName, TIME_SLOTS } from "@/lib/types";

const STORAGE_KEY = "roster_guru_next_v1";

export function createEmptyData(): AppData {
  return {
    teachers: [],
    classes: [],
    subjects: [],
    schedules: [],
    examSchedules: [],
    teacherRules: [],
    timeSlots: [...TIME_SLOTS],
    examTimeSlots: ["07:30-09:00", "09:30-11:00", "13:00-14:30", "15:00-16:30"],
  };
}

export function loadData(): AppData {
  if (typeof window === "undefined") {
    return createEmptyData();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyData();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isAppData(parsed)) {
      return createEmptyData();
    }
    return normalizeData(parsed);
  } catch {
    return createEmptyData();
  }
}

export function saveData(data: AppData) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function isAppData(input: unknown): input is AppData {
  if (!input || typeof input !== "object") {
    return false;
  }

  const item = input as AppData & {
    teacherRules?: unknown;
    timeSlots?: unknown;
    examTimeSlots?: unknown;
    examSchedules?: unknown;
  };
  const rulesOk = item.teacherRules === undefined || (Array.isArray(item.teacherRules) && item.teacherRules.every(isTeacherRule));
  const slotsOk =
    item.timeSlots === undefined ||
    (Array.isArray(item.timeSlots) && item.timeSlots.every((slot) => typeof slot === "string"));
  const examsOk =
    item.examSchedules === undefined ||
    (Array.isArray(item.examSchedules) && item.examSchedules.every(isExamScheduleItem));
  const examSlotsOk =
    item.examTimeSlots === undefined ||
    (Array.isArray(item.examTimeSlots) && item.examTimeSlots.every((slot) => typeof slot === "string"));
  return (
    Array.isArray(item.teachers) &&
    Array.isArray(item.classes) &&
    Array.isArray(item.subjects) &&
    Array.isArray(item.schedules) &&
    item.teachers.every(isMasterItem) &&
    item.classes.every(isMasterItem) &&
    item.subjects.every(isMasterItem) &&
    item.schedules.every(isScheduleItem) &&
    rulesOk &&
    slotsOk &&
    examsOk &&
    examSlotsOk
  );
}

function normalizeData(
  input: AppData & { teacherRules?: unknown; examSchedules?: unknown; examTimeSlots?: unknown },
): AppData {
  const teachers = normalizeMasterItems(input.teachers);
  const classes = normalizeMasterItems(input.classes);
  const subjects = normalizeMasterItems(input.subjects);

  const schedules = input.schedules
    .filter(isScheduleItem)
    .map((item) => ({
      ...item,
      id: normalizeId(item.id),
      teacherId: item.teacherId.trim(),
      classId: item.classId.trim(),
      subjectId: item.subjectId.trim(),
      day: normalizeStoredDay(item.day),
      timeSlot: typeof item.timeSlot === "string" ? item.timeSlot.trim() : undefined,
    }))
    .filter((item) => item.teacherId && item.classId && item.subjectId);

  const teacherRules = Array.isArray(input.teacherRules)
    ? input.teacherRules
        .filter(isTeacherRule)
        .map((item) => ({
          teacherId: item.teacherId.trim(),
          blockedSlots: item.blockedSlots.map((slot) => slot.trim()).filter(Boolean),
        }))
        .filter((item) => item.teacherId.length > 0)
    : [];

  const examSchedules = Array.isArray(input.examSchedules)
    ? input.examSchedules
        .filter(isExamScheduleItem)
        .map((item) => ({
          ...item,
          id: normalizeId(item.id),
          classId: item.classId.trim(),
          subjectId: item.subjectId.trim(),
          teacherId: item.teacherId.trim(),
          date: item.date.trim(),
          timeSlot: item.timeSlot.trim(),
          examType: item.examType.trim() || "Ujian",
          notes: typeof item.notes === "string" ? item.notes.trim() || undefined : undefined,
        }))
        .filter((item) => item.classId && item.subjectId && item.teacherId && item.date && item.timeSlot)
    : [];

  const timeSlots =
    Array.isArray((input as { timeSlots?: unknown }).timeSlots) &&
    (input as { timeSlots: unknown[] }).timeSlots.every((slot) => typeof slot === "string")
      ? Array.from(new Set((input as { timeSlots: string[] }).timeSlots.map((slot) => slot.trim()).filter(Boolean)))
      : [...TIME_SLOTS];

  const examTimeSlots =
    Array.isArray((input as { examTimeSlots?: unknown }).examTimeSlots) &&
    (input as { examTimeSlots: unknown[] }).examTimeSlots.every((slot) => typeof slot === "string")
      ? Array.from(new Set((input as { examTimeSlots: string[] }).examTimeSlots.map((slot) => slot.trim()).filter(Boolean)))
      : createEmptyData().examTimeSlots;

  return {
    teachers,
    classes,
    subjects,
    schedules,
    examSchedules,
    teacherRules,
    timeSlots,
    examTimeSlots,
  };
}

function normalizeMasterItems(items: { id: string; name: string }[]) {
  const usedIds = new Set<string>();

  return items
    .map((item) => ({
      id: normalizeId(item.id, usedIds),
      name: item.name.trim(),
    }))
    .filter((item) => item.name.length > 0);
}

function normalizeId(value: string, usedIds?: Set<string>) {
  const candidate = value.trim();
  if (!candidate) {
    return generateUniqueId(usedIds);
  }

  if (usedIds && usedIds.has(candidate)) {
    return generateUniqueId(usedIds);
  }

  usedIds?.add(candidate);
  return candidate;
}

function generateUniqueId(usedIds?: Set<string>) {
  const id = crypto.randomUUID();
  if (usedIds) {
    if (usedIds.has(id)) {
      return generateUniqueId(usedIds);
    }
    usedIds.add(id);
  }
  return id;
}

function normalizeStoredDay(value: string | undefined): DayName | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return DAYS.includes(normalized as DayName) ? (normalized as DayName) : undefined;
}

function isMasterItem(value: unknown): value is { id: string; name: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { name?: unknown }).name === "string",
  );
}

function isScheduleItem(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as {
    id?: unknown;
    teacherId?: unknown;
    classId?: unknown;
    subjectId?: unknown;
    day?: unknown;
    timeSlot?: unknown;
  };

  const dayOk = item.day === undefined || typeof item.day === "string";
  const slotOk = item.timeSlot === undefined || typeof item.timeSlot === "string";

  return (
    typeof item.id === "string" &&
    typeof item.teacherId === "string" &&
    typeof item.classId === "string" &&
    typeof item.subjectId === "string" &&
    dayOk &&
    slotOk
  );
}

function isTeacherRule(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as { teacherId?: unknown; blockedSlots?: unknown };
  return (
    typeof item.teacherId === "string" &&
    Array.isArray(item.blockedSlots) &&
    item.blockedSlots.every((slot) => typeof slot === "string")
  );
}

function isExamScheduleItem(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as {
    id?: unknown;
    classId?: unknown;
    subjectId?: unknown;
    teacherId?: unknown;
    date?: unknown;
    timeSlot?: unknown;
    examType?: unknown;
    notes?: unknown;
  };

  const notesOk = item.notes === undefined || typeof item.notes === "string";
  return (
    typeof item.id === "string" &&
    typeof item.classId === "string" &&
    typeof item.subjectId === "string" &&
    typeof item.teacherId === "string" &&
    typeof item.date === "string" &&
    typeof item.timeSlot === "string" &&
    typeof item.examType === "string" &&
    notesOk
  );
}
