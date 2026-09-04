const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const generateEntitySchema = async (prompt, isFullOnboarding = false) => {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is required for AI generation.');
  }

  const systemInstruction = `You are an expert Enterprise Data Architect. Your job is to translate user descriptions of their business into a clean, normalized relational database schema (Entities).
  
Guidelines:
1. "Entities" represent core business objects (e.g., User, Order, Ticket, Property, Lead, Subscription).
2. Entity names should be singular, lowercase, with underscores (e.g., 'support_ticket').
3. Display names should be Title Case (e.g., 'Support Ticket').
4. Include sensible fields for each entity. Field types MUST be one of: 'string', 'number', 'boolean', 'enum', 'date', 'datetime', 'email', 'url'.
5. Include typical CRUD operations (search, get_by_id, create, update, delete, count).
${isFullOnboarding ? '6. Provide a comprehensive set of 2-4 core entities for the described business.' : '6. Provide exactly ONE entity that best matches the specific user request.'}

YOU MUST RETURN ONLY VALID JSON matching this structure:
{
  "entities": [
    {
      "entity_name": "string",
      "display_name": "string",
      "description": "string",
      "icon": "string", // material symbols icon (e.g. box, person, receipt, etc)
      "fields": [
        {
          "field_name": "string",
          "display_name": "string",
          "field_type": "string",
          "is_required": true,
          "is_searchable": true,
          "is_filterable": true,
          "enum_values": [], // only populate if field_type is enum
          "description": "string"
        }
      ],
      "operations": [
        { "operation_name": "search" },
        { "operation_name": "get_by_id" },
        { "operation_name": "create" },
        { "operation_name": "update" },
        { "operation_name": "delete" },
        { "operation_name": "count" }
      ]
    }
  ]
}
`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:4000',
        'X-Title': 'Enterprise AI Workflow Platform',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenRouter API Error:', errText);
      throw new Error(`OpenRouter API Error: ${response.status}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || '{}';
    const data = JSON.parse(content);
    return data.entities || [];
  } catch (error) {
    console.error('LLM Generation Error:', error);
    throw new Error('Failed to generate entity schema from AI.');
  }
};

module.exports = {
  generateEntitySchema
};
