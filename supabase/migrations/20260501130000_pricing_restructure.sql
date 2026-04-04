-- Pricing restructure: Standard→Appointments, Business→Restaurant
-- All plans now have unlimited calendars; calendar_count no longer enforced.

-- Auto-migrate existing Standard customers to Appointments plan
UPDATE venues
SET pricing_tier = 'appointments',
    calendar_count = NULL,
    sms_monthly_allowance = 300
WHERE pricing_tier = 'standard';

-- Auto-migrate existing Business customers to Restaurant plan
UPDATE venues
SET pricing_tier = 'restaurant',
    calendar_count = NULL,
    sms_monthly_allowance = 800
WHERE pricing_tier = 'business';

-- Founding stays as 'founding' (converts to 'restaurant' on free period expiry)
-- Ensure founding allowance is correct
UPDATE venues
SET sms_monthly_allowance = 800
WHERE pricing_tier = 'founding';
