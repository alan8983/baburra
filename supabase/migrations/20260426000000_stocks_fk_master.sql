-- §5.1 of openspec/changes/fix-ticker-mapping-quality.
-- FK enforcement: stocks(ticker, market) MUST reference a row in
-- stocks_master(ticker, market). Composite FK matches the resolver's
-- lookup semantics — the same ticker can legitimately exist in two
-- markets (e.g. STX in US-equity AND CRYPTO).
--
-- ON DELETE RESTRICT: deleting a master row should fail loud if any
-- stocks row depends on it. Master deletes happen only via the seed
-- scripts and should never silently orphan production stocks.
--
-- ON UPDATE CASCADE: if we ever rename a master ticker (rare), the
-- stocks row's ticker follows.
--
-- Pre-requisite: scripts/cleanup-fabricated-stocks.ts --apply has run
-- and every stocks row's (ticker, market) pair already exists in
-- stocks_master.
ALTER TABLE stocks
  ADD CONSTRAINT fk_stocks_master
  FOREIGN KEY (ticker, market)
  REFERENCES stocks_master(ticker, market)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
