export default function AppLogo() {
  return (
    <div className="app-brand" aria-label="Aplikasi Pengatur Jam">
      <svg
        className="app-brand-logo"
        viewBox="0 0 72 72"
        role="img"
        aria-label="Logo Aplikasi Pengatur Jam"
      >
        <defs>
          <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#0a5a89" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="64" height="64" rx="18" fill="url(#brandGradient)" />
        <path
          d="M20 26C20 22.7 22.7 20 26 20H46C49.3 20 52 22.7 52 26V46C52 49.3 49.3 52 46 52H26C22.7 52 20 49.3 20 46V26Z"
          fill="#ffffff"
          opacity="0.95"
        />
        <rect x="20" y="27" width="32" height="6" fill="#d7f4ef" />
        <circle cx="35" cy="41" r="8" fill="#0f766e" opacity="0.2" />
        <path d="M35 36V41L39 44" stroke="#0f766e" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="26" y="17" width="4" height="8" rx="2" fill="#ffffff" />
        <rect x="42" y="17" width="4" height="8" rx="2" fill="#ffffff" />
      </svg>

      <div>
        <h1 className="app-brand-title">Aplikasi Pengatur Jam</h1>
        <p className="app-brand-subtitle">Roster Guru dan Jadwal Ujian</p>
      </div>
    </div>
  );
}
