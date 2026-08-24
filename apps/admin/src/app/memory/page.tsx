import Link from "next/link";
import styles from "../clients/page.module.css"; // Reusing the same layout styles

export default function MemoryPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'inline-block', fontSize: '0.9rem', textDecoration: 'none' }}>
            &larr; Volver al Dashboard
          </Link>
          <h1 className={styles.title}>Memoria Semántica</h1>
        </div>
      </header>

      <div className={styles.tableContainer} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧠</div>
        <h2 style={{ color: 'var(--foreground)', marginBottom: '1rem' }}>Buscador Vectorial de Hechos</h2>
        <p style={{ maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
          El motor de memoria a largo plazo (Zep) está almacenando contexto de forma pasiva en la base de datos de los agentes.
          La interfaz visual para buscar y editar grafos de conocimiento estará disponible en la próxima actualización.
        </p>
      </div>
    </div>
  );
}
