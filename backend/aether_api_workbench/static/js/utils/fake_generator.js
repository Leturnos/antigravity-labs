/**
 * Browser-side JSON Schema Fake Data Generator for Aether API Workbench.
 * Mirrors Python mock_engine semantic inferencing for instant client-side live preview.
 */

/**
 * Generate realistic fake mock data from a JSON Schema object.
 * @param {Object} schema - JSON Schema object.
 * @param {string} [keyName=""] - Contextual property key name.
 * @returns {*} Generated fake data value.
 */
export function generateFakeFromSchemaJS(schema, keyName = "") {
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  // Direct overrides
  if ('const' in schema) return schema.const;
  if ('example' in schema) return schema.example;
  if ('default' in schema) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  let schemaType = schema.type;

  // Infer type if missing but structural keys exist
  if (!schemaType) {
    if (schema.properties) schemaType = 'object';
    else if (schema.items) schemaType = 'array';
  }

  const keyLower = (keyName || '').toLowerCase();

  // OBJECT
  if (schemaType === 'object' || schema.properties) {
    const props = schema.properties || {};
    const result = {};
    for (const [pKey, pSchema] of Object.entries(props)) {
      result[pKey] = generateFakeFromSchemaJS(pSchema, pKey);
    }
    return result;
  }

  // ARRAY
  if (schemaType === 'array' || schema.items) {
    const itemsSchema = schema.items || {};
    if (Object.keys(itemsSchema).length === 0) {
      return [];
    }
    const itemVal = generateFakeFromSchemaJS(itemsSchema, keyName);
    return [itemVal];
  }

  // STRING
  if (schemaType === 'string') {
    const fmt = (schema.format || '').toLowerCase();

    if (fmt === 'email' || keyLower.includes('email')) {
      return 'user@example.com';
    }
    if (fmt === 'uuid' || ['id', 'uuid', 'guid'].includes(keyLower) || keyLower.endsWith('_id')) {
      return '123e4567-e89b-12d3-a456-426614174000';
    }
    if (['date-time', 'datetime'].includes(fmt) || ['created_at', 'updated_at', 'date', 'timestamp'].includes(keyLower)) {
      return '2026-01-01T12:00:00Z';
    }
    if (fmt === 'date') {
      return '2026-01-01';
    }
    if (['uri', 'url'].includes(fmt) || ['url', 'uri', 'link', 'avatar', 'image'].some(k => keyLower.includes(k))) {
      return 'https://example.com/resource';
    }
    if (keyLower.includes('phone') || keyLower.includes('tel')) {
      return '+1-555-0199';
    }
    if (['first_name', 'given_name'].some(k => keyLower.includes(k))) {
      return 'John';
    }
    if (['last_name', 'family_name', 'surname'].some(k => keyLower.includes(k))) {
      return 'Doe';
    }
    if (['name', 'author', 'user', 'username'].some(k => keyLower.includes(k))) {
      return 'Jane Doe';
    }
    if (['title', 'subject', 'heading'].some(k => keyLower.includes(k))) {
      return 'Sample Title';
    }
    if (['description', 'summary', 'detail', 'bio', 'content', 'message', 'text'].some(k => keyLower.includes(k))) {
      return 'This is a sample description text.';
    }
    if (keyLower.includes('status')) {
      return 'active';
    }
    if (keyLower.includes('city')) {
      return 'New York';
    }
    if (keyLower.includes('country')) {
      return 'United States';
    }
    return keyName ? `sample_${keyName}` : 'sample_string';
  }

  // INTEGER
  if (schemaType === 'integer' || schemaType === 'int') {
    if (keyLower === 'id' || keyLower.endsWith('_id') || ['count', 'total', 'quantity', 'number'].includes(keyLower)) {
      return 1;
    }
    if (keyLower.includes('age')) {
      return 30;
    }
    if (keyLower.includes('port')) {
      return 8080;
    }
    return 100;
  }

  // FLOAT / NUMBER
  if (schemaType === 'number' || schemaType === 'float') {
    if (['price', 'amount', 'cost', 'total', 'rate', 'score', 'rating'].some(k => keyLower.includes(k))) {
      return 99.99;
    }
    return 1.0;
  }

  // BOOLEAN
  if (schemaType === 'boolean') {
    return true;
  }

  // NULL
  if (schemaType === 'null') {
    return null;
  }

  return 'sample_value';
}

/**
 * Built-in schema templates for instant mock generation.
 */
export const SCHEMA_TEMPLATES = {
  user_profile: {
    name: 'User Profile',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        age: { type: 'integer' },
        is_active: { type: 'boolean' },
        avatar: { type: 'string', format: 'uri' },
        created_at: { type: 'string', format: 'date-time' }
      }
    }
  },
  paginated_list: {
    name: 'Paginated Items List',
    schema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        total_count: { type: 'integer' },
        has_more: { type: 'boolean' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              title: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'number' },
              status: { type: 'string' }
            }
          }
        }
      }
    }
  },
  product_item: {
    name: 'Product Details',
    schema: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' },
        in_stock: { type: 'boolean' },
        quantity: { type: 'integer' },
        category: { type: 'string', enum: ['Electronics', 'Clothing', 'Home', 'Books'] }
      }
    }
  },
  error_response: {
    name: 'Standard Error Response',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string', enum: ['NOT_FOUND', 'UNAUTHORIZED', 'INVALID_ARGUMENT', 'INTERNAL_ERROR'] },
        message: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' }
      }
    }
  },
  auth_token: {
    name: 'Auth Token Response',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        token_type: { type: 'string', example: 'bearer' },
        expires_in: { type: 'integer', example: 3600 },
        refresh_token: { type: 'string', example: 'd9e8f7a6b5c4...' }
      }
    }
  }
};
