-- Bestehende Profile mit einer gespeicherten Einzelauswahl behalten ihren
-- bisherigen Gültigkeitsbereich nach Einführung von scope_mode.
UPDATE account_radar_trigger_profiles
SET scope_mode = 'selected'
WHERE scope_mode = 'all'
  AND cardinality(account_ids) > 0;
