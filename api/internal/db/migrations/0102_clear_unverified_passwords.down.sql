-- Irreversible by design: the cleared hashes were unverifiable credentials
-- and are not recoverable. Rolling back leaves the affected rows without a
-- password, which is the safe state.
SELECT 1;
