"use client";

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
import { loadData, saveData } from "@/lib/storage";
import { AppData, DAYS, DayName } from "@/lib/types";

const EXAM_TYPES = ["Ujian Harian", "UTS", "UAS", "Remedial", "Praktik", "Lainnya"];

type CellSelection = {
  date: string;
  classId: string;
  timeSlot: string;
};

type RenderDate = {
  date: string;
  title: string;
};

type PdfRow = {
  date: string;
  day: string;
  time: string;
  className: string;
  subject: string;
  teacher: string;
  examType: string;
  notes: string;
};

export default function UjianPage() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [sourceDate, setSourceDate] = useState(() => todayIsoDate());
  const [rangeStartDate, setRangeStartDate] = useState(() => todayIsoDate());
  const [rangeEndDate, setRangeEndDate] = useState(() => addDays(todayIsoDate(), 5));
  const [duplicateTargetDate, setDuplicateTargetDate] = useState("");
  const [slotStart, setSlotStart] = useState("07:30");
  const [slotEnd, setSlotEnd] = useState("09:00");
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("07:30");
  const [editEnd, setEditEnd] = useState("09:00");

  const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedExamType, setSelectedExamType] = useState(EXAM_TYPES[0]);
  const [notes, setNotes] = useState("");

  const [notice, setNotice] = useState("");
  const [recentDropCell, setRecentDropCell] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const teacherMap = useMemo(() => {
    const map = new Map<string, string>();
    data.teachers.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [data.teachers]);

  const classMap = useMemo(() => {
    const map = new Map<string, string>();
    data.classes.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [data.classes]);

  const subjectMap = useMemo(() => {
    const map = new Map<string, string>();
    data.subjects.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [data.subjects]);

  const blockedByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.teacherRules.forEach((rule) => map.set(rule.teacherId, new Set(rule.blockedSlots)));
    return map;
  }, [data.teacherRules]);

  const conflictMap = useMemo(
    () => findExamConflicts(data.examSchedules, blockedByTeacher),
    [data.examSchedules, blockedByTeacher],
  );

  const renderDates = useMemo<RenderDate[]>(() => {
    const start = rangeStartDate <= rangeEndDate ? rangeStartDate : rangeEndDate;
    const end = rangeStartDate <= rangeEndDate ? rangeEndDate : rangeStartDate;
    const days = getDateRange(start, end);
    return days.map((date) => ({
      date,
      title: `${getDayNameFromDate(date) ?? "-"} - ${formatExamDate(date)}`,
    }));
  }, [rangeEndDate, rangeStartDate]);

  const selectedExam = useMemo(() => {
    if (!selectedCell) {
      return undefined;
    }

    return data.examSchedules.find(
      (item) =>
        item.date === selectedCell.date &&
        item.classId === selectedCell.classId &&
        item.timeSlot === selectedCell.timeSlot,
    );
  }, [data.examSchedules, selectedCell]);

  const teacherOptions = useMemo(() => {
    if (!selectedCell) {
      return data.teachers.map((teacher) => ({
        ...teacher,
        disabled: false,
        statusLabel: "Tersedia",
      }));
    }

    const dayName = getDayNameFromDate(selectedCell.date);
    return data.teachers.map((teacher) => {
      const blocked =
        Boolean(dayName) &&
        blockedByTeacher.get(teacher.id)?.has(`${dayName}|${selectedCell.timeSlot}`);

      const conflict = data.examSchedules.some(
        (item) =>
          item.id !== selectedExam?.id &&
          item.date === selectedCell.date &&
          item.timeSlot === selectedCell.timeSlot &&
          item.teacherId === teacher.id,
      );

      return {
        ...teacher,
        disabled: Boolean(blocked || conflict),
        statusLabel: blocked
          ? "Tidak tersedia - aturan guru"
          : conflict
            ? "Tidak bisa dipakai - bentrok pengawas"
            : "Tersedia",
      };
    });
  }, [blockedByTeacher, data.examSchedules, data.teachers, selectedCell, selectedExam?.id]);

  const selectedTeacherStatus =
    selectedCell && selectedTeacherId
      ? teacherOptions.find((teacher) => teacher.id === selectedTeacherId)?.statusLabel ?? "Tersedia"
      : "Pilih pengawas untuk melihat statusnya.";

  function updateData(nextData: AppData) {
    setData(nextData);
    saveData(nextData);
  }

  function pulseCell(date: string, classId: string, slot: string) {
    const cellKey = `${date}|${classId}|${slot}`;
    setRecentDropCell(cellKey);
    window.setTimeout(() => {
      setRecentDropCell((current) => (current === cellKey ? null : current));
    }, 900);
  }

  function clearEditor() {
    setSelectedTeacherId("");
    setSelectedSubjectId("");
    setSelectedExamType(EXAM_TYPES[0]);
    setNotes("");
  }

  function getEntry(date: string, classId: string, timeSlot: string) {
    return data.examSchedules.find(
      (item) => item.date === date && item.classId === classId && item.timeSlot === timeSlot,
    );
  }

  function findTeacherConflict(params: {
    date: string;
    teacherId: string;
    timeSlot: string;
    excludeId?: string;
  }) {
    return data.examSchedules.find(
      (item) =>
        item.id !== params.excludeId &&
        item.date === params.date &&
        item.teacherId === params.teacherId &&
        item.timeSlot === params.timeSlot,
    );
  }

  function openCellEditor(date: string, classId: string, timeSlot: string) {
    setSelectedCell({ date, classId, timeSlot });
    setEditorOpen(true);

    const existing = getEntry(date, classId, timeSlot);
    setSelectedTeacherId(existing?.teacherId ?? "");
    setSelectedSubjectId(existing?.subjectId ?? "");
    setSelectedExamType(existing?.examType || EXAM_TYPES[0]);
    setNotes(existing?.notes ?? "");
    setNotice("");
  }

  function saveCellExam() {
    if (!selectedCell) {
      return;
    }

    if (!selectedTeacherId || !selectedSubjectId) {
      setNotice("Mapel dan pengawas wajib diisi.");
      return;
    }

    const dayName = getDayNameFromDate(selectedCell.date);
    if (dayName && blockedByTeacher.get(selectedTeacherId)?.has(`${dayName}|${selectedCell.timeSlot}`)) {
      setNotice("Guru tidak tersedia pada slot ini sesuai aturan guru.");
      return;
    }

    const duplicateTeacher = findTeacherConflict({
      date: selectedCell.date,
      teacherId: selectedTeacherId,
      timeSlot: selectedCell.timeSlot,
      excludeId: selectedExam?.id,
    });

    if (duplicateTeacher) {
      const conflictClass = classMap.get(duplicateTeacher.classId) ?? "Kelas lain";
      setNotice(
        `Bentrok pengawas: ${teacherMap.get(selectedTeacherId) ?? "Guru"} sudah di ${conflictClass} pada ${formatExamDate(selectedCell.date)} ${selectedCell.timeSlot}.`,
      );
      return;
    }

    if (selectedExam) {
      updateData({
        ...data,
        examSchedules: data.examSchedules.map((item) =>
          item.id === selectedExam.id
            ? {
                ...item,
                teacherId: selectedTeacherId,
                subjectId: selectedSubjectId,
                examType: selectedExamType || "Ujian",
                notes: notes.trim() || undefined,
              }
            : item,
        ),
      });
    } else {
      updateData({
        ...data,
        examSchedules: [
          ...data.examSchedules,
          {
            id: crypto.randomUUID(),
            date: selectedCell.date,
            classId: selectedCell.classId,
            timeSlot: selectedCell.timeSlot,
            subjectId: selectedSubjectId,
            teacherId: selectedTeacherId,
            examType: selectedExamType || "Ujian",
            notes: notes.trim() || undefined,
          },
        ],
      });
    }

    pulseCell(selectedCell.date, selectedCell.classId, selectedCell.timeSlot);
    setNotice("");
  }

  function removeCellExam() {
    if (!selectedExam) {
      return;
    }

    updateData({
      ...data,
      examSchedules: data.examSchedules.filter((item) => item.id !== selectedExam.id),
    });

    clearEditor();
    setNotice("");
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    if (!activeId.startsWith("exam|") || !overId.startsWith("exam-cell|")) {
      return;
    }

    const examId = activeId.replace("exam|", "");
    const [, targetDate, targetClassId, targetSlot] = overId.split("|");
    const dragged = data.examSchedules.find((item) => item.id === examId);

    if (!dragged) {
      return;
    }

    const occupied = data.examSchedules.find(
      (item) =>
        item.id !== dragged.id &&
        item.date === targetDate &&
        item.classId === targetClassId &&
        item.timeSlot === targetSlot,
    );

    if (occupied) {
      const className = classMap.get(targetClassId) ?? "Kelas";
      setNotice(`Slot sudah terisi: ${className}, ${formatExamDate(targetDate)} ${targetSlot}.`);
      return;
    }

    const dayName = getDayNameFromDate(targetDate);
    if (dayName && blockedByTeacher.get(dragged.teacherId)?.has(`${dayName}|${targetSlot}`)) {
      const teacherName = teacherMap.get(dragged.teacherId) ?? "Guru";
      setNotice(`Bentrok aturan guru: ${teacherName} tidak tersedia pada ${dayName} ${targetSlot}.`);
      return;
    }

    const duplicateTeacher = findTeacherConflict({
      date: targetDate,
      teacherId: dragged.teacherId,
      timeSlot: targetSlot,
      excludeId: dragged.id,
    });

    if (duplicateTeacher) {
      const conflictClass = classMap.get(duplicateTeacher.classId) ?? "Kelas lain";
      const teacherName = teacherMap.get(dragged.teacherId) ?? "Guru";
      setNotice(
        `Bentrok pengawas: ${teacherName} sudah di ${conflictClass} pada ${formatExamDate(targetDate)} ${targetSlot}.`,
      );
      return;
    }

    updateData({
      ...data,
      examSchedules: data.examSchedules.map((item) =>
        item.id === dragged.id
          ? { ...item, date: targetDate, classId: targetClassId, timeSlot: targetSlot }
          : item,
      ),
    });

    setSelectedCell({ date: targetDate, classId: targetClassId, timeSlot: targetSlot });
    setEditorOpen(true);
    setSelectedTeacherId(dragged.teacherId);
    setSelectedSubjectId(dragged.subjectId);
    setSelectedExamType(dragged.examType || EXAM_TYPES[0]);
    setNotes(dragged.notes ?? "");
    pulseCell(targetDate, targetClassId, targetSlot);
    setNotice("");
  }

  function duplicateFromActiveDate() {
    const targetDate = duplicateTargetDate;

    if (!targetDate) {
      setNotice("Pilih tanggal tujuan duplikasi terlebih dahulu.");
      return;
    }

    if (sourceDate === targetDate) {
      setNotice("Tanggal tujuan harus berbeda dari tanggal sumber.");
      return;
    }

    const sourceRows = data.examSchedules.filter((item) => item.date === sourceDate);
    if (sourceRows.length === 0) {
      setNotice("Tidak ada ujian pada tanggal sumber untuk diduplikasi.");
      return;
    }

    const dayName = getDayNameFromDate(targetDate);
    const occupiedClassSlots = new Set(
      data.examSchedules
        .filter((item) => item.date === targetDate)
        .map((item) => `${item.classId}|${item.timeSlot}`),
    );
    const occupiedTeacherSlots = new Set(
      data.examSchedules
        .filter((item) => item.date === targetDate)
        .map((item) => `${item.teacherId}|${item.timeSlot}`),
    );

    let copied = 0;
    let skipped = 0;
    const additions: AppData["examSchedules"] = [];

    sourceRows.forEach((item) => {
      const classSlotKey = `${item.classId}|${item.timeSlot}`;
      const teacherSlotKey = `${item.teacherId}|${item.timeSlot}`;
      const blocked = dayName && blockedByTeacher.get(item.teacherId)?.has(`${dayName}|${item.timeSlot}`);

      if (occupiedClassSlots.has(classSlotKey) || occupiedTeacherSlots.has(teacherSlotKey) || blocked) {
        skipped += 1;
        return;
      }

      additions.push({
        ...item,
        id: crypto.randomUUID(),
        date: targetDate,
      });

      occupiedClassSlots.add(classSlotKey);
      occupiedTeacherSlots.add(teacherSlotKey);
      copied += 1;
    });

    if (additions.length > 0) {
      updateData({
        ...data,
        examSchedules: [...data.examSchedules, ...additions],
      });
    }

    setNotice(
      `Duplikasi selesai: ${copied} jadwal disalin ke ${formatExamDate(targetDate)}, ${skipped} dilewati karena bentrok/aturan guru.`,
    );
  }

  function addExamTimeSlot() {
    const next = toSlotLabel(slotStart, slotEnd);
    if (!next) {
      setNotice("Jam selesai ujian harus lebih besar dari jam mulai.");
      return;
    }

    if (data.examTimeSlots.includes(next)) {
      setNotice("Slot jam ujian tersebut sudah ada.");
      return;
    }

    updateData({
      ...data,
      examTimeSlots: sortSlots([...data.examTimeSlots, next]),
    });
    setNotice("Slot jam ujian berhasil ditambahkan.");
  }

  function beginEditExamSlot(slot: string) {
    const [start, end] = slot.split("-");
    setEditingSlot(slot);
    setEditStart(start);
    setEditEnd(end);
  }

  function saveEditExamSlot() {
    if (!editingSlot) {
      return;
    }

    const replacement = toSlotLabel(editStart, editEnd);
    if (!replacement) {
      setNotice("Jam selesai ujian harus lebih besar dari jam mulai.");
      return;
    }

    if (replacement !== editingSlot && data.examTimeSlots.includes(replacement)) {
      setNotice("Slot jam ujian pengganti sudah ada.");
      return;
    }

    updateData({
      ...data,
      examTimeSlots: sortSlots(
        data.examTimeSlots.map((slot) => (slot === editingSlot ? replacement : slot)),
      ),
      examSchedules: data.examSchedules.map((item) =>
        item.timeSlot === editingSlot ? { ...item, timeSlot: replacement } : item,
      ),
    });

    setEditingSlot(null);
    setNotice("Slot jam ujian berhasil diubah.");
  }

  function removeExamTimeSlot(slot: string) {
    const used = data.examSchedules.some((item) => item.timeSlot === slot);
    if (used) {
      setNotice("Slot jam ujian tidak bisa dihapus karena masih dipakai di jadwal ujian.");
      return;
    }

    updateData({
      ...data,
      examTimeSlots: data.examTimeSlots.filter((item) => item !== slot),
    });
    setNotice("Slot jam ujian berhasil dihapus.");
  }

  function exportPdfCurrentView() {
    const rows = buildPdfRows(
      data,
      renderDates.map((item) => item.date),
      teacherMap,
      classMap,
      subjectMap,
    );

    const title = `Jadwal Ujian Rentang ${formatExamDate(rangeStartDate)} - ${formatExamDate(rangeEndDate)}`;

    const fileName = `jadwal-ujian-rentang-${rangeStartDate}-sampai-${rangeEndDate}.pdf`;

    exportExamPdf({ fileName, title, rows });
  }

  function renderTableByDate(renderDate: RenderDate) {
    const dayName = getDayNameFromDate(renderDate.date);
    const total = data.examSchedules.filter((item) => item.date === renderDate.date).length;

    return (
      <section key={renderDate.date} className="panel-sub">
        <h2>{renderDate.title}</h2>
        <p className="muted">Hari: {dayName ?? "Minggu / tidak ada aturan"} | Total ujian: {total}</p>

        <div className="timetable-wrap">
          <table className="timetable">
            <thead>
              <tr>
                <th>Jam</th>
                {data.classes.map((classItem) => (
                  <th key={classItem.id}>{classItem.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.examTimeSlots.map((slot) => (
                <tr key={`${renderDate.date}-${slot}`}>
                  <td>{slot}</td>
                  {data.classes.map((classItem) => {
                    const entry = getEntry(renderDate.date, classItem.id, slot);
                    const active =
                      selectedCell?.date === renderDate.date &&
                      selectedCell.classId === classItem.id &&
                      selectedCell.timeSlot === slot;

                    return (
                      <td key={`${renderDate.date}-${classItem.id}-${slot}`}>
                        <ExamCellDrop
                          id={`exam-cell|${renderDate.date}|${classItem.id}|${slot}`}
                          active={active}
                          pulse={recentDropCell === `${renderDate.date}|${classItem.id}|${slot}`}
                          onClick={() => openCellEditor(renderDate.date, classItem.id, slot)}
                        >
                          {entry ? (
                            <ExamCardDraggable
                              examId={entry.id}
                              teacher={teacherMap.get(entry.teacherId) ?? "-"}
                              subject={subjectMap.get(entry.subjectId) ?? "-"}
                              examType={entry.examType || "Ujian"}
                              conflictText={(conflictMap[entry.id] ?? []).join(" | ")}
                              onEdit={() => openCellEditor(renderDate.date, classItem.id, slot)}
                            />
                          ) : (
                            <span className="cell-empty">Tarik kartu ke sini</span>
                          )}
                        </ExamCellDrop>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Jadwal Ujian (Tabel Fleksibel)</h1>
        <p>
          Fokus pada tampilan rentang tanggal. Semua slot bisa diedit dan dipindahkan lewat drag-and-drop.
        </p>
      </div>

      <div className="row-form">
        <label>
          Dari Tanggal
          <input
            type="date"
            value={rangeStartDate}
            onChange={(event) => {
              setRangeStartDate(event.target.value);
              setSelectedCell(null);
              clearEditor();
            }}
          />
        </label>

        <label>
          Sampai Tanggal
          <input
            type="date"
            value={rangeEndDate}
            onChange={(event) => {
              setRangeEndDate(event.target.value);
              setSelectedCell(null);
              clearEditor();
            }}
          />
        </label>

        <button type="button" className="btn btn-primary" onClick={exportPdfCurrentView}>
          Export PDF Ujian
        </button>
      </div>

      <section className="panel-sub">
        <h2>Jam Ujian (Terpisah dari Jam Jadwal)</h2>
        <div className="row-form">
          <label>
            Mulai
            <input type="time" value={slotStart} onChange={(event) => setSlotStart(event.target.value)} />
          </label>
          <label>
            Selesai
            <input type="time" value={slotEnd} onChange={(event) => setSlotEnd(event.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={addExamTimeSlot}>
            Tambah Jam Ujian
          </button>
        </div>

        <div className="slot-chip-list">
          {data.examTimeSlots.map((slot) => (
            <div key={slot} className="slot-chip">
              {editingSlot === slot ? (
                <>
                  <input type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)} />
                  <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} />
                  <button type="button" className="btn btn-primary" onClick={saveEditExamSlot}>
                    Simpan
                  </button>
                  <button type="button" className="btn" onClick={() => setEditingSlot(null)}>
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <strong>{slot}</strong>
                  <button type="button" className="btn" onClick={() => beginEditExamSlot(slot)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => removeExamTimeSlot(slot)}>
                    Hapus
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="row-form">
        <label>
          Tanggal Sumber Duplikasi
          <input
            type="date"
            value={sourceDate}
            onChange={(event) => setSourceDate(event.target.value)}
          />
        </label>
        <label>
          Duplikasi ke Tanggal
          <input
            type="date"
            value={duplicateTargetDate}
            onChange={(event) => setDuplicateTargetDate(event.target.value)}
          />
        </label>
        <button type="button" className="btn" onClick={duplicateFromActiveDate}>
          Duplikat Jadwal Ujian
        </button>
      </div>

      {notice ? <PopupNotice message={notice} onClose={() => setNotice("")} /> : null}

      {data.classes.length === 0 || data.teachers.length === 0 || data.subjects.length === 0 ? (
        <p className="warn-box">Lengkapi data Guru, Kelas, dan Mata Pelajaran terlebih dahulu.</p>
      ) : null}

      <div className="summary-strip">
        <span>Rentang: {formatExamDate(rangeStartDate)} - {formatExamDate(rangeEndDate)}</span>
        <span>Total hari tampil (tanpa Minggu): {renderDates.length}</span>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="list-box">{renderDates.map((item) => renderTableByDate(item))}</div>
      </DndContext>

      {selectedCell ? (
        <>
          {editorOpen ? (
            <div className="slot-drawer" role="dialog" aria-modal="true" aria-label="Editor Slot Ujian">
              <div className="slot-drawer-header">
                <div>
                  <p className="slot-drawer-eyebrow">Editor Slot Ujian</p>
                  <h2>{classMap.get(selectedCell.classId) ?? "Kelas"}</h2>
                  <p>
                    {formatExamDate(selectedCell.date)} | {selectedCell.timeSlot}
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
                <p className="info-box">Status pengawas terpilih: {selectedTeacherStatus}</p>

                <div className="row-form">
                  <select
                    value={selectedTeacherId}
                    onChange={(event) => setSelectedTeacherId(event.target.value)}
                  >
                    <option value="">Pilih Pengawas</option>
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
                    value={selectedExamType}
                    onChange={(event) => setSelectedExamType(event.target.value)}
                  >
                    {EXAM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>

                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Catatan (opsional)"
                  />

                  <button type="button" className="btn btn-primary" onClick={saveCellExam}>
                    Simpan Slot Ujian
                  </button>
                  <button type="button" className="btn btn-danger" onClick={removeCellExam}>
                    Hapus Slot Ujian
                  </button>
                </div>

                <div className="legend-row">
                  <span className="legend-item ok">Tersedia</span>
                  <span className="legend-item blocked">Tidak tersedia oleh aturan guru</span>
                  <span className="legend-item conflict">Bentrok pengawas di kelas lain</span>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="slot-drawer-toggle" onClick={() => setEditorOpen(true)}>
              Buka Editor Slot Ujian
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}

function ExamCellDrop({
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
    <div ref={setNodeRef} className={className} onClick={onClick} role="button" tabIndex={0}>
      {children}
    </div>
  );
}

function ExamCardDraggable({
  examId,
  teacher,
  subject,
  examType,
  conflictText,
  onEdit,
}: {
  examId: string;
  teacher: string;
  subject: string;
  examType: string;
  conflictText: string;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `exam|${examId}`,
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
      data-tooltip={`${subject} | ${teacher} | ${examType}`}
      title={`${subject} | ${teacher} | ${examType}`}
    >
      <div className="sched-content" {...listeners} {...attributes}>
        <strong>{subject}</strong>
        <span>Pengawas: {teacher}</span>
        <span>{examType}</span>
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

function findExamConflicts(
  exams: AppData["examSchedules"],
  blockedByTeacher: Map<string, Set<string>>,
) {
  const map = new Map<string, Set<string>>();
  const groupedByDateSlot = new Map<string, AppData["examSchedules"]>();

  exams.forEach((item) => {
    const key = `${item.date}|${item.timeSlot}`;
    const rows = groupedByDateSlot.get(key) ?? [];
    rows.push(item);
    groupedByDateSlot.set(key, rows);

    const dayName = getDayNameFromDate(item.date);
    if (dayName && blockedByTeacher.get(item.teacherId)?.has(`${dayName}|${item.timeSlot}`)) {
      addIssue(map, item.id, "Melanggar aturan guru");
    }
  });

  groupedByDateSlot.forEach((rows) => {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];

        if (a.classId === b.classId) {
          addIssue(map, a.id, "Kelas bentrok");
          addIssue(map, b.id, "Kelas bentrok");
        }

        if (a.teacherId === b.teacherId) {
          addIssue(map, a.id, "Pengawas bentrok");
          addIssue(map, b.id, "Pengawas bentrok");
        }
      }
    }
  });

  const result: Record<string, string[]> = {};
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

function buildPdfRows(
  data: AppData,
  dates: string[],
  teacherMap: Map<string, string>,
  classMap: Map<string, string>,
  subjectMap: Map<string, string>,
): PdfRow[] {
  const dateSet = new Set(dates);

  return data.examSchedules
    .filter((item) => dateSet.has(item.date))
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date, "id");
      }
      if (a.timeSlot !== b.timeSlot) {
        return a.timeSlot.localeCompare(b.timeSlot, "id");
      }
      const classA = classMap.get(a.classId) ?? "";
      const classB = classMap.get(b.classId) ?? "";
      return classA.localeCompare(classB, "id");
    })
    .map((item) => ({
      date: formatExamDate(item.date),
      day: getDayNameFromDate(item.date) ?? "-",
      time: item.timeSlot,
      className: classMap.get(item.classId) ?? "-",
      subject: subjectMap.get(item.subjectId) ?? "-",
      teacher: teacherMap.get(item.teacherId) ?? "-",
      examType: item.examType || "Ujian",
      notes: item.notes ?? "",
    }));
}

function exportExamPdf({
  fileName,
  title,
  rows,
}: {
  fileName: string;
  title: string;
  rows: PdfRow[];
}) {
  const pdf = new jsPDF("l", "mm", "a4");

  pdf.setFontSize(12);
  pdf.text("NAMA SEKOLAH", 148, 12, { align: "center" });
  pdf.setFontSize(18);
  pdf.text("JADWAL UJIAN", 148, 20, { align: "center" });
  pdf.setFontSize(11);
  pdf.text(title, 148, 27, { align: "center" });
  pdf.setFontSize(9);
  pdf.text(`Tanggal cetak: ${new Date().toLocaleString("id-ID")}`, 14, 34);
  pdf.text(`Total baris: ${rows.length}`, 14, 39);
  pdf.line(14, 43, 283, 43);

  autoTable(pdf, {
    startY: 47,
    head: [["Tanggal", "Hari", "Jam", "Kelas", "Mapel", "Pengawas", "Jenis", "Catatan"]],
    body: rows.length
      ? rows.map((row) => [
          row.date,
          row.day,
          row.time,
          row.className,
          row.subject,
          row.teacher,
          row.examType,
          row.notes,
        ])
      : [["Tidak ada data", "", "", "", "", "", "", ""]],
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [15, 118, 110],
    },
    didDrawPage: () => {
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(8);
      pdf.text("Dibuat oleh Roster Guru Next", 14, pageHeight - 8);
      pdf.text(`Halaman ${pdf.getCurrentPageInfo().pageNumber}`, 283, pageHeight - 8, {
        align: "right",
      });
    },
  });

  pdf.save(fileName);
}

function formatExamDate(value: string) {
  if (!value) {
    return "-";
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!year || !month || !day) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getDayNameFromDate(value: string): DayName | undefined {
  if (!value) {
    return undefined;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay();

  const dayIndexMap: Record<number, DayName> = {
    1: DAYS[0],
    2: DAYS[1],
    3: DAYS[2],
    4: DAYS[3],
    5: DAYS[4],
    6: DAYS[5],
  };

  return dayIndexMap[jsDay];
}

function toDate(value: string) {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(value: string, dayDelta: number) {
  const date = toDate(value);
  date.setDate(date.getDate() + dayDelta);
  return toIsoDate(date);
}

function getDateRange(startIso: string, endIso: string) {
  const result: string[] = [];
  const startDate = toDate(startIso);
  const endDate = toDate(endIso);

  const current = new Date(startDate);
  while (current <= endDate) {
    if (current.getDay() !== 0) {
      result.push(toIsoDate(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function toSlotLabel(start: string, end: string) {
  if (toMinutes(end) <= toMinutes(start)) {
    return null;
  }
  return `${start}-${end}`;
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function sortSlots(slots: string[]) {
  return [...slots].sort((a, b) => toMinutes(a.split("-")[0]) - toMinutes(b.split("-")[0]));
}

function todayIsoDate() {
  return toIsoDate(new Date());
}
