import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.dashboardGrid}>
      {/* OVERALL INFORMATION */}
      <div className={`${styles.card} ${styles.cardDark} ${styles.overallCard}`}>
        <h2 className={styles.cardTitle}>
          Overall Information
          <span>⋮</span>
        </h2>
        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <h3>43</h3>
            <p>Tasks done for all time</p>
          </div>
          <div className={styles.statItem}>
            <h3>2</h3>
            <p>Projects are stopped</p>
          </div>
        </div>
        <div className={styles.miniCardsRow}>
          <div className={styles.miniCard}>
            <span className={styles.taskIconBtn} style={{ margin: '0 auto', background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' }}>◎</span>
            <h4>28</h4>
            <p>Projects</p>
          </div>
          <div className={styles.miniCard}>
            <span className={styles.taskIconBtn} style={{ margin: '0 auto', background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' }}>◌</span>
            <h4>14</h4>
            <p>In Progress</p>
          </div>
          <div className={styles.miniCard}>
            <span className={styles.taskIconBtn} style={{ margin: '0 auto', background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' }}>◉</span>
            <h4>11</h4>
            <p>Completed</p>
          </div>
        </div>
      </div>

      {/* WEEKLY PROGRESS */}
      <div className={`${styles.card} ${styles.cardLight} ${styles.weeklyCard}`}>
        <h2 className={styles.cardTitle}>
          Weekly progress
          <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--foreground)' }}>↻</span>
        </h2>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--foreground)' }}></span> Sport</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ccc' }}></span> Study</span>
        </div>
        <div className={styles.chartPlaceholder}></div>
      </div>

      {/* MONTH PROGRESS */}
      <div className={`${styles.card} ${styles.cardLight} ${styles.monthCard}`}>
        <h2 className={styles.cardTitle}>
          Month progress
          <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--foreground)' }}>📈</span>
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>+20% compared to last month</p>
        <div className={styles.circleProgress}>
          120%
        </div>
        <button className={styles.downloadBtn}>
          Download Report <span>↓</span>
        </button>
      </div>

      {/* GOALS */}
      <div className={`${styles.card} ${styles.cardLight} ${styles.goalsCard}`}>
        <h2 className={styles.cardTitle}>
          Month goals:
          <span>✏️</span>
        </h2>
        <div className={styles.goalList}>
          <label className={`${styles.goalItem} ${styles.completed}`}>
            <input type="checkbox" checked readOnly /> Read 2 books
          </label>
          <label className={styles.goalItem}>
            <input type="checkbox" readOnly /> Sports every day
          </label>
          <label className={styles.goalItem}>
            <input type="checkbox" readOnly /> Complete the course
          </label>
          <label className={styles.goalItem}>
            <input type="checkbox" readOnly /> Bend down with a parachute
          </label>
        </div>
      </div>

      {/* TASKS IN PROCESS */}
      <div className={styles.tasksContainer}>
        <div className={styles.tasksHeader}>
          Task in process (2)
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Open archive &gt;</span>
        </div>
        <div className={styles.tasksGrid}>
          <div className={styles.taskItem}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.2rem' }}>🎁</span>
                <span style={{ cursor: 'pointer' }}>...</span>
              </div>
              <h4>Buy Susan a gift for Bitherday</h4>
            </div>
            <div className={styles.taskItemFooter}>
              <span>Today</span>
              <button className={styles.taskIconBtn}>🔔</button>
            </div>
          </div>

          <div className={styles.taskItem}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.2rem' }}>🏥</span>
                <span style={{ cursor: 'pointer' }}>...</span>
              </div>
              <h4>Doctor's appointment on Tuesday</h4>
            </div>
            <div className={styles.taskItemFooter}>
              <span>02.09.2023</span>
              <button className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' }}>🔔</button>
            </div>
          </div>

          <div className={`${styles.taskItem} ${styles.addTask}`}>
            + Add task
          </div>
        </div>
      </div>

      {/* LAST PROJECTS */}
      <div className={styles.lastProjectsSection}>
        <div className={styles.projectsHeader}>
          Last Projects
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>Sort by <span>∨</span> <span>☷</span></span>
        </div>
        <div className={styles.projectsGrid}>
          <div className={styles.projectCard}>
            <div className={styles.projectTitle}>
              <h3>New Schedule</h3>
              <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--text-on-dark)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%' }}>3/6</span>
            </div>
            <span className={styles.projectStatus}>In progress</span>
            <p className={styles.projectDesc}>
              Done: Develop a new plan for Alina's education; Print a new timetable; Buy ...
            </p>
          </div>

          <div className={styles.projectCard}>
            <div className={styles.projectTitle}>
              <h3>Prototype animation</h3>
              <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--text-on-dark)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%' }}>1/1</span>
            </div>
            <span className={styles.projectStatus} style={{ opacity: 0.7 }}>Completed</span>
          </div>

          <div className={styles.projectCard}>
            <div className={styles.projectTitle}>
              <h3>Ai Project 2 part</h3>
              <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--text-on-dark)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%' }}>2/8</span>
            </div>
            <span className={styles.projectStatus}>In progress</span>
          </div>
        </div>
      </div>
    </div>
  );
}
