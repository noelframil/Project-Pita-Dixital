"use client";

import { useState } from "react";
import styles from "./Header.module.css";

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = [
    {
      id: 1,
      title: "Agente ReAct iniciado",
      desc: "El agente de soporte ha comenzado una sesión con un usuario.",
      time: "Hace 2 min",
      type: "info"
    },
    {
      id: 2,
      title: "Webhook WhatsApp",
      desc: "Se ha recibido un nuevo mensaje por WhatsApp.",
      time: "Hace 15 min",
      type: "success"
    },
    {
      id: 3,
      title: "Actualización de Memoria",
      desc: "Se han extraído 3 nuevos hechos semánticos.",
      time: "Hace 1 hora",
      type: "update"
    }
  ];

  return (
    <header className={styles.header}>
      <h1 className={styles.greeting}>Hola, Pita Dixital!</h1>
      
      <div className={styles.actions}>
        <button className={styles.createBtn}>
          <span>+</span> Create
        </button>
        
        <button className={styles.iconBtn} aria-label="Search">
          <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Ccircle cx=%2211%22 cy=%2211%22 r=%228%22/%3E%3Cline x1=%2221%22 y1=%2221%22 x2=%2216.65%22 y2=%2216.65%22/%3E%3C/svg%3E")' }}></span>
        </button>
        
        <div className={styles.notificationWrapper}>
          <button 
            className={`${styles.iconBtn} ${showNotifications ? styles.activeBtn : ''}`} 
            aria-label="Notifications"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <span className={styles.notificationBadge}></span>
            <span className={styles.iconPlaceholder} style={{ WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9%22/%3E%3Cpath d=%22M13.73 21a2 2 0 0 1-3.46 0%22/%3E%3C/svg%3E")' }}></span>
          </button>

          {showNotifications && (
            <div className={styles.notificationDropdown}>
              <div className={styles.dropdownHeader}>
                <h3>Notificaciones</h3>
                <span className={styles.markReadBtn}>Marcar todo como leído</span>
              </div>
              <div className={styles.dropdownContent}>
                {notifications.map((notif) => (
                  <div key={notif.id} className={styles.notificationItem}>
                    <div className={`${styles.notifIcon} ${styles[notif.type]}`}></div>
                    <div className={styles.notifText}>
                      <h4>{notif.title}</h4>
                      <p>{notif.desc}</p>
                      <span className={styles.notifTime}>{notif.time}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.dropdownFooter}>
                Ver todas las notificaciones
              </div>
            </div>
          )}
        </div>

        <div className={styles.avatar}>
          <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Avatar" />
        </div>
      </div>
    </header>
  );
}
