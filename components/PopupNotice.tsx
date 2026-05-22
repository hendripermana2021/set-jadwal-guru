"use client";

type PopupNoticeProps = {
  message: string;
  onClose: () => void;
};

export default function PopupNotice({ message, onClose }: PopupNoticeProps) {
  return (
    <div className="popup-overlay" role="alertdialog" aria-modal="true" aria-label="Notifikasi">
      <div className="popup-card">
        <h3>Notifikasi</h3>
        <p>{message}</p>
        <div className="popup-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
