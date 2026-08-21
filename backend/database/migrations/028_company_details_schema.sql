-- Migration 028: Add website, description, industry to tenants; full_name, company_role to users

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry VARCHAR(255);

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_role VARCHAR(255);
