-- Migration: 037_appointments_schema.sql
-- Service Business Appointments (Software dev consultation, cleaning, maintenance, etc.)

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255),
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    service_type VARCHAR(255) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(50) NOT NULL,
    duration_minutes INT DEFAULT 60,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_by VARCHAR(50) DEFAULT 'ai_agent',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by tenant and date
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date 
ON appointments (tenant_id, appointment_date);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status 
ON appointments (tenant_id, status);

-- Index for customer email lookups
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_email 
ON appointments (tenant_id, customer_email);

-- Register tool in tool_registry
INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES (
    'create_appointment',
    'Service Appointment Booking',
    'builtin',
    false,
    '{
        "type": "object",
        "properties": {
            "customer_name": {
                "type": "string",
                "description": "Full name of the customer"
            },
            "customer_email": {
                "type": "string",
                "description": "Email address of the customer"
            },
            "customer_phone": {
                "type": "string",
                "description": "Phone number of the customer"
            },
            "service_type": {
                "type": "string",
                "description": "Type of service requested (e.g. Software Architecture Consultation, Deep Cleaning, etc.)"
            },
            "appointment_date": {
                "type": "string",
                "description": "Date of appointment in YYYY-MM-DD format"
            },
            "appointment_time": {
                "type": "string",
                "description": "Preferred time for the appointment (e.g. 14:00 or 2:00 PM)"
            },
            "duration_minutes": {
                "type": "integer",
                "description": "Estimated duration in minutes (default 60)"
            },
            "notes": {
                "type": "string",
                "description": "Service scope, customer requirements, project details, or address"
            }
        },
        "required": ["customer_name", "customer_email", "service_type", "appointment_date", "appointment_time"]
    }'::jsonb
)
ON CONFLICT (canonical_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    provider_type = EXCLUDED.provider_type,
    schema_json = EXCLUDED.schema_json;

-- Register edit_appointment tool in tool_registry
INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
VALUES (
    'edit_appointment',
    'Edit / Reschedule Appointment',
    'builtin',
    false,
    '{
        "type": "object",
        "properties": {
            "appointment_id": {
                "type": "string",
                "description": "ID of the appointment to edit (if known)"
            },
            "customer_email": {
                "type": "string",
                "description": "Current email of customer to locate appointment"
            },
            "new_name": {
                "type": "string",
                "description": "New customer name"
            },
            "new_email": {
                "type": "string",
                "description": "New customer email"
            },
            "new_phone": {
                "type": "string",
                "description": "New customer phone"
            },
            "new_date": {
                "type": "string",
                "description": "New appointment date (YYYY-MM-DD)"
            },
            "new_time": {
                "type": "string",
                "description": "New appointment time"
            },
            "notes": {
                "type": "string",
                "description": "Updated notes or agenda"
            },
            "status": {
                "type": "string",
                "description": "Updated status (scheduled, cancelled, completed)"
            }
        }
    }'::jsonb
)
ON CONFLICT (canonical_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    provider_type = EXCLUDED.provider_type,
    schema_json = EXCLUDED.schema_json;

