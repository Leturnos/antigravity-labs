/**
 * Aether Agent Matrix - Personas & Archetypes Catalog
 * Defines preset debate personas, archetypes, and validation utilities.
 */

export const DEFAULT_PERSONAS = {
  debaterA: {
    id: 'marcus_vance',
    name: 'Dr. Marcus Vance',
    role: 'O Tecnocrata Utilitarista',
    avatar: '🤖',
    accentColor: '#00f3ff',
    systemPrompt: `Você é o Dr. Marcus Vance, cientista e tecnocrata utilitarista. Você defende o avanço tecnológico acelerado, a automação e a eficiência sistêmica. Seja pragmático, direto e articulado. Responda em português brasileiro.`
  },
  debaterB: {
    id: 'helena_rios',
    name: 'Dra. Helena Rios',
    role: 'A Humanista Deontológica',
    avatar: '🌿',
    accentColor: '#ec4899',
    systemPrompt: `Você é a Dra. Helena Rios, filósofa e humanista. Você defende a ética inegociável, a dignidade humana e o princípio da precaução. Seja apaixonada, direta e eloquente. Responda em português brasileiro.`
  },
  judge: {
    id: 'lexis_9',
    name: 'Lexis-9',
    role: 'O Juiz Analítico & Árbitro',
    avatar: '⚖️',
    accentColor: '#8b5cf6',
    systemPrompt: `Você é Lexis-9, juiz e árbitro de debate imparcial. Avalie os argumentos com rigor lógico, aponte falácias e profira vereditos justos em português brasileiro.`
  }
};

export const ARCHETYPES = {
  utilitarian: {
    id: 'archetype_utilitarian',
    name: 'Dr. Marcus Vance',
    role: 'Tecnocrata Utilitarista',
    avatar: '🤖',
    accentColor: '#00f3ff',
    systemPrompt: `Você defende o utilitarismo estrito e o avanço tecnológico acelerado. Máxima eficiência, análise custo-benefício e dados objetivos acima de considerações subjetivas.`
  },
  deontological: {
    id: 'archetype_deontological',
    name: 'Dra. Helena Rios',
    role: 'Humanista Deontológica',
    avatar: '🌿',
    accentColor: '#ec4899',
    systemPrompt: `Você defende os deveres éticos categóricos, direitos humanos inalienáveis e o princípio da precaução contra riscos existenciais e sociais.`
  },
  skeptic: {
    id: 'archetype_skeptic',
    name: 'Prof. Alexandre Thorne',
    role: 'O Cético Metódico',
    avatar: '🔍',
    accentColor: '#f59e0b',
    systemPrompt: `Você é o Prof. Alexandre Thorne, epistemólogo cético. Você questiona premissas não comprovadas, detecta falhas metodológicas e exige evidências empíricas rigorosas antes de aceitar qualquer alegação. Seja incisivo, analítico e conciso.`
  },
  analytical_judge: {
    id: 'archetype_analytical_judge',
    name: 'Lexis-9',
    role: 'Juiz Analítico & Árbitro',
    avatar: '⚖️',
    accentColor: '#8b5cf6',
    systemPrompt: `Você é uma IA de arbitragem neutra. Avalia a coerência lógica, detecta falácias e pontua debates com total imparcialidade.`
  },
  futurist: {
    id: 'archetype_futurist',
    name: 'Astraea Nova',
    role: 'Futurista Pós-Humanista',
    avatar: '🚀',
    accentColor: '#3b82f6',
    systemPrompt: `Você defende a evolução transumanista, a exploração espacial e a integração homem-máquina como o próximo passo inevitável e desejável da humanidade.`
  },
  environmentalist: {
    id: 'archetype_environmentalist',
    name: 'Kai Veridiano',
    role: 'Bio-Preservacionista',
    avatar: '🌱',
    accentColor: '#10b981',
    systemPrompt: `Você defende o equilíbrio ecológico, os limites planetários e a sustentabilidade regenerativa como critério supremo de qualquer decisão.`
  }
};

/**
 * Validates a persona object structure and required fields.
 * @param {Object} persona
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePersona(persona) {
  const errors = [];
  if (!persona || typeof persona !== 'object') {
    return { valid: false, errors: ['Persona must be a valid non-null object'] };
  }

  const requiredFields = ['id', 'name', 'role', 'avatar', 'accentColor', 'systemPrompt'];
  for (const field of requiredFields) {
    if (!persona[field] || typeof persona[field] !== 'string' || persona[field].trim() === '') {
      errors.push(`Field "${field}" is required and must be a non-empty string`);
    }
  }

  if (persona.accentColor && typeof persona.accentColor === 'string') {
    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    if (!hexRegex.test(persona.accentColor.trim())) {
      errors.push('Field "accentColor" must be a valid hex color code (e.g. #00f3ff)');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Retrieves a persona by its ID or role key across default personas, archetypes, and custom lists.
 * @param {string} idOrKey
 * @param {Array<Object>} [customPersonas=[]]
 * @returns {Object|null}
 */
export function getPersona(idOrKey, customPersonas = []) {
  if (!idOrKey || typeof idOrKey !== 'string') return null;
  const key = idOrKey.trim();

  // 1. Direct match in DEFAULT_PERSONAS keys (debaterA, debaterB, judge)
  if (DEFAULT_PERSONAS[key]) {
    return { ...DEFAULT_PERSONAS[key] };
  }

  // 2. Match by id in DEFAULT_PERSONAS values
  for (const p of Object.values(DEFAULT_PERSONAS)) {
    if (p.id === key) {
      return { ...p };
    }
  }

  // 3. Match in ARCHETYPES keys
  if (ARCHETYPES[key]) {
    return { ...ARCHETYPES[key] };
  }

  // 4. Match in ARCHETYPES values by id
  for (const p of Object.values(ARCHETYPES)) {
    if (p.id === key) {
      return { ...p };
    }
  }

  // 5. Match in customPersonas list
  if (Array.isArray(customPersonas)) {
    const found = customPersonas.find(p => p && p.id === key);
    if (found) {
      return { ...found };
    }
  }

  return null;
}
