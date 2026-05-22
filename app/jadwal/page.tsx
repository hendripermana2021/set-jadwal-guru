"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PopupNotice from "@/components/PopupNotice";
import { findScheduleConflicts } from "@/lib/conflicts";
import { loadData, saveData } from "@/lib/storage";
import { AppData, DAYS, DayName } from "@/lib/types";

type SlotSelection = {
  day: DayName;
  timeSlot: string;
};

type PrintRow = {
  day: string;
  time: string;
  teacher: string;
  className: string;
  subject: string;
};

export default function JadwalPage() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selectedClassId, setSelectedClassId] = useState(data.classes[0]?.id ?? "");
  const [selectedCell, setSelectedCell] = useState<SlotSelection | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(1);
  const [notice, setNotice] = useState("");
  const [recentDropCell, setRecentDropCell] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const teacherMap = useMemo(() => {
    const map = new Map<string, string>();
    data.teachers.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [data]);

  const classMap = useMemo(() => {
    const map = new Map<string, string>();
    data.classes.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [data]);

  const subjectMap = useMemo(() => {
    const map = new Map<string, string>();
    data.subjects.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [data]);

  const selectedClassName = selectedClassId ? classMap.get(selectedClassId) ?? "-" : "-";

  const conflicts = useMemo(() => findScheduleConflicts(data), [data]);

  const blockedByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.teacherRules.forEach((rule) => map.set(rule.teacherId, new Set(rule.blockedSlots)));
    return map;
  }, [data]);

  const timeSlots = data.timeSlots;

  const maxDuration = useMemo(() => {
    if (!selectedCell) {
      return 1;
    }

    const startIndex = timeSlots.indexOf(selectedCell.timeSlot);
    if (startIndex < 0) {
      return 1;
    }

    return Math.max(1, timeSlots.length - startIndex);
  }, [selectedCell, timeSlots]);

  const effectiveDuration = Math.min(Math.max(1, selectedDuration), maxDuration);

  const selectedSchedule = useMemo(() => {
    if (!selectedClassId || !selectedCell) {
      return undefined;
    }

    return data.schedules.find(
      (item) =>
        item.classId === selectedClassId &&
        item.day === selectedCell.day &&
        item.timeSlot === selectedCell.timeSlot,
    );
  }, [data.schedules, selectedCell, selectedClassId]);

  function updateData(nextData: AppData) {
    setData(nextData);
    saveData(nextData);
  }

  function pulseCell(day: DayName, slot: string) {
    const cellKey = `${day}|${slot}`;
    setRecentDropCell(cellKey);
    window.setTimeout(() => {
      setRecentDropCell((current) => (current === cellKey ? null : current));
    }, 900);
  }

  function findTeacherConflictAtSlot(params: {
    teacherId: string;
    day: DayName;
    timeSlot: string;
    excludeId?: string;
  }) {
    return data.schedules.find(
      (item) =>
        item.id !== params.excludeId &&
        item.day === params.day &&
        item.timeSlot === params.timeSlot &&
        item.teacherId === params.teacherId,
    );
  }

  function getSequentialSlots(startSlot: string, count: number) {
    const startIndex = timeSlots.indexOf(startSlot);
    if (startIndex < 0) {
      return [] as string[];
    }

    return timeSlots.slice(startIndex, startIndex + count);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!selectedClassId || !event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    if (!activeId.startsWith("schedule|") || !overId.startsWith("cell|")) {
      return;
    }

    const scheduleId = activeId.replace("schedule|", "");
    const [, day, slot] = overId.split("|");
    const targetDay = day as DayName;
    const targetSlot = slot;
    const dragged = data.schedules.find((item) => item.id === scheduleId);

    if (!dragged) {
      return;
    }

    const occupied = data.schedules.find(
      (item) =>
        item.classId === selectedClassId &&
        item.day === targetDay &&
        item.timeSlot === targetSlot &&
        item.id !== dragged.id,
    );

    if (occupied) {
      const occupiedTeacher = teacherMap.get(occupied.teacherId) ?? "Guru";
      const occupiedSubject = subjectMap.get(occupied.subjectId) ?? "Mapel";
      setNotice(
        `Duplikasi slot: kelas ${selectedClassName}, ${targetDay} ${targetSlot} sudah terisi oleh ${occupiedTeacher} (${occupiedSubject}).`,
      );
      return;
    }

    const slotKey = `${targetDay}|${targetSlot}`;
    if (blockedByTeacher.get(dragged.teacherId)?.has(slotKey)) {
      const teacherName = teacherMap.get(dragged.teacherId) ?? "Guru";
      setNotice(
        `Bentrok aturan guru: ${teacherName} tidak tersedia pada ${targetDay} ${targetSlot}.`,
      );
      return;
    }

    const duplicateTeacher = findTeacherConflictAtSlot({
      teacherId: dragged.teacherId,
      day: targetDay,
      timeSlot: targetSlot,
      excludeId: dragged.id,
    });

    if (duplicateTeacher) {
      const conflictClass = classMap.get(duplicateTeacher.classId) ?? "Kelas lain";
      const teacherName = teacherMap.get(dragged.teacherId) ?? "Guru";
      setNotice(
        `Bentrok guru: ${teacherName} sudah dijadwalkan di ${conflictClass} pada ${targetDay} ${targetSlot}.`,
      );
      return;
    }

    const nextSchedules = data.schedules.map((item) =>
      item.id === dragged.id ? { ...item, day: targetDay, timeSlot: targetSlot } : item,
    );

    updateData({
      ...data,
      schedules: nextSchedules,
    });

    setSelectedCell({ day: targetDay, timeSlot: targetSlot });
    setEditorOpen(true);
    setSelectedTeacherId(dragged.teacherId);
    setSelectedSubjectId(dragged.subjectId);
    setSelectedDuration(1);
    pulseCell(targetDay, targetSlot);
    setNotice("");
  }

  function selectCell(day: DayName, timeSlot: string) {
    setSelectedCell({ day, timeSlot });
    setEditorOpen(true);

    const existing = data.schedules.find(
      (item) => item.classId === selectedClassId && item.day === day && item.timeSlot === timeSlot,
    );

    setSelectedTeacherId(existing?.teacherId ?? "");
    setSelectedSubjectId(existing?.subjectId ?? "");
    setSelectedDuration(1);
    setNotice("");
  }

  function getEntry(day: DayName, timeSlot: string) {
    return data.schedules.find(
      (item) => item.classId === selectedClassId && item.day === day && item.timeSlot === timeSlot,
    );
  }

  function saveCellSchedule() {
    if (!selectedClassId || !selectedCell) {
      setNotice("");
      return;
    }

    if (!selectedTeacherId || !selectedSubjectId) {
      setNotice("");
      return;
    }

    const duration = Math.max(1, Number.isFinite(effectiveDuration) ? Math.floor(effectiveDuration) : 1);
    const targetSlots = getSequentialSlots(selectedCell.timeSlot, duration);

    if (targetSlots.length === 0) {
      setNotice("Slot awal tidak ditemukan pada daftar jam pelajaran.");
      return;
    }

    const failures: string[] = [];
    const validSlots: string[] = [];

    targetSlots.forEach((slot) => {
      const slotKey = `${selectedCell.day}|${slot}`;
      if (blockedByTeacher.get(selectedTeacherId)?.has(slotKey)) {
        failures.push(`${selectedCell.day} ${slot} terblokir aturan guru`);
        return;
      }

      const occupiedClass = data.schedules.find(
        (item) =>
          item.classId === selectedClassId &&
          item.day === selectedCell.day &&
          item.timeSlot === slot,
      );

      if (occupiedClass) {
        const occupiedTeacher = teacherMap.get(occupiedClass.teacherId) ?? "Guru";
        failures.push(`${selectedCell.day} ${slot} sudah terisi ${occupiedTeacher}`);
        return;
      }

      const duplicateTeacher = findTeacherConflictAtSlot({
        teacherId: selectedTeacherId,
        day: selectedCell.day,
        timeSlot: slot,
      });

      if (duplicateTeacher) {
        const conflictClass = classMap.get(duplicateTeacher.classId) ?? "Kelas lain";
        failures.push(`${selectedCell.day} ${slot} bentrok di ${conflictClass}`);
        return;
      }

      validSlots.push(slot);
    });

    if (validSlots.length === 0) {
      setNotice(`Gagal menyimpan jadwal. ${failures[0] ?? "Tidak ada slot yang valid."}`);
      return;
    }

    const nextSchedules = [...data.schedules];

    validSlots.forEach((slot) => {
      nextSchedules.push({
        id: crypto.randomUUID(),
        classId: selectedClassId,
        teacherId: selectedTeacherId,
        subjectId: selectedSubjectId,
        day: selectedCell.day,
        timeSlot: slot,
      });
    });

    updateData({ ...data, schedules: nextSchedules });
    pulseCell(selectedCell.day, validSlots[0]);

    if (failures.length > 0) {
      setNotice(
        `Berhasil simpan ${validSlots.length} slot, ${failures.length} slot dilewati. Contoh: ${failures[0]}`,
      );
      return;
    }

    if (validSlots.length > 1) {
      setNotice(`Berhasil simpan ${validSlots.length} slot berurutan.`);
      return;
    }

    setNotice("");
  }

  function removeCellSchedule() {
    if (!selectedSchedule) {
      setNotice("");
      return;
    }

    updateData({
      ...data,
      schedules: data.schedules.filter((item) => item.id !== selectedSchedule.id),
    });

    setSelectedTeacherId("");
    setSelectedSubjectId("");
    setSelectedDuration(1);
    setNotice("");
  }

  function printPerKelas() {
    if (!selectedClassId) {
      setNotice("");
      return;
    }

    const rows = buildClassRows(data, selectedClassId, teacherMap, classMap, subjectMap);
    printRosterHtml({
      title: `Roster Kelas ${selectedClassName}`,
      rows,
    });
  }

  function printSemuaKelas() {
    const rows = buildAllClassRows(data, teacherMap, classMap, subjectMap);
    printRosterHtml({
      title: "Roster Semua Kelas",
      rows,
    });
  }

  function exportPdfPerKelas() {
    if (!selectedClassId) {
      setNotice("");
      return;
    }

    const rows = buildClassRows(data, selectedClassId, teacherMap, classMap, subjectMap);
    exportRosterPdf({
      fileName: `roster-kelas-${selectedClassName.toLowerCase().replace(/\s+/g, "-")}.pdf`,
      title: `Roster Kelas ${selectedClassName}`,
      rows,
    });
  }

  const teacherOptions = data.teachers.map((teacher) => {
    if (!selectedCell) {
      return { ...teacher, disabled: false, statusLabel: "Tersedia" };
    }

    const slotKey = `${selectedCell.day}|${selectedCell.timeSlot}`;
    const blocked = blockedByTeacher.get(teacher.id)?.has(slotKey) ?? false;

    const conflict = data.schedules.some(
      (item) =>
        item.id !== selectedSchedule?.id &&
        item.day === selectedCell.day &&
        item.timeSlot === selectedCell.timeSlot &&
        item.teacherId === teacher.id,
    );

    const statusLabel = blocked
      ? "Tidak tersedia - aturan guru"
      : conflict
        ? "Tidak bisa dipakai - bentrok jam"
        : "Tersedia";

    return {
      ...teacher,
      disabled: blocked || conflict,
      statusLabel,
    };
  });

  const selectedTeacherStatus =
    selectedCell && selectedTeacherId
      ? teacherOptions.find((teacher) => teacher.id === selectedTeacherId)?.statusLabel ?? "Tersedia"
      : "Pilih guru untuk melihat statusnya.";

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Jadwal per Kelas</h1>
        <p>Pilih kelas, lalu atur jadwal Senin-Sabtu per slot jam. Sistem cek otomatis aturan guru dan bentrok guru.</p>
      </div>

      <div className="row-form">
        <select
          value={selectedClassId}
          onChange={(event) => {
            setSelectedClassId(event.target.value);
            setSelectedCell(null);
            setSelectedTeacherId("");
            setSelectedSubjectId("");
          }}
        >
          <option value="">Pilih Kelas</option>
          {data.classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <button type="button" className="btn" onClick={printPerKelas}>
          Print Roster Kelas
        </button>
        <button type="button" className="btn" onClick={printSemuaKelas}>
          Print Roster Semua Kelas
        </button>
        <button type="button" className="btn btn-primary" onClick={exportPdfPerKelas}>
          Export PDF Kelas
        </button>
        <Link href="/jam-pelajaran" className="btn">
          Buka Menu Jam Pelajaran
        </Link>
      </div>

      {notice ? <PopupNotice message={notice} onClose={() => setNotice("")} /> : null}

      {data.classes.length === 0 || data.teachers.length === 0 || data.subjects.length === 0 ? (
        <p className="warn-box">Lengkapi data Guru, Kelas, dan Mata Pelajaran terlebih dahulu.</p>
      ) : null}

      <div className="summary-strip">
        <span>Kelas aktif: {selectedClassName}</span>
        <span>Jumlah slot: {timeSlots.length}</span>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="timetable-wrap">
          <table className="timetable">
            <thead>
              <tr>
                <th>Jam</th>
                {DAYS.map((day) => (
                  <th key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot}>
                  <td>{slot}</td>
                  {DAYS.map((day) => {
                    const entry = getEntry(day, slot);
                    const conflictText = entry ? (conflicts[entry.id] ?? []).join(" | ") : "";
                    const active = selectedCell?.day === day && selectedCell?.timeSlot === slot;
                    return (
                      <td key={`${day}-${slot}`}>
                        <ScheduleCellDrop
                          id={`cell|${day}|${slot}`}
                          active={active}
                          pulse={recentDropCell === `${day}|${slot}`}
                          onClick={() => selectCell(day, slot)}
                        >
                          {entry ? (
                            <ScheduleCardDraggable
                              scheduleId={entry.id}
                              teacher={teacherMap.get(entry.teacherId) ?? "-"}
                              subject={subjectMap.get(entry.subjectId) ?? "-"}
                              conflictText={conflictText}
                              day={day}
                              timeSlot={slot}
                              classNameText={selectedClassName}
                              onEdit={() => selectCell(day, slot)}
                            />
                          ) : (
                            <span className="cell-empty">Tarik kartu ke sini</span>
                          )}
                        </ScheduleCellDrop>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DndContext>

      {selectedCell ? (
        <>
          {editorOpen ? (
            <div className="slot-drawer" role="dialog" aria-modal="true" aria-label="Editor Slot Jadwal">
              <div className="slot-drawer-header">
                <div>
                  <p className="slot-drawer-eyebrow">Editor Slot</p>
                  <h2>Kelas {selectedClassName}</h2>
                  <p>
                    {selectedCell.day} | {selectedCell.timeSlot}
                  </p>
                </div>
                <div className="slot-drawer-actions">
                  <button type="button" className="btn" onClick={() => setEditorOpen(false)}>
                    Minimize
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => setEditorOpen(false)}>
                    Tutup
                  </button>
                </div>
              </div>

              <div className="slot-drawer-body">
                <p className="info-box">Status guru terpilih: {selectedTeacherStatus}</p>

                <div className="row-form">
                  <select
                    value={selectedTeacherId}
                    onChange={(event) => setSelectedTeacherId(event.target.value)}
                  >
                    <option value="">Pilih Guru</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id} disabled={teacher.disabled}>
                        {teacher.name} - {teacher.statusLabel}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedSubjectId}
                    onChange={(event) => setSelectedSubjectId(event.target.value)}
                  >
                    <option value="">Pilih Mapel</option>
                    {data.subjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={String(effectiveDuration)}
                    onChange={(event) => setSelectedDuration(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                  >
                    {Array.from({ length: maxDuration }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>
                        {value} Jam
                      </option>
                    ))}
                  </select>

                  <button type="button" className="btn btn-primary" onClick={saveCellSchedule}>
                    Simpan Jadwal
                  </button>
                  <button type="button" className="btn btn-danger" onClick={removeCellSchedule}>
                    Hapus Jadwal Slot Ini
                  </button>
                </div>

                <div className="legend-row">
                  <span className="legend-item ok">Tersedia</span>
                  <span className="legend-item blocked">Tidak tersedia oleh aturan guru</span>
                  <span className="legend-item conflict">Bentrok jam di kelas lain</span>
                </div>
                <p className="info-box">Jumlah jam akan diisi berurutan mulai dari slot yang dipilih.</p>
                <p className="info-box">Slot yang sudah terisi tidak akan ditimpa, sistem hanya mengisi slot kosong.</p>
              </div>
            </div>
          ) : (
            <button type="button" className="slot-drawer-toggle" onClick={() => setEditorOpen(true)}>
              Buka Editor Slot
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}

function ScheduleCellDrop({
  id,
  active,
  pulse,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  pulse: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const className = isOver
    ? "schedule-drop-cell is-over"
    : pulse
      ? "schedule-drop-cell moved"
      : active
        ? "schedule-drop-cell active"
        : "schedule-drop-cell";

  return (
    <div
      ref={setNodeRef}
      className={className}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

function ScheduleCardDraggable({
  scheduleId,
  teacher,
  subject,
  conflictText,
  day,
  timeSlot,
  classNameText,
  onEdit,
}: {
  scheduleId: string;
  teacher: string;
  subject: string;
  conflictText: string;
  day: DayName;
  timeSlot: string;
  classNameText: string;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `schedule|${scheduleId}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="sched-card draggable"
      data-tooltip={`${teacher} | ${subject} | ${classNameText} | ${day} ${timeSlot}`}
      title={`${teacher} - ${subject} | ${classNameText} | ${day} ${timeSlot}`}
    >
      <div className="sched-content" {...listeners} {...attributes}>
        <strong>{teacher}</strong>
        <span>{subject}</span>
        {conflictText ? <em>{conflictText}</em> : null}
      </div>
      <div className="sched-footer">
        <button type="button" className="btn tiny" onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  );
}

function buildClassRows(
  data: AppData,
  classId: string,
  teacherMap: Map<string, string>,
  classMap: Map<string, string>,
  subjectMap: Map<string, string>,
): PrintRow[] {
  const dayOrder = new Map(DAYS.map((day, index) => [day, index]));

  return data.schedules
    .filter((item) => item.classId === classId && item.day && item.timeSlot)
    .sort((a, b) => {
      const dayA = dayOrder.get(a.day as DayName) ?? 999;
      const dayB = dayOrder.get(b.day as DayName) ?? 999;
      if (dayA !== dayB) {
        return dayA - dayB;
      }
      return String(a.timeSlot).localeCompare(String(b.timeSlot), "id");
    })
    .map((item) => ({
      day: item.day ?? "-",
      time: item.timeSlot ?? "-",
      teacher: teacherMap.get(item.teacherId) ?? "-",
      className: classMap.get(item.classId) ?? "-",
      subject: subjectMap.get(item.subjectId) ?? "-",
    }));
}

function buildAllClassRows(
  data: AppData,
  teacherMap: Map<string, string>,
  classMap: Map<string, string>,
  subjectMap: Map<string, string>,
): PrintRow[] {
  const dayOrder = new Map(DAYS.map((day, index) => [day, index]));

  return data.schedules
    .filter((item) => item.day && item.timeSlot)
    .sort((a, b) => {
      const classA = classMap.get(a.classId) ?? "";
      const classB = classMap.get(b.classId) ?? "";
      const byClass = classA.localeCompare(classB, "id");
      if (byClass !== 0) {
        return byClass;
      }

      const dayA = dayOrder.get(a.day as DayName) ?? 999;
      const dayB = dayOrder.get(b.day as DayName) ?? 999;
      if (dayA !== dayB) {
        return dayA - dayB;
      }

      return String(a.timeSlot).localeCompare(String(b.timeSlot), "id");
    })
    .map((item) => ({
      day: item.day ?? "-",
      time: item.timeSlot ?? "-",
      teacher: teacherMap.get(item.teacherId) ?? "-",
      className: classMap.get(item.classId) ?? "-",
      subject: subjectMap.get(item.subjectId) ?? "-",
    }));
}

function printRosterHtml({ title, rows }: { title: string; rows: PrintRow[] }) {
  const win = window.open("", "_blank", "width=1000,height=700");
  if (!win) {
    return;
  }

  const bodyRows =
    rows.length === 0
      ? '<tr><td colspan="5">Tidak ada data.</td></tr>'
      : buildMergedRosterTableBody(rows);

  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #172033; }
          h1 { margin-bottom: 6px; font-size: 24px; text-align: center; }
          .kop { text-align: center; margin-bottom: 14px; }
          .kop .school { font-size: 16px; font-weight: 700; letter-spacing: 0.4px; }
          .kop .title { font-size: 20px; font-weight: 700; margin-top: 4px; }
          .meta { margin-bottom: 16px; color: #5a6880; text-align: center; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cdd5e2; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #eef3fb; }
          tr:nth-child(even) td { background: #fafcff; }
          .footer { margin-top: 18px; display: flex; justify-content: space-between; color: #5a6880; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="kop">
          <div class="school">NAMA SEKOLAH</div>
          <div class="title">KARTU ${title.toUpperCase()}</div>
        </div>
        <h1>${title}</h1>
        <p class="meta">Tanggal cetak: ${new Date().toLocaleString("id-ID")} | Total baris: ${rows.length}</p>
        <table>
          <thead>
            <tr>
              <th>Hari</th>
              <th>Jam</th>
              <th>Guru</th>
              <th>Kelas</th>
              <th>Mapel</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
        <div class="footer">
          <span>Dibuat oleh Roster Guru Next</span>
          <span>Halaman cetak</span>
        </div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function buildMergedRosterTableBody(rows: PrintRow[]): string {
  const values = rows.map((row) => [row.day, row.time, row.teacher, row.className, row.subject]);
  const rowSpans = values.map(() => [1, 1, 1, 1, 1]);

  for (let col = 0; col < 5; col += 1) {
    let start = 0;

    while (start < values.length) {
      let end = start + 1;

      while (end < values.length && values[end][col] === values[start][col]) {
        end += 1;
      }

      rowSpans[start][col] = end - start;
      for (let rowIndex = start + 1; rowIndex < end; rowIndex += 1) {
        rowSpans[rowIndex][col] = 0;
      }

      start = end;
    }
  }

  return values
    .map((rowValues, rowIndex) => {
      const cells = rowValues
        .map((cellValue, colIndex) => {
          const span = rowSpans[rowIndex][colIndex];
          if (span === 0) {
            return "";
          }

          const safeValue = escapeHtml(cellValue);
          return span > 1 ? `<td rowspan="${span}">${safeValue}</td>` : `<td>${safeValue}</td>`;
        })
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function exportRosterPdf({
  fileName,
  title,
  rows,
}: {
  fileName: string;
  title: string;
  rows: PrintRow[];
}) {
  const pdf = new jsPDF();

  pdf.setFontSize(12);
  pdf.text("NAMA SEKOLAH", 105, 14, { align: "center" });
  pdf.setFontSize(18);
  pdf.text(`KARTU ${title.toUpperCase()}`, 105, 22, { align: "center" });
  pdf.setFontSize(10);
  pdf.text(`Tanggal cetak: ${new Date().toLocaleString("id-ID")}`, 14, 32);
  pdf.text(`Total baris: ${rows.length}`, 14, 38);
  pdf.line(14, 42, 196, 42);

  autoTable(pdf, {
    startY: 48,
    head: [["Hari", "Jam", "Guru", "Kelas", "Mapel"]],
    body: rows.length
      ? rows.map((row) => [row.day, row.time, row.teacher, row.className, row.subject])
      : [["Tidak ada data", "", "", "", ""]],
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [15, 118, 110],
    },
    didDrawPage: () => {
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(9);
      pdf.text("Dibuat oleh Roster Guru Next", 14, pageHeight - 10);
      pdf.text(`Halaman ${pdf.getCurrentPageInfo().pageNumber}`, 196, pageHeight - 10, {
        align: "right",
      });
    },
  });

  pdf.save(fileName);
}
