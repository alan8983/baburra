-- Seed ^TWII (TWSE Weighted Index) so the volatility calculator's TW-market
-- index fallback can resolve the ticker via resolveStock() and route to the
-- TWSE price client.  SPY already exists for US/CRYPTO; ^TWII was missing.
INSERT INTO stocks (ticker, name, market)
VALUES ('^TWII', 'TWSE Weighted Index', 'TW')
ON CONFLICT (ticker) DO NOTHING;
