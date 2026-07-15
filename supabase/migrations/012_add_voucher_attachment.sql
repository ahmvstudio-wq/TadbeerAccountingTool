-- Add attachment_url to vouchers table for supporting voucher receipt image attachments
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS attachment_url TEXT;
