"use client";

import { useState } from "react";
import PopupNotice from "@/components/PopupNotice";
import { loadData, saveData } from "@/lib/storage";
import { AppData } from "@/lib/types";

export default function JamPelajaranPage() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [slotStart, setSlotStart] = useState("07:00");
  const [slotEnd, setSlotEnd] = useState("08:00");
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("07:00");
  const [editEnd, setEditEnd] = useState("08:00");
  const [popupMessage, setPopupMessage] = useState("");

  function updateData(nextData: AppData) {
    setData(nextData);
    saveData(nextData);
  }

  function addTimeSlot() {
    const next = toSlotLabel(slotStart, slotEnd);
    if (!next) {
      setPopupMessage("Jam selesai harus lebih besar dari jam mulai.");
      return;
    }

    if (data.timeSlots.includes(next)) {
      setPopupMessage("Slot jam tersebut sudah ada.");
      return;
    }

    updateData({
      ...data,
      timeSlots: sortSlots([...data.timeSlots, next]),
    });

    setPopupMessage("Slot jam berhasil ditambahkan.");
  }

  function beginEditSlot(slot: string) {
    const [start, end] = slot.split("-");
    setEditingSlot(slot);
    setEditStart(start);
    setEditEnd(end);
  }

  function saveEditSlot() {
    if (!editingSlot) {
      return;
    }

    const replacement = toSlotLabel(editStart, editEnd);
    if (!replacement) {
      setPopupMessage("Jam selesai harus lebih besar dari jam mulai.");
      return;
    }

    if (replacement !== editingSlot && data.timeSlots.includes(replacement)) {
      setPopupMessage("Slot jam pengganti sudah ada.");
      return;
    }

    const nextSlots = sortSlots(data.timeSlots.map((slot) => (slot === editingSlot ? replacement : slot)));
    const nextSchedules = data.schedules.map((item) =>
      item.timeSlot === editingSlot ? { ...item, timeSlot: replacement } : item,
    );
    const nextExamSchedules = data.examSchedules.map((item) =>
      item.timeSlot === editingSlot ? { ...item, timeSlot: replacement } : item,
    );

    const nextRules = data.teacherRules.map((rule) => ({
      ...rule,
      blockedSlots: rule.blockedSlots.map((key) => {
        const [day, slot] = key.split("|");
        return slot === editingSlot ? `${day}|${replacement}` : key;
      }),
    }));

    updateData({
      ...data,
      timeSlots: nextSlots,
      schedules: nextSchedules,
      examSchedules: nextExamSchedules,
      teacherRules: nextRules,
    });

    setEditingSlot(null);
    setPopupMessage("Slot jam berhasil diubah.");
  }

  function removeTimeSlot(slot: string) {
    const used = data.schedules.some((item) => item.timeSlot === slot);
    const usedByExam = data.examSchedules.some((item) => item.timeSlot === slot);
    if (used || usedByExam) {
      setPopupMessage("Slot jam tidak bisa dihapus karena masih digunakan di roster atau jadwal ujian.");
      return;
    }

    const nextRules = data.teacherRules.map((rule) => ({
      ...rule,
      blockedSlots: rule.blockedSlots.filter((key) => key.split("|")[1] !== slot),
    }));

    updateData({
      ...data,
      timeSlots: data.timeSlots.filter((item) => item !== slot),
      teacherRules: nextRules,
    });

    setPopupMessage("Slot jam berhasil dihapus.");
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Jam Pelajaran</h1>
        <p>Kelola slot jam pelajaran di halaman terpisah. Perubahan otomatis memengaruhi jadwal semua kelas.</p>
      </div>

      <section className="panel-sub">
        <h2>Tambah Slot Jam</h2>
        <div className="row-form">
          <label>
            Mulai
            <input type="time" value={slotStart} onChange={(event) => setSlotStart(event.target.value)} />
          </label>
          <label>
            Selesai
            <input type="time" value={slotEnd} onChange={(event) => setSlotEnd(event.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={addTimeSlot}>
            Tambah Slot Jam
          </button>
        </div>
      </section>

      <section className="panel-sub">
        <h2>Daftar Slot Jam</h2>
        <div className="slot-chip-list">
          {data.timeSlots.map((slot) => (
            <div key={slot} className="slot-chip">
              {editingSlot === slot ? (
                <>
                  <input type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)} />
                  <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} />
                  <button type="button" className="btn btn-primary" onClick={saveEditSlot}>
                    Simpan
                  </button>
                  <button type="button" className="btn" onClick={() => setEditingSlot(null)}>
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <strong>{slot}</strong>
                  <button type="button" className="btn" onClick={() => beginEditSlot(slot)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => removeTimeSlot(slot)}>
                    Hapus
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {popupMessage ? <PopupNotice message={popupMessage} onClose={() => setPopupMessage("")} /> : null}
    </section>
  );
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
