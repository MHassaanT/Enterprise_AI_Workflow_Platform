-- Migration 040: Seed WhatsApp MCP Tools into Global Tool Registry
-- Registers whatsapp_send_message, whatsapp_send_media, and whatsapp_get_status tools

INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES
  (
    'whatsapp_send_message',
    'Send WhatsApp Message',
    'whatsapp',
    false,
    '{
      "type": "object",
      "required": ["to", "message"],
      "properties": {
        "to": {
          "type": "string",
          "description": "Recipient phone number in international E.164 format (e.g. +923001234567 or 923001234567)"
        },
        "message": {
          "type": "string",
          "description": "Text message content to send via WhatsApp"
        }
      }
    }'::jsonb
  ),
  (
    'whatsapp_send_media',
    'Send WhatsApp Media',
    'whatsapp',
    false,
    '{
      "type": "object",
      "required": ["to", "media_url", "media_type"],
      "properties": {
        "to": {
          "type": "string",
          "description": "Recipient phone number in international E.164 format"
        },
        "media_url": {
          "type": "string",
          "description": "Publicly accessible URL or base64 data URI of the media file"
        },
        "media_type": {
          "type": "string",
          "enum": ["image", "document", "audio", "video"],
          "description": "Type of media to send"
        },
        "caption": {
          "type": "string",
          "description": "Optional text caption accompanying the media"
        },
        "filename": {
          "type": "string",
          "description": "Optional filename for document media"
        }
      }
    }'::jsonb
  ),
  (
    'whatsapp_get_status',
    'Get WhatsApp Connection Status',
    'whatsapp',
    false,
    '{
      "type": "object",
      "properties": {},
      "description": "Queries the current connection status and paired phone number for the tenant WhatsApp session"
    }'::jsonb
  ),
  (
    'whatsapp_check_number',
    'Check WhatsApp Number',
    'whatsapp',
    false,
    '{
      "type": "object",
      "required": ["phone"],
      "properties": {
        "phone": {
          "type": "string",
          "description": "Phone number in international E.164 format to verify registration on WhatsApp"
        }
      }
    }'::jsonb
  )
ON CONFLICT (canonical_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_type = EXCLUDED.provider_type,
  is_high_risk = EXCLUDED.is_high_risk,
  schema_json = EXCLUDED.schema_json;

SELECT 'Migration 040 completed successfully' AS migration_status;
