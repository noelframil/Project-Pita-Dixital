import type { Tool } from '../core/tools.js';

export const processPassportCheckin: Tool = {
  name: 'process_passport_checkin',
  description:
    'Lee el JSON extraído del pasaporte por la cámara del Kiosko y hace el check-in automático del huésped en el PMS (Property Management System).',
  parameters: {
    type: 'object',
    properties: {
      passportData: {
        type: 'object',
        description: 'Datos extraídos del pasaporte (MRZ, nombre, nacionalidad).',
      },
    },
    required: ['passportData'],
  },
  execute: async (args: { passportData: any }) => {
    // Mock logic for checkin
    const name = args.passportData?.name || 'Huésped Anónimo';
    return JSON.stringify({
      status: 'success',
      message: `Check-in completado para ${name}. Habitación asignada: 204.`,
      roomNumber: '204',
      guestId: 'GST-9921'
    });
  },
};

export const issueDigitalKey: Tool = {
  name: 'issue_digital_key',
  description:
    'Se comunica con el Lóbulo IoT para emitir un token BLE (Bluetooth Low Energy) y enviarlo al móvil del huésped para que pueda abrir su habitación.',
  parameters: {
    type: 'object',
    properties: {
      roomNumber: {
        type: 'string',
        description: 'Número de habitación.',
      },
      guestId: {
        type: 'string',
        description: 'ID del huésped.',
      }
    },
    required: ['roomNumber', 'guestId'],
  },
  execute: async (args: { roomNumber: string, guestId: string }) => {
    // Mock logic for BLE key issuance
    return JSON.stringify({
      status: 'success',
      message: `Llave digital BLE para la habitación ${args.roomNumber} generada y enviada al dispositivo móvil del huésped ${args.guestId}.`
    });
  },
};
