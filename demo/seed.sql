-- Sample portfolio for the public demo workspace (app.clawnify.com/demo/workspaces/property).
-- Applied after schema.sql when a visitor's demo starts or is reset. Dates are
-- relative to that moment, so "this month" on the dashboard always has rent in it.
INSERT INTO properties (id, name, type, address, city, state, zip, year_built, color) VALUES
  (1, 'Oakwood Estate', 'single_family', '210 Oakwood Ln', 'Austin', 'TX', '78704', 1998, 'emerald'),
  (2, 'Honeybee Hideaway', 'single_family', '88 Bramble Ct', 'Austin', 'TX', '78704', 2006, 'amber'),
  (3, '308 Mission Apartments', 'multi_family', '308 Mission St', 'Austin', 'TX', '78702', 1985, 'sky'),
  (4, 'Riverside Lofts', 'multi_family', '1201 Riverside Dr', 'Austin', 'TX', '78741', 2014, 'violet');
INSERT INTO units (id, property_id, name, bedrooms, bathrooms, sqft, market_rent, status) VALUES
  (1, 1, 'Main house', 3, 2, 1450, 2300, 'occupied'),
  (2, 2, 'Main house', 2, 1, 980, 1700, 'occupied'),
  (3, 3, 'Unit 1', 1, 1, 620, 1450, 'occupied'),
  (4, 3, 'Unit 2', 1, 1, 620, 1450, 'vacant'),
  (5, 3, 'Unit 3', 2, 1, 850, 1850, 'occupied'),
  (6, 3, 'Unit 4', 1, 1, 640, 1500, 'occupied'),
  (7, 4, '101', 1, 1, 710, 1650, 'occupied'),
  (8, 4, '102', 1, 1, 710, 1650, 'occupied'),
  (9, 4, '201', 2, 2, 980, 1950, 'occupied'),
  (10, 4, '202', 2, 2, 980, 1950, 'occupied');
INSERT INTO tenants (id, first_name, last_name, email, phone, employer, monthly_income, emergency_contact) VALUES
  (1, 'Maya', 'Patel', 'maya.patel@example.com', '512-555-0111', 'Dell Technologies', 9400, 'Raj Patel, 512-555-0170'),
  (2, 'Luis', 'Ortega', 'luis.ortega@example.com', '512-555-0112', 'Austin ISD', 5600, 'Ana Ortega, 512-555-0171'),
  (3, 'Grace', 'Kim', 'grace.kim@example.com', '512-555-0113', 'Seton Medical Center', 5200, 'David Kim, 512-555-0172'),
  (4, 'Owen', 'Brooks', 'owen.brooks@example.com', '512-555-0114', 'Self-employed', 6800, 'Lena Brooks, 512-555-0173'),
  (5, 'Priya', 'Shah', 'priya.shah@example.com', '512-555-0115', 'Oracle', 7300, 'Nikhil Shah, 512-555-0174'),
  (6, 'Marcus', 'Reed', 'marcus.reed@example.com', '512-555-0116', 'City of Austin', 5100, 'Tanya Reed, 512-555-0175'),
  (7, 'Sofia', 'Rossi', 'sofia.rossi@example.com', '512-555-0117', 'UT Austin', 5400, 'Marco Rossi, 512-555-0176'),
  (8, 'Ethan', 'Walsh', 'ethan.walsh@example.com', '512-555-0118', 'Tesla', 8200, 'Kara Walsh, 512-555-0177'),
  (9, 'Hannah', 'Lee', 'hannah.lee@example.com', '512-555-0119', 'Whole Foods Market', 6900, 'Jin Lee, 512-555-0178'),
  (10, 'Noah', 'Fischer', 'noah.fischer@example.com', '512-555-0120', 'Indeed', 6100, 'Eva Fischer, 512-555-0179');
INSERT INTO leases (id, unit_id, primary_tenant_id, start_date, end_date, monthly_rent, deposit, rent_due_day, late_fee, status) VALUES
  (1, 1, 1, date('now', 'start of month', '-8 months'), date('now', 'start of month', '+4 months', '-1 day'), 2300, 2300, 1, 50, 'active'),
  (2, 2, 2, date('now', 'start of month', '-14 months'), date('now', 'start of month', '+10 months', '-1 day'), 1700, 1700, 1, 50, 'active'),
  (3, 3, 3, date('now', '+22 days', '-12 months'), date('now', '+21 days'), 1450, 1450, 1, 50, 'active'),
  (4, 5, 4, date('now', 'start of month', '-5 months'), date('now', 'start of month', '+7 months', '-1 day'), 1850, 1850, 1, 50, 'active'),
  (5, 6, 5, date('now', '+50 days', '-12 months'), date('now', '+49 days'), 1500, 1500, 1, 50, 'active'),
  (6, 7, 6, date('now', 'start of month', '-3 months'), date('now', 'start of month', '+9 months', '-1 day'), 1650, 1650, 1, 50, 'active'),
  (7, 8, 7, date('now', 'start of month', '-10 months'), date('now', 'start of month', '+2 months', '-1 day'), 1650, 1650, 1, 50, 'active'),
  (8, 9, 8, date('now', 'start of month', '-2 months'), date('now', 'start of month', '+10 months', '-1 day'), 1950, 1950, 1, 50, 'active'),
  (9, 10, 9, date('now', 'start of month', '-7 months'), date('now', 'start of month', '+5 months', '-1 day'), 1950, 1950, 1, 50, 'active'),
  (10, 4, 10, date('now', 'start of month', '-13 months'), date('now', 'start of month', '-1 day'), 1400, 1400, 1, 50, 'ended');
-- Last month: every charge paid. This month: most paid, one partial, two still owed.
INSERT INTO rent_charges (id, lease_id, period, due_date, amount, amount_paid, status) VALUES
  (1, 1, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 2300, 2300, 'paid'),
  (2, 2, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1700, 1700, 'paid'),
  (3, 3, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1450, 1450, 'paid'),
  (4, 4, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1850, 1850, 'paid'),
  (5, 5, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1500, 1500, 'paid'),
  (6, 6, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1650, 1650, 'paid'),
  (7, 7, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1650, 1650, 'paid'),
  (8, 8, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1950, 1950, 'paid'),
  (9, 9, strftime('%Y-%m', 'now', 'start of month', '-1 month'), date('now', 'start of month', '-1 month'), 1950, 1950, 'paid'),
  (10, 1, strftime('%Y-%m', 'now'), date('now', 'start of month'), 2300, 2300, 'paid'),
  (11, 2, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1700, 1700, 'paid'),
  (12, 3, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1450, 1450, 'paid'),
  (13, 4, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1850, 900, 'partial'),
  (14, 5, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1500, 1500, 'paid'),
  (15, 6, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1650, 0, 'open'),
  (16, 7, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1650, 1650, 'paid'),
  (17, 8, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1950, 1950, 'paid'),
  (18, 9, strftime('%Y-%m', 'now'), date('now', 'start of month'), 1950, 0, 'open');
-- Unpaid charges past their due date read as overdue, as the app marks them.
UPDATE rent_charges SET status = 'overdue' WHERE status IN ('open', 'partial') AND amount_paid < amount AND due_date < date('now');
INSERT INTO payments (charge_id, paid_at, amount, method, reference) VALUES
  (1, date('now', 'start of month', '-1 month', '+1 day'), 2300, 'ach', 'ACH-40211'),
  (2, date('now', 'start of month', '-1 month'), 1700, 'ach', 'ACH-40198'),
  (3, date('now', 'start of month', '-1 month', '+2 days'), 1450, 'check', 'Check 1184'),
  (4, date('now', 'start of month', '-1 month', '+3 days'), 1850, 'ach', 'ACH-40276'),
  (5, date('now', 'start of month', '-1 month'), 1500, 'credit', 'CARD-7731'),
  (6, date('now', 'start of month', '-1 month', '+1 day'), 1650, 'ach', 'ACH-40233'),
  (7, date('now', 'start of month', '-1 month', '+4 days'), 1650, 'check', 'Check 2207'),
  (8, date('now', 'start of month', '-1 month'), 1950, 'ach', 'ACH-40187'),
  (9, date('now', 'start of month', '-1 month', '+2 days'), 1950, 'ach', 'ACH-40251'),
  (10, date('now', 'start of month'), 2300, 'ach', 'ACH-41022'),
  (11, date('now', 'start of month'), 1700, 'ach', 'ACH-41008'),
  (12, date('now', 'start of month', '+1 day'), 1450, 'check', 'Check 1191'),
  (13, date('now', 'start of month', '+2 days'), 900, 'ach', 'ACH-41090'),
  (14, date('now', 'start of month'), 1500, 'credit', 'CARD-7802'),
  (16, date('now', 'start of month', '+3 days'), 1650, 'check', 'Check 2215'),
  (17, date('now', 'start of month'), 1950, 'ach', 'ACH-41015');
INSERT INTO vendors (id, name, category, phone, email, color) VALUES
  (1, 'Emerald Pool Service', 'general', '512-555-0144', 'office@emeraldpool.example.com', 'emerald'),
  (2, 'Hill Country Plumbing', 'plumber', '512-555-0188', 'dispatch@hcplumbing.example.com', 'sky'),
  (3, 'Bright Spark Electric', 'electrician', '512-555-0102', 'jobs@brightspark.example.com', 'amber'),
  (4, 'Lone Star HVAC', 'hvac', '512-555-0161', 'service@lonestarhvac.example.com', 'rose'),
  (5, 'Fresh Start Cleaning', 'cleaning', '512-555-0133', 'book@freshstart.example.com', 'teal');
INSERT INTO work_orders (property_id, unit_id, tenant_id, vendor_id, title, description, priority, status, scheduled_at, completed_at, cost, created_at) VALUES
  (3, 5, 4, 2, 'Water heater leaking', 'Tenant reports water pooling under the heater closet. Shut-off valve closed.', 'urgent', 'in_progress', date('now'), NULL, NULL, datetime('now', '-1 day')),
  (4, 9, 8, 4, 'AC not cooling', 'Unit holds 82F with the thermostat at 72F.', 'high', 'assigned', date('now', '+1 day'), NULL, NULL, datetime('now', '-2 days')),
  (1, 1, 1, NULL, 'Garage door opener stuck', 'Opens halfway, then reverses.', 'normal', 'open', NULL, NULL, NULL, datetime('now', '-3 days')),
  (1, 1, NULL, 1, 'Monthly pool service', NULL, 'low', 'assigned', date('now', '+6 days'), NULL, NULL, datetime('now', '-5 days')),
  (3, 4, NULL, 5, 'Turnover clean, Unit 2', 'Deep clean before the next showing.', 'normal', 'completed', date('now', '-9 days'), date('now', '-9 days'), 240, datetime('now', '-12 days')),
  (2, 2, 2, 3, 'Kitchen outlet not working', 'GFCI tripped repeatedly. Replaced outlet.', 'high', 'completed', date('now', '-16 days'), date('now', '-15 days'), 185, datetime('now', '-18 days'));
INSERT INTO applications (unit_id, first_name, last_name, email, phone, monthly_income, employer, desired_move_in, status) VALUES
  (4, 'Chloe', 'Bennett', 'chloe.bennett@example.com', '512-555-0151', 5300, 'Charles Schwab', date('now', 'start of month', '+1 month'), 'screening'),
  (4, 'Daniel', 'Moore', 'daniel.moore@example.com', '512-555-0152', 4700, 'H-E-B', date('now', '+14 days'), 'new');
