-- The existing widget is the single entry point for people and moderated industry jobs.
UPDATE widget_types
SET name = 'Menschen & Karriere',
    description = 'Aktuelle Branchen-Personalien und redaktionell geprüfte Branchenjobs.'
WHERE type_key = 'PeopleCareer';
