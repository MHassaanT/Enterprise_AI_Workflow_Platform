const crypto = require('crypto');
const { query } = require('../db');

// AES-256-GCM Decryption Helper
const getAesKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  if (keyStr.length === 64) {
    return Buffer.from(keyStr, 'hex');
  }
  return Buffer.from(keyStr.padEnd(32, '\0').slice(0, 32));
};

const decryptPayload = (encryptedStr) => {
  const [ivHex, cipherHex] = encryptedStr.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const cipherBytes = Buffer.from(cipherHex, 'hex');
  const authTag = cipherBytes.slice(cipherBytes.length - 16);
  const encryptedText = cipherBytes.slice(0, cipherBytes.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

const mapAirtableTypeToPlatform = (atType) => {
  switch (atType) {
    case 'singleLineText':
    case 'multilineText':
    case 'richText':
    case 'barcode':
      return 'string';
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
    case 'count':
    case 'duration':
    case 'autoNumber':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'singleSelect':
    case 'multipleSelects':
      return 'enum';
    case 'date':
      return 'date';
    case 'dateTime':
    case 'createdTime':
    case 'lastModifiedTime':
      return 'datetime';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'multipleRecordLinks':
      return 'reference';
    default:
      return 'string';
  }
};

const getSmartIcon = (tableName) => {
  const t = tableName.toLowerCase();
  if (t.includes('ride') || t.includes('trip') || t.includes('car')) return 'directions_car';
  if (t.includes('order') || t.includes('sale') || t.includes('product')) return 'shopping_cart';
  if (t.includes('user') || t.includes('customer') || t.includes('passenger') || t.includes('rider') || t.includes('driver')) return 'person';
  if (t.includes('ticket') || t.includes('issue') || t.includes('support')) return 'confirmation_number';
  if (t.includes('invoice') || t.includes('payment') || t.includes('billing')) return 'receipt_long';
  if (t.includes('lead') || t.includes('contact') || t.includes('deal')) return 'handshake';
  return 'database';
};

/**
 * Automatically fetch schema from Airtable Meta API and populate tenant_entities,
 * tenant_entity_fields, and tenant_entity_operations.
 */
async function syncAirtableSchemaToTenantEntities(tenantId, baseIdOverride = null) {
  // 1. Fetch Airtable credentials
  const credsRes = await query(
    `SELECT tc.encrypted_payload 
     FROM tool_credentials tc 
     LEFT JOIN tool_registry tr ON tc.tool_id = tr.id
     WHERE tc.tenant_id = $1 AND (
       LOWER(tr.canonical_name) = 'airtable' OR 
       LOWER(tr.provider_type) = 'airtable'
     )
     LIMIT 1`,
    [tenantId],
    tenantId
  );

  if (!credsRes.rows[0]) {
    throw new Error('No Airtable integration credentials found. Please connect Airtable first in the Integration Hub.');
  }

  const payload = decryptPayload(credsRes.rows[0].encrypted_payload);
  const token = payload.access_token || payload.api_key || payload.token;
  let baseId = baseIdOverride || payload.base_id || payload.default_base_id;

  if (!token) {
    throw new Error('Airtable access token is missing from credentials.');
  }

  // 2. Discover base_id from Meta API if not present
  if (!baseId) {
    const basesRes = await fetch('https://api.airtable.com/v0/meta/bases', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (basesRes.ok) {
      const basesData = await basesRes.json();
      if (basesData.bases && basesData.bases.length > 0) {
        baseId = basesData.bases[0].id;
      }
    }
  }

  if (!baseId) {
    throw new Error('Airtable Base ID could not be found. Please ensure your Airtable token has access to at least one base.');
  }

  // 3. Fetch schema of all tables from Airtable Meta API
  console.log(`[AIRTABLE SYNC] Fetching tables for base ${baseId} for tenant ${tenantId}...`);
  const tablesRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!tablesRes.ok) {
    const errText = await tablesRes.text();
    console.error(`[AIRTABLE SYNC] Meta API error (${tablesRes.status}):`, errText);
    if (tablesRes.status === 403 || tablesRes.status === 401) {
      throw new Error(`Airtable Permission Error (${tablesRes.status}): Your token does not have permission to access base '${baseId}'. Please reconnect Airtable and ensure you grant access to this base with the schema.bases:read scope.`);
    }
    throw new Error(`Airtable Meta API failed (${tablesRes.status}): ${errText}`);
  }

  const tablesData = await tablesRes.json();
  const tables = tablesData.tables || [];

  if (tables.length === 0) {
    return {
      success: true,
      message: 'Connected to Airtable base, but no tables were found in this base.',
      entities: [],
    };
  }

  const syncedEntities = [];

  // 4. Synchronize each Airtable table to tenant_entities
  for (const tbl of tables) {
    const rawName = tbl.name || 'Untitled Table';
    const cleanEntityName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const displayName = rawName;
    const icon = getSmartIcon(rawName);

    const dataSourceConfig = {
      provider: 'airtable',
      base_id: baseId,
      table_name: rawName,
      table_id: tbl.id,
      primary_field_id: tbl.primaryFieldId,
    };

    // Upsert entity into tenant_entities
    const entityRes = await query(
      `INSERT INTO tenant_entities (
        tenant_id, entity_name, display_name, description, icon, 
        data_source_type, data_source_config, status, is_enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'integration', $6, 'active', true, NOW(), NOW())
      ON CONFLICT (tenant_id, entity_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        data_source_config = EXCLUDED.data_source_config,
        status = 'active',
        is_enabled = true,
        updated_at = NOW()
      RETURNING id, entity_name, display_name, status`,
      [
        tenantId,
        cleanEntityName,
        displayName,
        `Auto-synced from Airtable table '${rawName}' (Base ID: ${baseId})`,
        icon,
        JSON.stringify(dataSourceConfig),
      ],
      tenantId
    );

    const entityRecord = entityRes.rows[0];
    const entityId = entityRecord.id;

    // 5. Synchronize fields
    const fields = tbl.fields || [];
    let fieldCount = 0;

    for (const f of fields) {
      const fieldName = (f.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (!fieldName) continue;

      const fieldType = mapAirtableTypeToPlatform(f.type);
      const isSearchable = ['string', 'email', 'url', 'enum', 'number'].includes(fieldType);
      const isFilterable = true;
      let enumValues = null;

      if ((f.type === 'singleSelect' || f.type === 'multipleSelects') && f.options?.choices) {
        enumValues = JSON.stringify(f.options.choices.map((c) => c.name));
      }

      await query(
        `INSERT INTO tenant_entity_fields (
          entity_id, field_name, display_name, field_type, 
          is_required, is_searchable, is_filterable, enum_values, description, created_at
        ) VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, NOW())
        ON CONFLICT (entity_id, field_name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          field_type = EXCLUDED.field_type,
          is_searchable = EXCLUDED.is_searchable,
          is_filterable = EXCLUDED.is_filterable,
          enum_values = EXCLUDED.enum_values`,
        [
          entityId,
          fieldName,
          f.name,
          fieldType,
          isSearchable,
          isFilterable,
          enumValues,
          `Airtable field '${f.name}' (${f.type})`,
        ],
        tenantId
      );
      fieldCount++;
    }

    // 6. Ensure default operations exist (search, get_by_id, create, update)
    const operations = ['search', 'get_by_id', 'create', 'update'];
    for (const op of operations) {
      await query(
        `INSERT INTO tenant_entity_operations (entity_id, operation_name, is_enabled, requires_approval, created_at)
         VALUES ($1, $2, true, false, NOW())
         ON CONFLICT (entity_id, operation_name) DO UPDATE SET is_enabled = true`,
        [entityId, op],
        tenantId
      );
    }

    syncedEntities.push({
      id: entityId,
      entity_name: cleanEntityName,
      display_name: displayName,
      fields_count: fieldCount,
      airtable_table_id: tbl.id,
    });
  }

  console.log(`[AIRTABLE SYNC] Successfully synced ${syncedEntities.length} table(s) from Airtable base ${baseId} for tenant ${tenantId}`);
  return {
    success: true,
    base_id: baseId,
    tables_synced: syncedEntities.length,
    entities: syncedEntities,
  };
}

module.exports = {
  syncAirtableSchemaToTenantEntities,
};
