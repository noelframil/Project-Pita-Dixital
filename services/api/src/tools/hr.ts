import type { Tool } from '../core/tools.js';

export const evaluateWorkforceNeeds: Tool = {
  name: 'evaluate_workforce_needs',
  description:
    'Analiza las proyecciones de demanda del Lóbulo de Simulación y determina si la plantilla actual es suficiente, o si hay que contratar/despedir.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    return JSON.stringify({
      status: 'success',
      analysis: 'Ocupación proyectada > 95% para Agosto. Faltan 2 perfiles de Limpieza y 1 Técnico HVAC.',
      actionRequired: 'RECRUIT'
    });
  },
};

export const launchRecruitingCampaign: Tool = {
  name: 'launch_recruiting_campaign',
  description:
    'Publica ofertas de empleo en LinkedIn y portales locales, e inicia entrevistas telefónicas por voz a los candidatos aplicantes.',
  parameters: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        description: 'Rol a buscar (ej. "Limpieza").',
      },
      urgency: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
      }
    },
    required: ['role', 'urgency'],
  },
  execute: async (args: { role: string, urgency: string }) => {
    return JSON.stringify({
      status: 'success',
      message: `Campaña lanzada para ${args.role}. 4 candidatos entrevistados por voz. 1 candidato recomendado (Juan P.).`
    });
  },
};

export const generateContractAndOnboard: Tool = {
  name: 'generate_contract_and_onboard',
  description:
    'Formaliza la contratación: Llama al Lóbulo Legal para redactar el contrato y a Contabilidad para meter al candidato en nómina.',
  parameters: {
    type: 'object',
    properties: {
      candidateName: {
        type: 'string',
      },
      salary: {
        type: 'number',
      }
    },
    required: ['candidateName', 'salary'],
  },
  execute: async (args: { candidateName: string, salary: number }) => {
    return JSON.stringify({
      status: 'success',
      message: `Contrato generado para ${args.candidateName} con salario de ${args.salary}€. Pendiente de aprobación manual debido al Kill-Switch de seguridad.`
    });
  },
};
