import { AppData } from "@/lib/types";

export type ConflictMap = Record<string, string[]>;

export function findScheduleConflicts(data: AppData): ConflictMap {
  const map = new Map<string, Set<string>>();
  const grouped = new Map<string, AppData["schedules"]>();
  const blockedByTeacher = new Map<string, Set<string>>();

  const placed = data.schedules.filter((item) => item.day && item.timeSlot);

  data.teacherRules.forEach((rule) => {
    blockedByTeacher.set(rule.teacherId, new Set(rule.blockedSlots));
  });

  placed.forEach((item) => {
    const key = `${item.day}|${item.timeSlot}`;
    const rows = grouped.get(key) ?? [];
    rows.push(item);
    grouped.set(key, rows);

    const blocked = blockedByTeacher.get(item.teacherId);
    if (blocked?.has(key)) {
      addIssue(map, item.id, "Melanggar aturan jam guru");
    }
  });

  grouped.forEach((rows) => {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];

        if (a.teacherId === b.teacherId) {
          addIssue(map, a.id, "Guru bentrok");
          addIssue(map, b.id, "Guru bentrok");
        }

        if (a.classId === b.classId) {
          addIssue(map, a.id, "Kelas bentrok");
          addIssue(map, b.id, "Kelas bentrok");
        }

        if (
          a.teacherId === b.teacherId &&
          a.classId === b.classId &&
          a.subjectId === b.subjectId
        ) {
          addIssue(map, a.id, "Duplikat entri");
          addIssue(map, b.id, "Duplikat entri");
        }
      }
    }
  });

  const result: ConflictMap = {};
  map.forEach((issues, id) => {
    result[id] = [...issues];
  });

  return result;
}

function addIssue(map: Map<string, Set<string>>, id: string, issue: string) {
  const set = map.get(id) ?? new Set<string>();
  set.add(issue);
  map.set(id, set);
}
