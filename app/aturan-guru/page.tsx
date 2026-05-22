"use client";

import { useMemo, useState } from "react";
import { loadData, saveData } from "@/lib/storage";
import { AppData, DAYS } from "@/lib/types";

export default function AturanGuruPage() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [teacherId, setTeacherId] = useState("");

  const selectedRule = useMemo(() => {
    return data.teacherRules.find((item) => item.teacherId === teacherId);
  }, [data, teacherId]);

  function updateData(nextData: AppData) {
    setData(nextData);
    saveData(nextData);
  }

  function toggleSlot(day: string, timeSlot: string) {
    if (!teacherId) {
      return;
    }

    const key = `${day}|${timeSlot}`;
    const currentSet = new Set(selectedRule?.blockedSlots ?? []);
    if (currentSet.has(key)) {
      currentSet.delete(key);
    } else {
      currentSet.add(key);
    }

    const nextRules = data.teacherRules.filter((item) => item.teacherId !== teacherId);
    nextRules.push({ teacherId, blockedSlots: [...currentSet] });

    updateData({
      ...data,
      teacherRules: nextRules,
    });
  }

  function clearRules() {
    if (!teacherId) {
      return;
    }

    updateData({
      ...data,
      teacherRules: data.teacherRules.filter((item) => item.teacherId !== teacherId),
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Aturan Jam Khusus Guru</h1>
        <p>Tandai slot yang tidak bisa diambil guru. Sistem akan menolak penempatan drag-drop ke slot terlarang.</p>
      </div>

      <div className="row-form">
        <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
          <option value="">Pilih Guru</option>
          {data.teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>

        <button type="button" className="btn" onClick={clearRules} disabled={!teacherId}>
          Reset Aturan Guru
        </button>
      </div>

      {!teacherId ? <p className="muted">Pilih guru untuk mengatur slot jam yang diblokir.</p> : null}

      {teacherId ? (
        <div className="rules-grid">
          {DAYS.map((day) => (
            <article key={day} className="rule-day">
              <h3>{day}</h3>
              <div className="rule-slots">
                {data.timeSlots.map((slot) => {
                  const key = `${day}|${slot}`;
                  const blocked = selectedRule?.blockedSlots.includes(key) ?? false;

                  return (
                    <button
                      key={key}
                      type="button"
                      className={blocked ? "slot-btn blocked" : "slot-btn"}
                      onClick={() => toggleSlot(day, slot)}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
