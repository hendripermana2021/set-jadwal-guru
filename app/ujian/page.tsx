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
import SearchableSelect from "@/components/SearchableSelect";
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
  const [exportClassId, setExportClassId] = useState("");
  const [headmasterName, setHeadmasterName] = useState("");
  const [signatureDate, setSignatureDate] = useState(() => todayIsoDate());

  const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedExamType, setSelectedExamType] = useState(EXAM_TYPES[0]);
  const [selectedDuration, setSelectedDuration] = useState(1);
  const [notes, setNotes] = useState("");

  const [notice, setNotice] = useState("");
  const [recentDropCell, setRecentDropCell] = useState<string | null>(null);
  const [editorPopover, setEditorPopover] = useState<{
    top: number;
    left: number;
    arrowSide: "left" | "right";
  } | null>(null);

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

  const exportClassOptions = useMemo(
    () => data.classes.map((item) => ({ id: item.id, name: item.name })),
    [data.classes],
  );

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

  const maxDuration = useMemo(() => {
    if (!selectedCell) {
      return 1;
    }

    const startIndex = data.examTimeSlots.indexOf(selectedCell.timeSlot);
    if (startIndex < 0) {
      return 1;
    }

    return Math.max(1, data.examTimeSlots.length - startIndex);
  }, [data.examTimeSlots, selectedCell]);

  const effectiveDuration = Math.min(Math.max(1, selectedDuration), maxDuration);

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
    setSelectedDuration(1);
    setNotes("");
  }

  function getSequentialExamSlots(startSlot: string, count: number) {
    const startIndex = data.examTimeSlots.indexOf(startSlot);
    if (startIndex < 0) {
      return [] as string[];
    }

    return data.examTimeSlots.slice(startIndex, startIndex + count);
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

  function updateEditorAnchor(date: string, classId: string, slot: string) {
    if (typeof window === "undefined" || window.innerWidth < 960) {
      setEditorPopover(null);
      return;
    }

    const cellKey = `${date}|${classId}|${slot}`;
    const cell = document.querySelector(`[data-exam-cell="${cellKey}"]`) as HTMLElement | null;

    if (!cell) {
      setEditorPopover(null);
      return;
    }

    const rect = cell.getBoundingClientRect();
    const drawerWidth = 460;
    const gap = 14;

    let left = rect.right + gap;
    let arrowSide: "left" | "right" = "left";

    if (left + drawerWidth > window.innerWidth - 12) {
      left = rect.left - drawerWidth - gap;
      arrowSide = "right";
    }

    if (left < 12) {
      setEditorPopover(null);
      return;
    }

    const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - 420));
    setEditorPopover({ top, left, arrowSide });
  }

  function openCellEditor(date: string, classId: string, timeSlot: string) {
    setSelectedCell({ date, classId, timeSlot });
    setEditorOpen(true);
    updateEditorAnchor(date, classId, timeSlot);

    const existing = getEntry(date, classId, timeSlot);
    setSelectedTeacherId(existing?.teacherId ?? "");
    setSelectedSubjectId(existing?.subjectId ?? "");
    setSelectedExamType(existing?.examType || EXAM_TYPES[0]);
    setSelectedDuration(1);
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

    const duration = Math.max(1, Number.isFinite(effectiveDuration) ? Math.floor(effectiveDuration) : 1);
    const targetSlots = getSequentialExamSlots(selectedCell.timeSlot, duration);

    if (targetSlots.length === 0) {
      setNotice("Slot awal ujian tidak ditemukan.");
      return;
    }

    if (selectedExam && duration === 1) {
      const dayName = getDayNameFromDate(selectedCell.date);
      if (dayName && blockedByTeacher.get(selectedTeacherId)?.has(`${dayName}|${selectedCell.timeSlot}`)) {
        setNotice("Guru tidak tersedia pada slot ini sesuai aturan guru.");
        return;
      }

      const duplicateTeacher = findTeacherConflict({
        date: selectedCell.date,
        teacherId: selectedTeacherId,
        timeSlot: selectedCell.timeSlot,
        excludeId: selectedExam.id,
      });

      if (duplicateTeacher) {
        const conflictClass = classMap.get(duplicateTeacher.classId) ?? "Kelas lain";
        setNotice(
          `Bentrok pengawas: ${teacherMap.get(selectedTeacherId) ?? "Guru"} sudah di ${conflictClass} pada ${formatExamDate(selectedCell.date)} ${selectedCell.timeSlot}.`,
        );
        return;
      }

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

      pulseCell(selectedCell.date, selectedCell.classId, selectedCell.timeSlot);
      setSelectedTeacherId("");
      setSelectedSubjectId("");
      setNotice("");
      return;
    }

    const failures: string[] = [];
    const validSlots: string[] = [];

    targetSlots.forEach((slot) => {
      const currentSlotExamId =
        selectedExam && slot === selectedCell.timeSlot ? selectedExam.id : undefined;
      const dayName = getDayNameFromDate(selectedCell.date);

      if (dayName && blockedByTeacher.get(selectedTeacherId)?.has(`${dayName}|${slot}`)) {
        failures.push(`${formatExamDate(selectedCell.date)} ${slot} terblokir aturan guru`);
        return;
      }

      const occupiedClass = data.examSchedules.find(
        (item) =>
          item.date === selectedCell.date &&
          item.classId === selectedCell.classId &&
          item.timeSlot === slot &&
          item.id !== currentSlotExamId,
      );

      if (occupiedClass) {
        failures.push(`${formatExamDate(selectedCell.date)} ${slot} sudah terisi`);
        return;
      }

      const duplicateTeacher = findTeacherConflict({
        date: selectedCell.date,
        teacherId: selectedTeacherId,
        timeSlot: slot,
        excludeId: currentSlotExamId,
      });

      if (duplicateTeacher) {
        const conflictClass = classMap.get(duplicateTeacher.classId) ?? "Kelas lain";
        failures.push(`${formatExamDate(selectedCell.date)} ${slot} bentrok di ${conflictClass}`);
        return;
      }

      validSlots.push(slot);
    });

    if (validSlots.length === 0) {
      setNotice(`Gagal menyimpan slot ujian. ${failures[0] ?? "Tidak ada slot yang valid."}`);
      return;
    }

    const nextExamSchedules = [...data.examSchedules];

    validSlots.forEach((slot) => {
      const existing = nextExamSchedules.find(
        (item) =>
          item.date === selectedCell.date &&
          item.classId === selectedCell.classId &&
          item.timeSlot === slot,
      );

      if (existing && existing.id === selectedExam?.id) {
        existing.teacherId = selectedTeacherId;
        existing.subjectId = selectedSubjectId;
        existing.examType = selectedExamType || "Ujian";
        existing.notes = notes.trim() || undefined;
        return;
      }

      if (!existing) {
        nextExamSchedules.push({
          id: crypto.randomUUID(),
          date: selectedCell.date,
          classId: selectedCell.classId,
          timeSlot: slot,
          subjectId: selectedSubjectId,
          teacherId: selectedTeacherId,
          examType: selectedExamType || "Ujian",
          notes: notes.trim() || undefined,
        });
      }
    });

    updateData({
      ...data,
      examSchedules: nextExamSchedules,
    });

    pulseCell(selectedCell.date, selectedCell.classId, validSlots[0]);
    setSelectedTeacherId("");
    setSelectedSubjectId("");

    if (failures.length > 0) {
      setNotice(
        `Berhasil simpan ${validSlots.length} slot ujian, ${failures.length} slot dilewati. Contoh: ${failures[0]}`,
      );
      return;
    }

    if (validSlots.length > 1) {
      setNotice(`Berhasil simpan ${validSlots.length} slot ujian berurutan.`);
      return;
    }

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
    setSelectedDuration(1);
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

    exportExamPdf({ fileName, title, rows, headmasterName: headmasterName.trim(), signatureDate });
  }

  function exportPdfSelectedClass() {
    if (!exportClassId) {
      setNotice("Pilih kelas yang akan diexport terlebih dahulu.");
      return;
    }

    const className = classMap.get(exportClassId) ?? "Kelas";
    const rows = buildPdfRows(
      data,
      renderDates.map((item) => item.date),
      teacherMap,
      classMap,
      subjectMap,
      exportClassId,
    );

    const title = `Jadwal Ujian ${className} | ${formatExamDate(rangeStartDate)} - ${formatExamDate(rangeEndDate)}`;
    const fileName = `jadwal-ujian-${exportClassId}-${rangeStartDate}-sampai-${rangeEndDate}.pdf`;

    exportExamPdf({
      fileName,
      title,
      rows,
      headmasterName: headmasterName.trim(),
      signatureDate,
    });
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
                          cellKey={`${renderDate.date}|${classItem.id}|${slot}`}
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

      <div className="row-form">
        <label>
          Kelas yang Diexport
          <select value={exportClassId} onChange={(event) => setExportClassId(event.target.value)}>
            <option value="">Pilih kelas...</option>
            {exportClassOptions.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nama Kepala Sekolah
          <input
            value={headmasterName}
            onChange={(event) => setHeadmasterName(event.target.value)}
            placeholder="Contoh: Drs. Ahmad Siregar"
          />
        </label>

        <label>
          Tanggal Tanda Tangan
          <input
            type="date"
            value={signatureDate}
            onChange={(event) => setSignatureDate(event.target.value)}
          />
        </label>

        <button type="button" className="btn btn-primary" onClick={exportPdfSelectedClass}>
          Export PDF Per Kelas
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
            <div
              className={`slot-drawer${editorPopover ? " popover" : ""}`}
              style={editorPopover ? { top: editorPopover.top, left: editorPopover.left } : undefined}
              role="dialog"
              aria-modal="true"
              aria-label="Editor Slot Ujian"
            >
              {editorPopover ? (
                <span className={`slot-drawer-pointer ${editorPopover.arrowSide}`} aria-hidden="true" />
              ) : null}
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
                  <SearchableSelect
                    value={selectedTeacherId}
                    onChange={setSelectedTeacherId}
                    options={teacherOptions}
                    placeholder="Ketik nama pengawas..."
                  />

                  <SearchableSelect
                    value={selectedSubjectId}
                    onChange={setSelectedSubjectId}
                    options={data.subjects}
                    placeholder="Ketik nama mapel..."
                  />

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
                <p className="info-box">Jumlah jam ujian akan diisi berurutan mulai dari slot yang dipilih.</p>
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
  cellKey,
  active,
  pulse,
  onClick,
  children,
}: {
  id: string;
  cellKey: string;
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
      data-exam-cell={cellKey}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
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
  classId?: string,
): PdfRow[] {
  const dateSet = new Set(dates);

  return data.examSchedules
    .filter((item) => dateSet.has(item.date) && (!classId || item.classId === classId))
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
  headmasterName,
  signatureDate,
}: {
  fileName: string;
  title: string;
  rows: PdfRow[];
  headmasterName: string;
  signatureDate: string;
}) {
  const pdf = new jsPDF("l", "mm", "a4");

  pdf.setFontSize(18);
  pdf.text("JADWAL UJIAN", 148, 20, { align: "center" });
  pdf.setFontSize(11);
  pdf.text(title, 148, 27, { align: "center" });
  pdf.setFontSize(9);
  pdf.text(`Tanggal cetak: ${new Date().toLocaleString("id-ID")}`, 14, 34);
  pdf.text(`Total baris: ${rows.length}`, 14, 39);
  pdf.line(14, 43, 283, 43);

  const mergedBody = buildMergedExamPdfBody(rows);

  autoTable(pdf, {
    startY: 50,
    columns: [
      { header: "Tanggal", dataKey: "date" },
      { header: "Hari", dataKey: "day" },
      { header: "Jam", dataKey: "time" },
      { header: "Kelas", dataKey: "className" },
      { header: "Mapel", dataKey: "subject" },
      { header: "Pengawas", dataKey: "teacher" },
      { header: "Jenis", dataKey: "examType" },
      { header: "Catatan", dataKey: "notes" },
    ],
    body: (rows.length
      ? mergedBody
      : [{ date: "Tidak ada data", day: "", time: "", className: "", subject: "", teacher: "", examType: "", notes: "" }]) as unknown as string[][],
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineWidth: 0.2,
      lineColor: [120, 120, 120],
    },
    headStyles: {
      fillColor: [15, 118, 110],
      lineWidth: 0.25,
      lineColor: [80, 80, 80],
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      lineWidth: 0.2,
      lineColor: [120, 120, 120],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    didDrawPage: () => {
      pdf.setFontSize(8);
    },
  });

  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 47;
  let signatureY = finalY + 18;
  const pageHeight = pdf.internal.pageSize.getHeight();

  if (signatureY + 40 > pageHeight) {
    pdf.addPage();
    signatureY = 40;
  }

  const signTextX = 198;
  const signLineWidth = 72;
  pdf.setFontSize(10);
  pdf.text(`Tanggal, ${formatSignatureDate(signatureDate)}`, signTextX, signatureY);
  pdf.text("Mengetahui,", signTextX, signatureY + 6);
  pdf.text("Kepala Sekolah", signTextX, signatureY + 12);
  pdf.line(signTextX - 6, signatureY + 24, signTextX + signLineWidth, signatureY + 24);
  pdf.text(headmasterName || "(Nama Kepala Sekolah)", signTextX + signLineWidth / 2 - 6, signatureY + 32, {
    align: "center",
  });

  pdf.save(fileName);
}

function buildMergedExamPdfBody(rows: PdfRow[]) {
  const keys = ["date", "day", "time", "className", "subject", "teacher", "examType", "notes"] as const;
  const mergeKeys = ["date", "day", "time", "className", "teacher", "examType"] as const;

  const rowSpans = rows.map(() =>
    Object.fromEntries(keys.map((key) => [key, 1])) as Record<(typeof keys)[number], number>,
  );

  mergeKeys.forEach((key) => {
    let start = 0;

    while (start < rows.length) {
      let end = start + 1;

      while (end < rows.length && rows[end][key] === rows[start][key]) {
        end += 1;
      }

      rowSpans[start][key] = end - start;
      for (let i = start + 1; i < end; i += 1) {
        rowSpans[i][key] = 0;
      }

      start = end;
    }
  });

  return rows.map((row, rowIndex) => {
    const output: Record<string, string | { content: string; rowSpan: number }> = {};

    keys.forEach((key) => {
      const span = rowSpans[rowIndex][key];
      if (span === 0) {
        return;
      }

      const value = row[key] || "-";
      output[key] = span > 1 ? { content: value, rowSpan: span } : value;
    });

    return output;
  });
}

function formatSignatureDate(value: string) {
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
