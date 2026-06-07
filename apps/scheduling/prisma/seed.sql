-- HealthSync demo seed: today's agenda for the MVP single doctor.
-- Re-runnable: clears today's rows for the doctor, then inserts a fresh agenda.
-- doctorId/patientId are UUIDs (the columns are @db.Uuid).

DELETE FROM "appointments"
  WHERE "doctorId" = '00000000-0000-0000-0000-000000000001' AND "day" = CURRENT_DATE;
DELETE FROM "working_hours"
  WHERE "doctorId" = '00000000-0000-0000-0000-000000000001' AND "day" = CURRENT_DATE;

INSERT INTO "working_hours" ("id", "doctorId", "day", "openTime", "closeTime") VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '09:00', '17:00');

INSERT INTO "appointments" ("id", "doctorId", "patientId", "day", "startTime", "endTime") VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', CURRENT_DATE, '15:00', '15:30'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', CURRENT_DATE, '15:30', '16:00'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', CURRENT_DATE, '16:00', '16:30'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', CURRENT_DATE, '16:40', '17:00');
