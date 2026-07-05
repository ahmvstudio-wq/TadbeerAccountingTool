import { supabase } from '@/lib/supabase/client'

// Mid-market exchange rates relative to OMR (1 OMR = X units of currency, so rate = 1 / X)
// Or simply: Rate * Foreign Amount = OMR Amount
export const STATIC_OMR_RATES: Record<string, number> = {
  OMR: 1.0,
  USD: 0.385,    // 1 USD = 0.385 OMR
  EUR: 0.412,    // 1 EUR = 0.412 OMR
  GBP: 0.490,    // 1 GBP = 0.490 OMR
  AED: 0.105,    // 1 AED = 0.105 OMR
  SAR: 0.103,    // 1 SAR = 0.103 OMR
  QAR: 0.106,    // 1 QAR = 0.106 OMR
  KWD: 1.250,    // 1 KWD = 1.250 OMR (Kuwaiti Dinar is stronger)
  BHD: 1.020,    // 1 BHD = 1.020 OMR
  INR: 0.0046,   // 1 INR = 0.0046 OMR
  PKR: 0.0014,
  EGP: 0.0080,
  JPY: 0.0024,
  CNY: 0.053,
  CHF: 0.430,
  CAD: 0.280,
  AUD: 0.250,
  SGD: 0.285,
  HKD: 0.049,
  MYR: 0.081,
  TRY: 0.012,
  ZAR: 0.021,
  BDT: 0.0033,
  LKR: 0.0013,
  NGN: 0.00026,
}

/**
 * Resolves the exchange rate between two currencies on a given date.
 * Tries the database `exchange_rates` first, falls back to cross-rate logic from static mid-market values.
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number> {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()

  if (from === to) return 1.0

  try {
    // 1. Try querying the database for a custom defined rate
    const { data } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', from)
      .eq('to_currency', to)
      .lte('effective_date', date)
      .order('effective_date', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      return Number(data[0].rate)
    }

    // 2. Try the inverse rate from DB if present
    const { data: invData } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', to)
      .eq('to_currency', from)
      .lte('effective_date', date)
      .order('effective_date', { ascending: false })
      .limit(1)

    if (invData && invData.length > 0) {
      const invRate = Number(invData[0].rate)
      return invRate > 0 ? 1 / invRate : 0
    }
  } catch (e) {
    // Fall back silently to static table
  }

  // 3. Fallback to static cross-rate calculation
  const fromOMR = STATIC_OMR_RATES[from] ?? 1.0
  const toOMR = STATIC_OMR_RATES[to] ?? 1.0

  // Conversion: (FromCurrency * fromOMR) = amount in OMR.
  // Then (amount in OMR) / toOMR = amount in ToCurrency.
  // So overall rate = fromOMR / toOMR
  return fromOMR / toOMR
}
