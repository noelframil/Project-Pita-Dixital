import type { Tool } from '../core/tools.js';

export const checkInventoryTool: Tool = {
  name: 'check_inventory_levels',
  description:
    'Revisa el estado actual del inventario (Jabones, Papel, Comida) usando la telemetría de los sensores IoT y PMS.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    // Mock de respuesta de inventario
    return JSON.stringify([
      { item: 'Jabón de Lavanda (Amenities)', stock: 45, min: 100, status: 'crítico' },
      { item: 'Papel Higiénico (Rollos)', stock: 210, min: 200, status: 'aviso' },
      { item: 'Café Grano Natural (kg)', stock: 5, min: 10, status: 'crítico' },
    ]);
  },
};

export const triggerProcurementTool: Tool = {
  name: 'trigger_procurement_cycle',
  description:
    'Inicia un ciclo de reabastecimiento autónomo: Rastrea el mejor precio web (Crawler), negocia (B2B), firma (Legal) y paga (Contabilidad).',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista de ítems a reabastecer (ej. ["Jabón de Lavanda", "Café"])',
      },
      budgetLimit: {
        type: 'number',
        description: 'Límite máximo de gasto por pedido en euros.',
      }
    },
    required: ['items', 'budgetLimit'],
  },
  execute: async (args: { items: string[], budgetLimit: number }) => {
    // Mock de ciclo de compras AGI
    return JSON.stringify({
      status: 'initiated',
      cycleId: `PROC-${Math.floor(Math.random() * 1000)}`,
      details: `Se ha iniciado la orden de compra para: ${args.items.join(', ')}. Límite: ${args.budgetLimit}€. El Crawler está buscando los mejores proveedores.`
    });
  },
};
