"use client";

import { useState } from "react";
import { createEmptyData, loadData, saveData } from "@/lib/storage";
import { AppData, DAYS, DayName, TeacherRule } from "@/lib/types";
import * as XLSX from "xlsx";
import PopupNotice from "@/components/PopupNotice";

type ImportMode = "replace" | "merge";

type ImportPreview = {
  fileName: string;
  data: AppData;
  summary: ImportSummaryItem[];
  sheets: ImportSheetPreview[];
};

type ImportSummaryItem = {
  label: string;
  count: number;
};

type ImportSheetPreview = {
  label: string;
  count: number;
};

export default function DataPage() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("replace");

  function refresh() {
    setData(loadData());
  }

  function handleExportExcel() {
    const current = loadData();
    const workbook = XLSX.utils.book_new();

    const addSheet = (name: string, title: string, rows: Record<string, unknown>[]) => {
      const worksheet = XLSX.utils.aoa_to_sheet([[title], []]);
      XLSX.utils.sheet_add_json(worksheet, rows, {
        origin: "A3",
        skipHeader: false,
      });

      const columnCount = rows.length > 0 ? Object.keys(rows[0]).length : 1;
      worksheet["!cols"] = Array.from({ length: columnCount }, () => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(workbook, worksheet, name);
    };

    addSheet("Guru", "Data Guru", current.teachers);
    addSheet("Kelas", "Data Kelas", current.classes);
    addSheet("Mapel", "Data Mata Pelajaran", current.subjects);
    addSheet("Jadwal", "Data Jadwal", current.schedules);
    addSheet("Ujian", "Data Jadwal Ujian", current.examSchedules);
      addSheet(
        "JamPelajaran",
        "Daftar Slot Jam",
        current.timeSlots.map((slot) => ({ slot })),
      );
      addSheet(
        "JamUjian",
        "Daftar Slot Jam Ujian",
        current.examTimeSlots.map((slot) => ({ slot })),
      );
    addSheet(
      "AturanGuru",
      "Aturan Guru",
      current.teacherRules.map((rule) => ({
        teacherId: rule.teacherId,
        blockedSlots: rule.blockedSlots.join(";"),
      })),
    );

    const summary = XLSX.utils.aoa_to_sheet([
      ["Ringkasan Data"],
      [],
      ["Kategori", "Jumlah"],
      ["Guru", current.teachers.length],
      ["Kelas", current.classes.length],
      ["Mapel", current.subjects.length],
      ["Jadwal", current.schedules.length],
      ["Ujian", current.examSchedules.length],
        ["Aturan Guru", current.teacherRules.length],
        ["Jam Ujian", current.examTimeSlots.length],
    ]);
    summary["!cols"] = [{ wch: 24 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, summary, "Ringkasan");

    XLSX.writeFile(workbook, `backup-roster-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMessage("Export Excel berhasil.");
  }

  function handleExportTemplateExcel() {
    const workbook = createBackupTemplateWorkbook();
    XLSX.writeFile(workbook, `template-backup-roster.xlsx`);
    setMessage("Template Excel berhasil diunduh.");
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Hanya file Excel (.xlsx) yang didukung.");
      }

      const nextData = await readExcelFile(file);

      setPendingImport({
        fileName: file.name,
        data: nextData,
        summary: buildImportSummary(nextData),
        sheets: buildImportSheetPreview(nextData),
      });
      setImportMode("replace");
      setMessage("File berhasil dibaca. Pilih mode import terlebih dahulu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import gagal.");
    } finally {
      event.target.value = "";
    }
  }

  function applyImport() {
    if (!pendingImport) {
      return;
    }

    const nextData = importMode === "merge" ? mergeImportedData(data, pendingImport.data) : pendingImport.data;

    if (isEmptyMeaningfulData(nextData)) {
      setMessage("Data import tidak berisi isi yang bisa dipakai.");
      return;
    }

    saveData(nextData);
    setData(nextData);
    setPendingImport(null);
    setMessage(importMode === "merge" ? "Import berhasil digabung." : "Import berhasil.");
  }

  function cancelImport() {
    setPendingImport(null);
    setMessage("Import dibatalkan.");
  }

  function handleClearAll() {
    if (!confirm("Yakin hapus semua data aplikasi?")) {
      return;
    }

    saveData({
      ...createEmptyData(),
    });
    refresh();
    setMessage("Semua data sudah dihapus.");
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Import / Export Data</h1>
        <p>Gunakan menu ini untuk backup dan restore data lewat Excel karena aplikasi tidak menggunakan database.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>{data.teachers.length}</h3>
          <p>Guru</p>
        </div>
        <div className="stat-card">
          <h3>{data.classes.length}</h3>
          <p>Kelas</p>
        </div>
        <div className="stat-card">
          <h3>{data.subjects.length}</h3>
          <p>Mata Pelajaran</p>
        </div>
        <div className="stat-card">
          <h3>{data.schedules.length}</h3>
          <p>Kartu Jadwal</p>
        </div>
        <div className="stat-card">
          <h3>{data.examSchedules.length}</h3>
          <p>Jadwal Ujian</p>
        </div>
      </div>

      <div className="row-form">
        <button type="button" className="btn btn-primary" onClick={handleExportExcel}>
          Backup Data
        </button>
        <button type="button" className="btn" onClick={handleExportTemplateExcel}>
          Unduh Template Data
        </button>
        <label className="btn" htmlFor="import-json">
          Import Data
        </label>
        <input id="import-json" type="file" hidden accept=".xlsx" onChange={handleImport} />
        <button type="button" className="btn btn-danger" onClick={handleClearAll}>
          Hapus Semua Data
        </button>
      </div>

      {pendingImport ? (
        <section className="panel-sub">
          <h2>Preview Import</h2>
          <p className="muted">File: {pendingImport.fileName}</p>

          <div className="summary-strip">
            {pendingImport.summary.map((item) => (
              <span key={item.label}>
                {item.label}: {item.count}
              </span>
            ))}
          </div>

          <div className="sheet-preview-grid">
            {pendingImport.sheets.map((sheet) => (
              <article key={sheet.label} className="sheet-preview-card">
                <h3>{sheet.label}</h3>
                <p>{sheet.count} baris data</p>
              </article>
            ))}
          </div>

          <div className="row-form">
            <label>
              Mode Import
              <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)}>
                <option value="replace">Ganti semua data</option>
                <option value="merge">Gabungkan dengan data sekarang</option>
              </select>
            </label>

            <button type="button" className="btn btn-primary" onClick={applyImport}>
              Jalankan Import
            </button>
            <button type="button" className="btn" onClick={cancelImport}>
              Batal
            </button>
          </div>
        </section>
      ) : null}

      {message ? <PopupNotice message={message} onClose={() => setMessage("")} /> : null}
    </section>
  );
}

function createBackupTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();

  addTemplateSheet(workbook, "Guru", "Data Guru", ["name"]);
  addTemplateSheet(workbook, "Kelas", "Data Kelas", ["name"]);
  addTemplateSheet(workbook, "Mapel", "Data Mata Pelajaran", ["name"]);
  addTemplateSheet(workbook, "Jadwal", "Data Jadwal", ["teacherId", "classId", "subjectId", "day", "timeSlot"]);
  addTemplateSheet(workbook, "Ujian", "Data Jadwal Ujian", [
    "classId",
    "subjectId",
    "teacherId",
    "date",
    "timeSlot",
    "examType",
    "notes",
  ]);
  addTemplateSheet(workbook, "JamPelajaran", "Daftar Slot Jam", ["slot"]);
  addTemplateSheet(workbook, "JamUjian", "Daftar Slot Jam Ujian", ["slot"]);
  addTemplateSheet(workbook, "AturanGuru", "Aturan Guru", ["teacherId", "blockedSlots"]);

  const summary = XLSX.utils.aoa_to_sheet([
    ["Template Backup Data"],
    [],
    ["Kategori", "Keterangan"],
    ["Guru", "Isi name (id dibuat otomatis saat import)"],
    ["Kelas", "Isi name (id dibuat otomatis saat import)"],
    ["Mapel", "Isi name (id dibuat otomatis saat import)"],
    ["Jadwal", "Isi relasi teacherId, classId, subjectId"],
    ["Ujian", "Isi relasi dan tanggal"],
    ["Jam Pelajaran", "Isi slot jam di kolom slot"],
    ["Jam Ujian", "Isi slot jam ujian di kolom slot"],
    ["Aturan Guru", "Isi teacherId dan blockedSlots dipisah ;"],
  ]);
  summary["!cols"] = [{ wch: 24 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Ringkasan");

  return workbook;
}

function addTemplateSheet(workbook: XLSX.WorkBook, name: string, title: string, headers: string[]) {
  const worksheet = XLSX.utils.aoa_to_sheet([[title], [], headers]);
  worksheet["!cols"] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

async function readExcelFile(file: File): Promise<AppData> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });

  const teachers = sheetToMasterItems(workbook, "Guru");
  const classes = sheetToMasterItems(workbook, "Kelas");
  const subjects = sheetToMasterItems(workbook, "Mapel");
  const schedules = sheetToSchedules(workbook, "Jadwal");
  const examSchedules = sheetToExamSchedules(workbook, "Ujian");
  const teacherRules = sheetToTeacherRules(workbook, "AturanGuru");
  const importedSlots = sheetToTimeSlots(workbook, "JamPelajaran");
  const importedExamSlots = sheetToTimeSlots(workbook, "JamUjian");

  const nextData = {
    ...createEmptyData(),
    teachers,
    classes,
    subjects,
    schedules,
    examSchedules,
    teacherRules,
    timeSlots: importedSlots.length > 0 ? importedSlots : createEmptyData().timeSlots,
    examTimeSlots: importedExamSlots.length > 0 ? importedExamSlots : createEmptyData().examTimeSlots,
  };

  if (isEmptyMeaningfulData(nextData)) {
    throw new Error("File Excel tidak berisi data backup yang valid.");
  }

  return nextData;
}

function sheetToMasterItems(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: 2 });
  return rows
    .map((row) => ({
      id: normalizeId(row.id),
      name: String(row.name ?? "").trim(),
    }))
    .filter((row) => row.name.length > 0);
}

function sheetToSchedules(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: 2 });
  return rows
    .map((row) => ({
      id: normalizeId(row.id),
      teacherId: String(row.teacherId ?? "").trim(),
      classId: String(row.classId ?? "").trim(),
      subjectId: String(row.subjectId ?? "").trim(),
      day: normalizeDay(row.day),
      timeSlot: row.timeSlot ? String(row.timeSlot) : undefined,
    }))
    .filter((row) => row.teacherId && row.classId && row.subjectId);
}

function sheetToTeacherRules(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: 2 });
  return rows
    .map((row) => ({
      teacherId: String(row.teacherId ?? "").trim(),
      blockedSlots: String(row.blockedSlots ?? "")
        .split(";")
        .map((slot) => slot.trim())
        .filter(Boolean),
    }))
    .filter((row) => row.teacherId.length > 0);
}

function sheetToExamSchedules(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: 2 });
  return rows
    .map((row) => ({
      id: normalizeId(row.id),
      classId: String(row.classId ?? "").trim(),
      subjectId: String(row.subjectId ?? "").trim(),
      teacherId: String(row.teacherId ?? "").trim(),
      date: String(row.date ?? "").trim(),
      timeSlot: String(row.timeSlot ?? "").trim(),
      examType: String(row.examType ?? "").trim() || "Ujian",
      notes: String(row.notes ?? "").trim(),
    }))
    .filter((row) => row.classId && row.subjectId && row.teacherId && row.date && row.timeSlot)
    .map((row) => ({
      ...row,
      notes: row.notes || undefined,
    }));
}

function sheetToTimeSlots(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: 2 });
  return rows
    .map((row) => String(row.slot ?? row.timeSlot ?? "").trim())
    .filter((row) => row.length > 0);
}

function mergeImportedData(current: AppData, incoming: AppData): AppData {
  return {
    teachers: mergeById(current.teachers, incoming.teachers),
    classes: mergeById(current.classes, incoming.classes),
    subjects: mergeById(current.subjects, incoming.subjects),
    schedules: mergeById(current.schedules, incoming.schedules),
    examSchedules: mergeById(current.examSchedules, incoming.examSchedules),
    teacherRules: mergeTeacherRules(current.teacherRules, incoming.teacherRules),
    timeSlots: mergeUniqueStrings(current.timeSlots, incoming.timeSlots),
    examTimeSlots: mergeUniqueStrings(current.examTimeSlots, incoming.examTimeSlots),
  };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const map = new Map<string, T>();
  current.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function mergeTeacherRules(current: TeacherRule[], incoming: TeacherRule[]) {
  const map = new Map<string, TeacherRule>();
  current.forEach((item) => map.set(item.teacherId, item));
  incoming.forEach((item) => map.set(item.teacherId, item));
  return [...map.values()];
}

function mergeUniqueStrings(current: string[], incoming: string[]) {
  return [...new Set([...current, ...incoming].map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
}

function buildImportSummary(data: AppData): ImportSummaryItem[] {
  return [
    { label: "Guru", count: data.teachers.length },
    { label: "Kelas", count: data.classes.length },
    { label: "Mapel", count: data.subjects.length },
    { label: "Jadwal", count: data.schedules.length },
    { label: "Ujian", count: data.examSchedules.length },
    { label: "Aturan Guru", count: data.teacherRules.length },
    { label: "Slot Jam", count: data.timeSlots.length },
    { label: "Slot Jam Ujian", count: data.examTimeSlots.length },
  ];
}

function buildImportSheetPreview(data: AppData): ImportSheetPreview[] {
  return [
    { label: "Guru", count: data.teachers.length },
    { label: "Kelas", count: data.classes.length },
    { label: "Mapel", count: data.subjects.length },
    { label: "Jadwal", count: data.schedules.length },
    { label: "Ujian", count: data.examSchedules.length },
    { label: "Jam Pelajaran", count: data.timeSlots.length },
    { label: "Jam Ujian", count: data.examTimeSlots.length },
    { label: "Aturan Guru", count: data.teacherRules.length },
  ];
}

function isEmptyMeaningfulData(data: AppData) {
  return (
    data.teachers.length === 0 &&
    data.classes.length === 0 &&
    data.subjects.length === 0 &&
    data.schedules.length === 0 &&
    data.examSchedules.length === 0 &&
    data.teacherRules.length === 0
  );
}

function normalizeId(value: unknown) {
  const id = String(value ?? "").trim();
  return id.length > 0 ? id : crypto.randomUUID();
}


function normalizeDay(value: unknown): DayName | undefined {
  const day = String(value ?? "").trim();
  return DAYS.includes(day as DayName) ? (day as DayName) : undefined;
}
