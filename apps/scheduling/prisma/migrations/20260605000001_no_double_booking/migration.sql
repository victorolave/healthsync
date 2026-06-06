-- Require btree_gist extension for EXCLUDE USING gist with non-geometric types
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- No-double-booking constraint: prevent overlapping appointments for the same
-- doctor on the same day. Uses tsrange composed from DATE + TIME columns so
-- Postgres can apply a half-open '[)' interval overlap check.
ALTER TABLE "appointments"
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    "doctorId" WITH =,
    "day" WITH =,
    tsrange(
      ('1970-01-01'::date + "startTime"),
      ('1970-01-01'::date + "endTime"),
      '[)'
    ) WITH &&
  );
