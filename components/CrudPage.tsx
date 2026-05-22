"use client";

import { useMemo, useState } from "react";
import { AppData, MasterItem } from "@/lib/types";
import { loadData, saveData } from "@/lib/storage";
import PopupNotice from "@/components/PopupNotice";

type SectionKey = "teachers" | "classes" | "subjects";

type CrudPageProps = {
  title: string;
  description: string;
  section: SectionKey;
};

export default function CrudPage({ title, description, section }: CrudPageProps) {
  const [data, setData] = useState<AppData>(() => loadData());
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [popupMessage, setPopupMessage] = useState("");

  const items = useMemo(() => {
    return data[section];
  }, [data, section]);

  function updateItems(nextItems: MasterItem[]) {
    const nextData = {
      ...data,
      [section]: nextItems,
    };

    setData(nextData);
    saveData(nextData);
  }

  function validateName(name: string, excludeId?: string): string | null {
    const normalized = name.trim();
    if (!normalized) {
      return "Nama tidak boleh kosong.";
    }

    const exists = items.some(
      (item) => item.id !== excludeId && item.name.toLowerCase() === normalized.toLowerCase(),
    );

    if (exists) {
      return "Nama sudah ada.";
    }

    return null;
  }

  function handleAdd() {
    const message = validateName(newName);
    if (message) {
      setPopupMessage(message);
      return;
    }

    updateItems([
      ...items,
      {
        id: crypto.randomUUID(),
        name: newName.trim(),
      },
    ]);

    setNewName("");
    setPopupMessage("");
  }

  function handleDelete(id: string) {
    const rosterUsageCount = data.schedules.filter((schedule) => {
      if (section === "teachers") {
        return schedule.teacherId === id;
      }

      if (section === "classes") {
        return schedule.classId === id;
      }

      return schedule.subjectId === id;
    }).length;

    const examUsageCount = data.examSchedules.filter((exam) => {
      if (section === "teachers") {
        return exam.teacherId === id;
      }

      if (section === "classes") {
        return exam.classId === id;
      }

      return exam.subjectId === id;
    }).length;

    const totalUsage = rosterUsageCount + examUsageCount;

    if (totalUsage > 0) {
      setPopupMessage(
        `${title} ini tidak bisa dihapus karena masih dipakai oleh ${rosterUsageCount} roster dan ${examUsageCount} jadwal ujian. Hapus atau pindahkan data terkait terlebih dahulu.`,
      );
      return;
    }

    const nextItems = items.filter((item) => item.id !== id);
    updateItems(nextItems);
    setPopupMessage("");
  }

  function handleEditStart(item: MasterItem) {
    setEditingId(item.id);
    setEditingName(item.name);
    setPopupMessage("");
  }

  function handleEditSave() {
    if (!editingId) {
      return;
    }

    const message = validateName(editingName, editingId);
    if (message) {
      setPopupMessage(message);
      return;
    }

    const nextItems = items.map((item) => {
      if (item.id !== editingId) {
        return item;
      }
      return {
        ...item,
        name: editingName.trim(),
      };
    });

    updateItems(nextItems);
    setEditingId(null);
    setEditingName("");
    setPopupMessage("");
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="row-form">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={`Tambah ${title.toLowerCase()} baru`}
        />
        <button onClick={handleAdd} className="btn btn-primary" type="button">
          Tambah
        </button>
      </div>

      {popupMessage ? <PopupNotice message={popupMessage} onClose={() => setPopupMessage("")} /> : null}

      <div className="list-box">
        {items.length === 0 ? <p className="muted">Belum ada data.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="list-row">
            {editingId === item.id ? (
              <input
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
              />
            ) : (
              <strong>{item.name}</strong>
            )}

            <div className="row-actions">
              {editingId === item.id ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={handleEditSave}>
                    Simpan
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditingId(null);
                      setEditingName("");
                    }}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => handleEditStart(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(item.id)}
                  >
                    Hapus
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
