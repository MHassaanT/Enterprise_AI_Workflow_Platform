-- Migration: 014_seed_google_docs_sheets.sql
-- Integration Hub Seeding: Google Docs & Google Sheets via Google OAuth2

WITH upsert AS (
    INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
    VALUES
        (
            'Google Docs',
            'Google Docs (Google Workspace)',
            'google_docs',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"read_document, append_text, or create_document"},"document_id":{"type":"string","description":"ID of the Google Doc"},"text":{"type":"string","description":"Text content to append"},"title":{"type":"string","description":"Title for new document"}}}'::jsonb
        ),
        (
            'Google Sheets',
            'Google Sheets (Google Workspace)',
            'google_sheets',
            false,
            '{"type":"object","properties":{"action":{"type":"string","description":"read_range, update_rows, or create_spreadsheet"},"spreadsheet_id":{"type":"string","description":"ID of the Google Sheet"},"range":{"type":"string","description":"A1 notation range (e.g. Sheet1!A1:B10)"},"values":{"type":"array","description":"2D array of row values"},"title":{"type":"string","description":"Title for new spreadsheet"}}}'::jsonb
        )
    ON CONFLICT (canonical_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        is_high_risk = EXCLUDED.is_high_risk,
        schema_json = EXCLUDED.schema_json
    RETURNING *
)
SELECT * FROM upsert;
