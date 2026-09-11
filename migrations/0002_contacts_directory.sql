ALTER TABLE contacts ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN avatar_key TEXT;
ALTER TABLE contacts ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'gold';

UPDATE contacts
SET
  first_name = CASE
    WHEN instr(display_name, ' ') > 0 THEN substr(display_name, 1, instr(display_name, ' ') - 1)
    ELSE display_name
  END,
  last_name = CASE
    WHEN instr(display_name, ' ') > 0 THEN trim(substr(display_name, instr(display_name, ' ') + 1))
    ELSE ''
  END
WHERE first_name = '';
