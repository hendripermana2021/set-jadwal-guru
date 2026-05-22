export type MasterItem = {
  id: string;
  name: string;
};

export type DayName =
  | "Senin"
  | "Selasa"
  | "Rabu"
  | "Kamis"
  | "Jumat"
  | "Sabtu";

export type ScheduleItem = {
  id: string;
  teacherId: string;
  classId: string;
  subjectId: string;
  day?: DayName;
  timeSlot?: string;
};

export type TeacherRule = {
  teacherId: string;
  blockedSlots: string[];
};

export type ExamScheduleItem = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  date: string;
  timeSlot: string;
  examType: string;
  notes?: string;
};

export type AppData = {
  teachers: MasterItem[];
  classes: MasterItem[];
  subjects: MasterItem[];
  schedules: ScheduleItem[];
  examSchedules: ExamScheduleItem[];
  teacherRules: TeacherRule[];
  timeSlots: string[];
  examTimeSlots: string[];
};

export const DAYS: DayName[] = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

export const TIME_SLOTS = [
  "07:00-08:00",
  "08:00-09:00",
  "09:00-10:00",
  "10:00-11:00",
  "11:00-12:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
];
