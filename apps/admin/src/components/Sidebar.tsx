import Link from "next/link";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5%22/%3E%3C/svg%3E")', backgroundColor: 'var(--primary)' }}></span>
        iDraft
      </div>

      <div className={styles.navSection}>
        <ul className={styles.navList}>
          <li>
            <Link href="/" className={`${styles.navItem} ${styles.active}`}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Crect x=%223%22 y=%223%22 width=%227%22 height=%227%22/%3E%3Crect x=%2214%22 y=%223%22 width=%227%22 height=%227%22/%3E%3Crect x=%2214%22 y=%2214%22 width=%227%22 height=%227%22/%3E%3Crect x=%223%22 y=%2214%22 width=%227%22 height=%227%22/%3E%3C/svg%3E")' }}></span>
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/calendar" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Crect x=%223%22 y=%224%22 width=%2218%22 height=%2218%22 rx=%222%22 ry=%222%22/%3E%3Cline x1=%2216%22 y1=%222%22 x2=%2216%22 y2=%226%22/%3E%3Cline x1=%228%22 y1=%222%22 x2=%228%22 y2=%226%22/%3E%3Cline x1=%223%22 y1=%2210%22 x2=%2221%22 y2=%2210%22/%3E%3C/svg%3E")' }}></span>
              Calendar
            </Link>
          </li>
          <li>
            <Link href="/tasks" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z%22/%3E%3Cpolyline points=%2214 2 14 8 20 8%22/%3E%3Cline x1=%2216%22 y1=%2213%22 x2=%228%22 y2=%2213%22/%3E%3Cline x1=%2216%22 y1=%2217%22 x2=%228%22 y2=%2217%22/%3E%3Cpolyline points=%2210 9 9 9 8 9%22/%3E%3C/svg%3E")' }}></span>
              My Tasks
            </Link>
          </li>
          <li>
            <Link href="/statistics" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpolyline points=%2222 12 18 12 15 21 9 3 6 12 2 12%22/%3E%3C/svg%3E")' }}></span>
              Statistics
            </Link>
          </li>
          <li>
            <Link href="/clients" className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z%22/%3E%3C/svg%3E")' }}></span>
              Documents
            </Link>
          </li>
        </ul>
      </div>

      <div className={styles.navSection}>
        <h3 className={styles.sectionTitle}>Integrations</h3>
        <ul className={styles.navList}>
          <li>
            <div className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M22 12h-4l-3 9L9 3l-3 9H2%22/%3E%3C/svg%3E")' }}></span>
              Slack
            </div>
          </li>
          <li>
            <div className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z%22/%3E%3Cpolyline points=%2222,6 12,13 2,6%22/%3E%3C/svg%3E")' }}></span>
              Notion
            </div>
          </li>
          <li>
            <div className={styles.navItem}>
              <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3Cline x1=%2212%22 y1=%228%22 x2=%2212%22 y2=%2216%22/%3E%3Cline x1=%228%22 y1=%2212%22 x2=%2216%22 y2=%2212%22/%3E%3C/svg%3E")' }}></span>
              Add new plugin
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.navSection}>
        <h3 className={styles.sectionTitle}>Teams</h3>
        <ul className={styles.navList}>
          <li>
            <div className={styles.navItem}>
              <span className={styles.teamDot} style={{ color: '#000000' }}></span>
              SEO
            </div>
          </li>
          <li>
            <div className={styles.navItem}>
              <span className={styles.teamDot} style={{ color: '#aaaaaa' }}></span>
              Marketing
            </div>
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
