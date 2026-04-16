-- Mark 股癌 (Gooaye) as a verified/active KOL so it surfaces in the
-- default KOL list (which filters validation_status = 'active').

UPDATE kols
SET validation_status = 'active',
    validated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND validation_status != 'active';
