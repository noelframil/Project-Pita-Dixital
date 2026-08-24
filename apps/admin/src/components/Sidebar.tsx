import Link from "next/link";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5%22/%3E%3C/svg%3E")', backgroundColor: 'var(--primary)' }}></span>
        Pita Dixital
      </div>

      <div className={styles.navSection}>
        <ul className={styles.navList}>
          <li>
            <Link href="/" className={`${styles.navItem} ${styles.active}`}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Crect x=%223%22 y=%223%22 width=%227%22 height=%227%22/%3E%3Crect x=%2214%22 y=%223%22 width=%227%22 height=%227%22/%3E%3Crect x=%2214%22 y=%2214%22 width=%227%22 height=%227%22/%3E%3Crect x=%223%22 y=%2214%22 width=%227%22 height=%227%22/%3E%3C/svg%3E")' }}></span>
              Dashboard Principal
            </Link>
          </li>
          <li>
            <Link href="/clients" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z%22/%3E%3C/svg%3E")' }}></span>
              Agentes & Clients
            </Link>
          </li>
          <li>
            <Link href="/memory" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z%22/%3E%3Cpath d=%22M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z%22/%3E%3C/svg%3E")' }}></span>
              Memoria Semántica
            </Link>
          </li>
          <li>
            <Link href="/llmops" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpolyline points=%2222 12 18 12 15 21 9 3 6 12 2 12%22/%3E%3C/svg%3E")' }}></span>
              Observabilidad
            </Link>
          </li>
        </ul>
      </div>

      <div className={styles.spacer} />

      <div className={styles.navSection}>
        <ul className={styles.navList}>
          <li>
            <Link href="/settings" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%223%22/%3E%3Cpath d=%22M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z%22/%3E%3C/svg%3E")' }}></span>
              Settings
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
