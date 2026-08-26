"use client";

import { motion } from 'framer-motion';
import { PackageOpen, ShoppingCart, Truck, AlertTriangle, CheckCircle2, Factory } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from "../page.module.css";

const INVENTORY_DATA = [
  { id: 1, item: 'Jabón de Lavanda (Amenities)', stock: 45, min: 100, status: 'crítico', autoOrder: true },
  { id: 2, item: 'Papel Higiénico (Rollos)', stock: 210, min: 200, status: 'aviso', autoOrder: true },
  { id: 3, item: 'Café Grano Natural (kg)', stock: 5, min: 10, status: 'crítico', autoOrder: true },
  { id: 4, item: 'Sábanas Algodón 100%', stock: 120, min: 50, status: 'ok', autoOrder: false },
];

const ORDERS_DATA = [
  { id: 'ORD-892', vendor: 'Suministros Horeca S.L.', item: 'Jabón de Lavanda x500', total: '145.50€', status: 'Negociando', step: 2 },
  { id: 'ORD-891', vendor: 'Cafés La Estrella', item: 'Café Grano x20kg', total: '180.00€', status: 'Aprobado Legal', step: 4 },
  { id: 'ORD-890', vendor: 'Papelera Norte', item: 'Papel Higiénico x1000', total: '210.00€', status: 'Pagado', step: 5 },
];

export default function SupplyChainPage() {
  return (
    <div className={styles.dashboardGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', padding: '2rem' }}>
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ gridColumn: 'span 12', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <PackageOpen size={32} color="var(--info)" />
          Cadena de Suministro (Zero-Touch Procurement)
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
          Gestión de inventario autónoma, negociación con proveedores B2B y conciliación automática.
        </p>
      </motion.div>

      {/* Inventory Panel */}
      <motion.div style={{ gridColumn: 'span 7' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <Card style={{ padding: '1.5rem', height: '100%', background: 'var(--surface-card)' }}>
          <h3 style={{ fontSize: '1.2rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Factory size={20} color="var(--info)" />
            Estado del Inventario (Sensores IoT & PMS)
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {INVENTORY_DATA.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: 'var(--foreground)' }}>{item.item}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Stock actual: <strong style={{ color: item.status === 'crítico' ? 'var(--danger)' : 'var(--foreground)' }}>{item.stock}</strong> / Mínimo: {item.min}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {item.status === 'crítico' && <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: '8px' }}><AlertTriangle size={14} /> Reabastecimiento Activado</span>}
                  {item.status === 'aviso' && <span style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: 'rgba(234, 179, 8, 0.1)', padding: '4px 8px', borderRadius: '8px' }}><AlertTriangle size={14} /> Vigilar</span>}
                  {item.status === 'ok' && <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '8px' }}><CheckCircle2 size={14} /> Óptimo</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Active Orders Panel */}
      <motion.div style={{ gridColumn: 'span 5' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card style={{ padding: '1.5rem', height: '100%', background: 'linear-gradient(180deg, var(--surface-card), rgba(14, 165, 233, 0.02))' }}>
          <h3 style={{ fontSize: '1.2rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingCart size={20} color="var(--info)" />
            Pipeline de Compras Autónomas
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {ORDERS_DATA.map((order) => (
              <div key={order.id} style={{ padding: '1rem', background: 'rgba(14, 165, 233, 0.05)', borderRadius: '12px', border: '1px solid rgba(14, 165, 233, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--info)' }}>{order.id} - {order.vendor}</h4>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{order.total}</span>
                </div>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{order.item}</p>
                
                {/* Progress Steps */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '2px', background: 'rgba(255,255,255,0.1)', zIndex: 0, transform: 'translateY(-50%)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: '0', width: `${(order.step / 5) * 100}%`, height: '2px', background: 'var(--info)', zIndex: 0, transform: 'translateY(-50%)', transition: 'width 0.5s ease' }} />
                  
                  {[1, 2, 3, 4, 5].map((step) => (
                    <div key={step} style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      background: step <= order.step ? 'var(--info)' : 'var(--surface-dark)', 
                      border: `2px solid ${step <= order.step ? 'var(--info)' : 'rgba(255,255,255,0.2)'}`,
                      zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {step < order.step && <CheckCircle2 size={12} color="#fff" />}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <span>Detección</span>
                  <span>Búsqueda</span>
                  <span>Negociación</span>
                  <span>Firma</span>
                  <span>Pago</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
