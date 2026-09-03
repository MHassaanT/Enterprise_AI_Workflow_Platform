const { GoogleGenAI, Type } = require('@google/genai');

const generateEntitySchema = async (prompt, isFullOnboarding = false) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required for AI generation.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelName = process.env.GEMINI_GENERATION_MODEL || 'gemini-2.5-flash';

  const systemInstruction = `You are an expert Enterprise Data Architect. Your job is to translate user descriptions of their business into a clean, normalized relational database schema (Entities).
  
Guidelines:
1. "Entities" represent core business objects (e.g., User, Order, Ticket, Property, Lead, Subscription).
2. Entity names should be singular, lowercase, with underscores (e.g., 'support_ticket').
3. Display names should be Title Case (e.g., 'Support Ticket').
4. Include sensible fields for each entity. Field types MUST be one of: 'string', 'number', 'boolean', 'enum', 'date', 'datetime', 'email', 'url'.
5. Include typical CRUD operations (search, get_by_id, create, update, delete, count).
${isFullOnboarding ? '6. Provide a comprehensive set of 2-4 core entities for the described business.' : '6. Provide exactly ONE entity that best matches the specific user request.'}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      entities: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            entity_name: { type: Type.STRING },
            display_name: { type: Type.STRING },
            description: { type: Type.STRING },
            icon: { type: Type.STRING, description: "A valid material symbols outline icon name (e.g. 'box', 'shopping_cart', 'person', 'real_estate_agent', 'receipt')" },
            fields: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  field_name: { type: Type.STRING },
                  display_name: { type: Type.STRING },
                  field_type: { type: Type.STRING, enum: ['string', 'number', 'boolean', 'enum', 'date', 'datetime', 'email', 'url'] },
                  is_required: { type: Type.BOOLEAN },
                  is_searchable: { type: Type.BOOLEAN },
                  is_filterable: { type: Type.BOOLEAN },
                  enum_values: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Only populate if field_type is 'enum'" },
                  description: { type: Type.STRING }
                },
                required: ["field_name", "display_name", "field_type"]
              }
            },
            operations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  operation_name: { type: Type.STRING, enum: ['search', 'get_by_id', 'create', 'update', 'delete', 'count'] }
                },
                required: ["operation_name"]
              }
            }
          },
          required: ["entity_name", "display_name", "description", "fields", "operations"]
        }
      }
    },
    required: ["entities"]
  };

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2
      }
    });

    const data = JSON.parse(response.text);
    return data.entities || [];
  } catch (error) {
    console.error('LLM Generation Error:', error);
    throw new Error('Failed to generate entity schema from AI.');
  }
};

module.exports = {
  generateEntitySchema
};
