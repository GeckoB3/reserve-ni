# ReserveNI — Bookable Services Landscape & Unified Architecture Plan

**From Restaurant Bookings to Every Bookable Service in Northern Ireland**
**March 2026**

---

## 1. The Complete Landscape of Bookable Services

Every bookable business in Northern Ireland falls into one of five fundamental booking models. The critical insight — and the thing that will save you from building dozens of bespoke dashboards — is that while there are hundreds of specific business types, they all use one of a small number of scheduling patterns. If you build for the pattern, you cover every business in the category.

### 1.1 The Five Booking Models

**Model A: Table/Cover Reservation (Already Built)**
The guest books a time slot for a party at a venue. Capacity is measured in covers or tables. Duration is estimated by the venue. Multiple parties share the same time slot up to capacity.

Businesses: Restaurants, cafes, pubs, bars, gastropubs, hotel restaurants, afternoon tea venues, supper clubs.

**Model B: Practitioner Appointment**
The client books a specific service with a specific practitioner for a defined duration. One client per practitioner at a time. The calendar is the practitioner's day divided into bookable slots based on service durations.

Businesses: Barbers, hairdressers, beauty therapists, nail technicians, makeup artists, lash technicians, brow specialists, massage therapists, physiotherapists, osteopaths, chiropractors, podiatrists, occupational therapists, speech therapists, counsellors, psychotherapists, nutritionists, dietitians, acupuncturists, reflexologists, personal trainers, dog groomers, mobile mechanics, tutors, music teachers, driving instructors, photographers (session bookings), tattoo artists, piercing studios, opticians, dentists (private), private GPs, veterinary clinics, solicitors (consultations), accountants (consultations), financial advisers, mobile hairdressers, mobile beauticians, home cleaning services (scheduled), pet sitters.

**Model C: Event/Experience Ticket**
The guest books a ticket to a specific event on a specific date and time. Capacity is a fixed number of tickets. Everyone starts at the same time. May have multiple ticket types (adult, child, VIP).

Businesses: Cooking classes, escape rooms, boat tours, whiskey tastings, wine tastings, pottery classes, art workshops, axe throwing, archery experiences, clay pigeon shooting, brewery tours, distillery tours, farm tours, ghost tours, walking tours, segway tours, outdoor adventures (kayaking, climbing, coasteering), theatre performances, comedy nights, live music venues, cinema screenings, kids party venues, team building events, food tours, foraging experiences, craft workshops, dance classes (drop-in), yoga retreats, wellness workshops.

**Model D: Class/Group Session**
A recurring scheduled session with a fixed capacity. Clients book a spot in a specific instance of a recurring class. The same class repeats on a schedule (e.g. every Monday at 7pm).

Businesses: Yoga studios, pilates studios, spin/cycling studios, CrossFit boxes, martial arts schools, dance schools, swimming lessons, fitness bootcamps, gym classes, language classes, music schools (group lessons), kids activity clubs, baby/toddler classes (e.g. baby sensory, messy play), adult education workshops, sewing classes, cooking schools (recurring), book clubs, sports coaching groups.

**Model E: Resource/Facility Booking**
The client books a physical space or resource for a defined time period. No specific staff member is required — it's the resource that's being reserved.

Businesses: Meeting rooms, co-working desks, sports pitches (5-a-side, tennis courts, padel courts), golf tee times, bowling lanes, hot tub hire, sauna rooms, photography studios, rehearsal rooms, recording studios, party rooms, function rooms, event spaces, caravan/glamping sites, holiday cottage changeover slots, equipment hire (bikes, paddleboards, kayaks), car wash bays, self-service dog wash, launderette machines.

### 1.2 Why Five Models Is Enough

You might look at this list and see 100+ business types. But every single one maps to one of five booking models. A barber and a physiotherapist use the exact same scheduling logic (practitioner appointment) — the only differences are the service names, the typical durations, and the industry-specific labels (a barber has "clients" and "cuts"; a physio has "patients" and "assessments"). Those are cosmetic differences handled by templates, not code.

This is the key architectural decision: **build five booking engines, not fifty dashboards.**

---

## 2. What Each Model Needs — Feature Matrix

| Feature | A: Table | B: Appointment | C: Event | D: Class | E: Resource |
|---|---|---|---|---|---|
| Calendar type | Slot/sitting grid | Practitioner day calendar | Event listing by date | Recurring timetable | Resource timeline |
| Capacity unit | Covers/tables | 1 client per practitioner | Tickets per event | Spots per class | Time slots per resource |
| Duration set by | Venue (turn time) | Service duration | Event duration (fixed) | Class duration (fixed) | Client (booking length) |
| Multiple staff | N/A (table-based) | Yes — each has own calendar | Optional (instructor) | Yes (instructor per class) | N/A (resource-based) |
| Service menu | N/A | Yes — services with durations/prices | Ticket types/tiers | Class types | Resource types |
| Recurring schedule | Opening hours | Practitioner working hours | One-off or repeating | Weekly timetable | Opening hours |
| Deposit/payment | Deposit per cover | Full payment or deposit | Full payment upfront | Per-class or package | Full or hourly rate |
| Client record | Guest record | Client profile with history | Attendee list | Member/participant | Booker details |
| No-show handling | Deposit forfeit | Cancellation fee or forfeit | Usually non-refundable | Spot released | Slot released |
| Walk-ins | Yes (walk-in queue) | Yes (squeeze in if free) | No (ticketed) | Yes (if spots remain) | No (must book) |
| Check-in | Day sheet / table status | Mark as arrived | Attendee check-in | Class roster check-in | N/A |
| Key dashboard view | Day sheet + table grid | Practitioner calendar | Event management | Timetable + class roster | Resource timeline |
| Reminders | SMS 24h before | SMS/email day before | Email with ticket/details | Email day before | Email day before |
| Online payment | Deposit via Stripe | Full or deposit via Stripe | Full via Stripe | Per-class or membership | Full via Stripe |

### 2.1 Shared Infrastructure Across All Models

These features are identical regardless of booking model and are already built or easily shared:

- Authentication and user management (Supabase Auth)
- Stripe Connect for payments (direct charges to venue)
- Communication engine (SendGrid email + Twilio SMS)
- Confirm-or-cancel flow
- Guest/client record with identity matching
- Events table (audit log)
- Booking page and iFrame widget (template varies by model)
- QR codes
- Reporting framework
- Onboarding wizard framework

---

## 3. The Unified Architecture

### 3.1 The Template Approach

Instead of building separate applications for each business type, build a **template system** where the business type selection at onboarding configures:

1. **Which booking model** drives the availability engine
2. **Which dashboard views** are shown in the sidebar
3. **Which terminology** is used throughout the UI
4. **Which default services/settings** are pre-populated
5. **Which booking page layout** guests see

Everything else — auth, payments, communications, reporting — is shared.

### 3.2 Business Type → Model Mapping

When a business selects their type during onboarding, the system maps it to a booking model:

```typescript
const BUSINESS_TYPE_CONFIG: Record<string, BusinessConfig> = {

  // MODEL A: Table Reservation
  restaurant:        { model: 'table_reservation', category: 'hospitality', 
                       terms: { client: 'Guest', booking: 'Reservation', staff: 'Staff' },
                       pricing: 'venue_flat', defaultPrice: 7900 },
  cafe:              { model: 'table_reservation', category: 'hospitality', ... },
  pub:               { model: 'table_reservation', category: 'hospitality', ... },
  hotel_restaurant:  { model: 'table_reservation', category: 'hospitality', ... },

  // MODEL B: Practitioner Appointment
  barber:            { model: 'practitioner_appointment', category: 'beauty_grooming',
                       terms: { client: 'Client', booking: 'Appointment', staff: 'Barber' },
                       pricing: 'per_user', defaultPrice: 1000,
                       defaultServices: [
                         { name: "Men's Cut", duration: 30, price: 1500 },
                         { name: 'Beard Trim', duration: 15, price: 1000 },
                         { name: 'Cut & Beard', duration: 45, price: 2200 },
                         { name: "Kid's Cut", duration: 20, price: 1000 },
                       ]},
  hairdresser:       { model: 'practitioner_appointment', category: 'beauty_grooming',
                       terms: { client: 'Client', booking: 'Appointment', staff: 'Stylist' },
                       defaultServices: [
                         { name: 'Cut & Blow Dry', duration: 60, price: 4000 },
                         { name: 'Colour', duration: 90, price: 6500 },
                         { name: 'Highlights', duration: 120, price: 8500 },
                         { name: 'Blow Dry', duration: 30, price: 2500 },
                       ]},
  beauty_therapist:  { model: 'practitioner_appointment', category: 'beauty_grooming',
                       terms: { client: 'Client', booking: 'Appointment', staff: 'Therapist' },
                       defaultServices: [
                         { name: 'Facial', duration: 60, price: 5000 },
                         { name: 'Manicure', duration: 45, price: 2500 },
                         { name: 'Pedicure', duration: 45, price: 3000 },
                         { name: 'Waxing', duration: 30, price: 2000 },
                       ]},
  nail_technician:   { model: 'practitioner_appointment', category: 'beauty_grooming', ... },
  massage_therapist: { model: 'practitioner_appointment', category: 'health_wellness', ... },
  physiotherapist:   { model: 'practitioner_appointment', category: 'health_wellness',
                       terms: { client: 'Patient', booking: 'Appointment', staff: 'Physio' },
                       defaultServices: [
                         { name: 'Initial Assessment', duration: 60, price: 5500 },
                         { name: 'Follow-up Treatment', duration: 30, price: 4000 },
                         { name: 'Sports Massage', duration: 45, price: 4500 },
                       ]},
  osteopath:         { model: 'practitioner_appointment', category: 'health_wellness', ... },
  chiropractor:      { model: 'practitioner_appointment', category: 'health_wellness', ... },
  podiatrist:        { model: 'practitioner_appointment', category: 'health_wellness', ... },
  occupational_therapist: { model: 'practitioner_appointment', category: 'health_wellness', ... },
  counsellor:        { model: 'practitioner_appointment', category: 'health_wellness',
                       terms: { client: 'Client', booking: 'Session', staff: 'Counsellor' }, ... },
  dentist:           { model: 'practitioner_appointment', category: 'health_wellness', ... },
  optician:          { model: 'practitioner_appointment', category: 'health_wellness', ... },
  veterinary:        { model: 'practitioner_appointment', category: 'health_wellness',
                       terms: { client: 'Pet Owner', booking: 'Appointment', staff: 'Vet' }, ... },
  dog_groomer:       { model: 'practitioner_appointment', category: 'pets', ... },
  tattoo_artist:     { model: 'practitioner_appointment', category: 'beauty_grooming', ... },
  personal_trainer:  { model: 'practitioner_appointment', category: 'fitness', ... },
  tutor:             { model: 'practitioner_appointment', category: 'education', ... },
  driving_instructor:{ model: 'practitioner_appointment', category: 'education', ... },
  photographer:      { model: 'practitioner_appointment', category: 'creative', ... },
  solicitor:         { model: 'practitioner_appointment', category: 'professional', ... },
  accountant:        { model: 'practitioner_appointment', category: 'professional', ... },

  // MODEL C: Event/Experience
  escape_room:       { model: 'event_ticket', category: 'experiences',
                       terms: { client: 'Guest', booking: 'Booking', staff: 'Host' },
                       pricing: 'venue_flat', defaultPrice: 7900 },
  cooking_class:     { model: 'event_ticket', category: 'experiences', ... },
  boat_tour:         { model: 'event_ticket', category: 'experiences', ... },
  distillery_tour:   { model: 'event_ticket', category: 'experiences', ... },
  adventure_activity:{ model: 'event_ticket', category: 'experiences', ... },
  workshop:          { model: 'event_ticket', category: 'experiences', ... },
  theatre:           { model: 'event_ticket', category: 'entertainment', ... },
  comedy_night:      { model: 'event_ticket', category: 'entertainment', ... },
  live_music_venue:  { model: 'event_ticket', category: 'entertainment', ... },
  kids_party_venue:  { model: 'event_ticket', category: 'experiences', ... },

  // MODEL D: Class/Group
  yoga_studio:       { model: 'class_session', category: 'fitness',
                       terms: { client: 'Member', booking: 'Booking', staff: 'Instructor' },
                       pricing: 'venue_flat', defaultPrice: 7900 },
  pilates_studio:    { model: 'class_session', category: 'fitness', ... },
  gym:               { model: 'class_session', category: 'fitness', ... },
  dance_school:      { model: 'class_session', category: 'education', ... },
  martial_arts:      { model: 'class_session', category: 'fitness', ... },
  swimming_lessons:  { model: 'class_session', category: 'fitness', ... },
  baby_classes:      { model: 'class_session', category: 'family', ... },
  language_school:   { model: 'class_session', category: 'education', ... },

  // MODEL E: Resource/Facility
  meeting_room:      { model: 'resource_booking', category: 'business',
                       terms: { client: 'Booker', booking: 'Booking', staff: 'Manager' },
                       pricing: 'venue_flat', defaultPrice: 7900 },
  sports_pitch:      { model: 'resource_booking', category: 'sports', ... },
  tennis_court:      { model: 'resource_booking', category: 'sports', ... },
  golf_tee_time:     { model: 'resource_booking', category: 'sports', ... },
  studio_hire:       { model: 'resource_booking', category: 'creative', ... },
  equipment_hire:    { model: 'resource_booking', category: 'leisure', ... },
  glamping_site:     { model: 'resource_booking', category: 'accommodation', ... },

  // CATCH-ALL
  other:             { model: 'practitioner_appointment', category: 'other',
                       terms: { client: 'Client', booking: 'Booking', staff: 'Staff' },
                       pricing: 'per_user', defaultPrice: 1000,
                       defaultServices: [] },
};
```

### 3.3 Dashboard Views Per Model

Each booking model shows a different set of dashboard pages:

| Dashboard Page | A: Table | B: Appointment | C: Event | D: Class | E: Resource |
|---|---|---|---|---|---|
| Bookings list | ✅ | ✅ | ✅ | ✅ | ✅ |
| Day sheet | ✅ | — | — | — | — |
| Table grid / Floor plan | ✅ (if enabled) | — | — | — | — |
| Practitioner calendar | — | ✅ | — | — | — |
| Event manager | — | — | ✅ | — | — |
| Class timetable | — | — | — | ✅ | — |
| Resource timeline | — | — | — | — | ✅ |
| Client / guest records | ✅ | ✅ | ✅ | ✅ | ✅ |
| Services / menu | — | ✅ | — | — | — |
| Reporting | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ |

### 3.4 Terminology System

A simple translation layer that replaces labels throughout the UI based on the business type's terms configuration:

```typescript
// lib/terminology.ts
export function t(key: string, businessType: string): string {
  const config = BUSINESS_TYPE_CONFIG[businessType];
  const terms = config?.terms || { client: 'Client', booking: 'Booking', staff: 'Staff' };
  
  const translations: Record<string, string> = {
    'client': terms.client,           // Guest / Client / Patient / Member
    'clients': pluralise(terms.client),
    'booking': terms.booking,          // Reservation / Appointment / Booking / Session
    'bookings': pluralise(terms.booking),
    'staff_member': terms.staff,       // Staff / Barber / Stylist / Physio / Instructor
    'staff_members': pluralise(terms.staff),
    'no_show': terms.client === 'Patient' ? 'DNA' : 'No-show',  // Health uses 'DNA' (Did Not Attend)
    'covers': terms.client === 'Guest' ? 'Covers' : 'Clients',
  };
  
  return translations[key] || key;
}
```

This means a physiotherapist sees "Patients", "Appointments", "DNAs" in their dashboard while a barber sees "Clients", "Appointments", "No-shows" — with zero additional code.

---

## 4. Build Priority & Sequence

### 4.1 What's Already Built (Model A — complete)

Your restaurant platform covers Model A fully: table reservations with availability engine, deposits, communications, day sheet, table management, reporting.

### 4.2 Build Order for Remaining Models

**Phase 1: Model B — Practitioner Appointments (build next)**

This is the highest priority because it covers the most business types by far (barbers, hairdressers, beauty, all health professions, trainers, tutors, groomers, etc.). It's also the model most requested by NI small businesses.

Core features needed:
- Practitioner management (add practitioners with working hours, breaks, days off)
- Service menu (services with names, durations, prices, which practitioners offer them)
- Practitioner calendar view (day/week, showing appointments per practitioner in columns)
- Appointment booking engine (check practitioner availability based on their working hours, existing appointments, and service duration + buffer time)
- Guest-facing booking page (select service → select practitioner → select date → select available time → pay/book)
- Client records (visit history per client, notes, preferences)
- Appointment reminders and confirmations (reuse communication engine)
- Deposit or full payment via Stripe Connect
- Basic reporting (appointments per practitioner, revenue, no-show rate)

Estimated effort: 3–4 weeks with AI-assisted development.

**Phase 2: Model C — Event/Experience Tickets**

Second priority because NI has a growing experience economy (escape rooms, tours, outdoor activities) and these businesses currently have limited local booking options.

Core features needed:
- Event creation (name, date/time, duration, capacity, description, images, ticket types with pricing)
- Recurring event support (e.g. "every Saturday at 2pm")
- Ticket booking engine (check remaining capacity, handle multiple ticket types)
- Guest-facing event listing and booking page
- Attendee management (check-in list, contact details)
- Event reminders
- Full payment collection at booking
- Basic reporting (tickets sold, revenue, attendance rate)

Estimated effort: 2–3 weeks (simpler than appointments because there's no per-practitioner calendar complexity).

**Phase 3: Model D — Class/Group Sessions**

Third priority. Overlaps significantly with Model C (a class is essentially a recurring event with a timetable view).

Core features needed:
- Class type definition (name, duration, capacity, instructor, price)
- Recurring timetable builder (drag-and-drop weekly schedule)
- Class instance management (individual sessions from the timetable)
- Spot booking engine (check capacity per class instance)
- Guest-facing timetable view and booking
- Class roster with check-in
- Drop-in vs. membership/package support (future enhancement)
- Reminders and reporting

Estimated effort: 2–3 weeks (heavily leverages Model C infrastructure).

**Phase 4: Model E — Resource/Facility Booking**

Lowest priority — fewer businesses in NI, and many already use bespoke systems. But architecturally simple.

Core features needed:
- Resource definition (name, type, hourly/per-slot rate, availability hours)
- Resource timeline view (similar to table management grid but for resources)
- Time-slot booking engine (check resource availability, prevent double-booking)
- Guest-facing booking page (select resource → select date → select time block → pay)
- Duration-based pricing (e.g. 1 hour, 2 hours)
- Reminders and reporting

Estimated effort: 2 weeks (the simplest model, and borrows heavily from existing timeline grid work).

### 4.3 Total Phased Build Estimate

| Phase | Model | Covers | Effort |
|---|---|---|---|
| Done | A: Table Reservation | Restaurants, cafes, pubs | Complete |
| Phase 1 | B: Practitioner Appointment | ~35+ business types | 3–4 weeks |
| Phase 2 | C: Event/Experience Ticket | ~20+ business types | 2–3 weeks |
| Phase 3 | D: Class/Group Session | ~15+ business types | 2–3 weeks |
| Phase 4 | E: Resource/Facility Booking | ~15+ business types | 2 weeks |
| **Total** | **All models** | **85+ business types** | **9–12 weeks** |

---

## 5. Database Schema Strategy

### 5.1 Shared Tables (existing, extended)

These tables serve ALL booking models with minor additions:

- **`venues`** — Add `booking_model` (text: 'table_reservation', 'practitioner_appointment', 'event_ticket', 'class_session', 'resource_booking'), `business_type` (text), `business_category` (text), `terminology` (JSONB: the terms map for this business)
- **`bookings`** — Already flexible. Add nullable FKs: `practitioner_id`, `event_id`, `class_instance_id`, `resource_id`. Only one is populated per booking depending on the model.
- **`guests`** — Works as-is for all models. The identity matching logic is universal.
- **`events_log`** (audit) — Works as-is.
- **`communication_logs`** — Works as-is.

### 5.2 Model B: New Tables

```sql
-- Practitioners (staff who take appointments)
CREATE TABLE practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),  -- linked to auth user if they log in
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  working_hours JSONB NOT NULL DEFAULT '{}',  -- { "mon": [{"start":"09:00","end":"17:00"}], ... }
  break_times JSONB DEFAULT '[]',             -- [{"start":"13:00","end":"14:00"}]
  days_off JSONB DEFAULT '[]',                -- recurring: ["sun"] or specific: ["2026-04-15"]
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Services offered
CREATE TABLE offered_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL,
  buffer_minutes INT DEFAULT 0,        -- cleanup/prep time after appointment
  price_pence INT,                     -- nullable = price on consultation
  deposit_pence INT,                   -- nullable = no deposit required
  colour TEXT DEFAULT '#3B82F6',       -- calendar colour coding
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Which practitioners offer which services
CREATE TABLE practitioner_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES offered_services(id) ON DELETE CASCADE,
  custom_duration_minutes INT,         -- override if this practitioner is slower/faster
  custom_price_pence INT,              -- override if this practitioner charges differently
  UNIQUE(practitioner_id, service_id)
);
```

### 5.3 Model C: New Tables

```sql
-- Events / experiences
CREATE TABLE venue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT NOT NULL,
  image_url TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,                -- iCal RRULE format for recurring events
  parent_event_id UUID REFERENCES venue_events(id),  -- if this is an instance of a recurring event
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ticket types per event
CREATE TABLE event_ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES venue_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- e.g. 'Adult', 'Child', 'VIP'
  price_pence INT NOT NULL,
  capacity INT,                        -- null = limited only by event capacity
  sort_order INT DEFAULT 0
);
```

### 5.4 Model D: New Tables

```sql
-- Class types
CREATE TABLE class_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- e.g. 'Vinyasa Yoga', 'Spin Class'
  description TEXT,
  duration_minutes INT NOT NULL,
  capacity INT NOT NULL,
  instructor_id UUID REFERENCES practitioners(id),
  price_pence INT,
  colour TEXT DEFAULT '#22C55E',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Timetable entries (recurring schedule)
CREATE TABLE class_timetable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type_id UUID NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL,            -- 0=Sun, 6=Sat
  start_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Individual class instances (generated from timetable)
CREATE TABLE class_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type_id UUID NOT NULL REFERENCES class_types(id),
  timetable_entry_id UUID REFERENCES class_timetable(id),
  instance_date DATE NOT NULL,
  start_time TIME NOT NULL,
  capacity_override INT,               -- null = use class_type default
  is_cancelled BOOLEAN DEFAULT false,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.5 Model E: New Tables

```sql
-- Bookable resources
CREATE TABLE venue_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- e.g. 'Court 1', 'Studio A', 'Pitch 2'
  resource_type TEXT,                  -- e.g. 'tennis_court', 'meeting_room'
  min_booking_minutes INT DEFAULT 60,
  max_booking_minutes INT DEFAULT 120,
  slot_interval_minutes INT DEFAULT 30,
  price_per_slot_pence INT,
  availability_hours JSONB NOT NULL,   -- same format as practitioner working_hours
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. The Onboarding Experience Per Model

When a business selects their type during signup, the onboarding wizard adapts:

### 6.1 Shared Steps (all models)

- Step 1: Your Business (name, address, phone, photo — identical for all)
- Final Step: Preview & Go Live (booking page preview, QR code — identical for all)

### 6.2 Model-Specific Steps

**Model A (restaurants):** Opening Hours → Slot Model & Capacity → Deposits → Preview. Already built.

**Model B (appointments):** Your Team (add practitioners + working hours) → Your Services (service menu with durations and prices) → Deposits/Payments → Preview.

**Model C (events):** Your First Event (create an event with date, time, capacity, ticket types) → Payment Settings → Preview.

**Model D (classes):** Your Classes (define class types) → Your Timetable (set up weekly schedule) → Payment Settings → Preview.

**Model E (resources):** Your Resources (define bookable resources with availability) → Pricing → Preview.

### 6.3 Smart Defaults

When the user selects their business type, the wizard pre-populates everything it can:

- Barber → Services pre-filled (Men's Cut 30min £15, etc.), working hours pre-set (Tue-Sat 9-6)
- Physiotherapist → Services pre-filled (Initial Assessment 60min £55, Follow-up 30min £40), terminology switched to Patient/Appointment/Physio
- Escape Room → One event template pre-created, capacity suggested at 6
- Yoga Studio → Class types pre-filled (Vinyasa 60min, Yin 75min), timetable template ready

The user adjusts from sensible defaults rather than building from scratch. This is the single biggest time-saver in the onboarding experience.

---

## 7. Maintaining Simplicity — Guidelines

Your concern about providing too many bespoke options is well-founded. Here are the rules to keep the system manageable:

### 7.1 Rules for What's Configurable vs. Fixed

**Configurable by the business (through settings):**
- Business name, address, logo, description
- Services/events/classes/resources (names, durations, prices)
- Working hours and availability
- Practitioner profiles
- Deposit amounts and cancellation policy
- Communication template wording

**Configurable by business TYPE (through the template system, not by the user):**
- Which dashboard views are shown
- Terminology (Guest vs Client vs Patient)
- Default services and settings
- Booking page layout
- Which booking model drives availability

**NOT configurable (hard-coded decisions):**
- The booking models themselves (five models, no hybrids)
- The core database schema
- The payment flow (always Stripe Connect)
- The communication channels (always email + SMS)
- The cancellation policy structure (configurable windows, but the framework is fixed)
- The reporting metrics (standardised across all models)

### 7.2 The "Other" Escape Hatch

For any business that doesn't fit neatly into a predefined type, the "Other" option defaults to Model B (practitioner appointment) with blank service templates. This is the safest default because appointment booking is the most common pattern for service businesses, and it's flexible enough to work for almost anything. The user just fills in their own service names and durations.

### 7.3 One Codebase, One Dashboard Shell

The dashboard should be a single application with conditional rendering, not five separate apps. The sidebar navigation, header, settings structure, and reporting framework are shared. Only the main content area changes based on the booking model. This means:

- One set of components to maintain
- One deployment pipeline
- Shared bug fixes and improvements benefit all business types
- New business types can be added by creating a config entry and (if needed) custom default services — no new code required unless a new booking MODEL is needed

---

## 8. Pricing Model Summary

| Model | Pricing | Rationale |
|---|---|---|
| A: Table Reservation | £79/month flat | Restaurant pricing is venue-based, not staff-based |
| B: Practitioner Appointment | £10/user/month | Value scales with team size |
| C: Event/Experience | £79/month flat | Venue-based, one account manages all events |
| D: Class/Group | £79/month flat | Studio-based, one account manages the timetable |
| E: Resource/Facility | £79/month flat | Facility-based, one account manages all resources |

Solo practitioners (barbers, physios, tutors working alone) get the cheapest entry at £10/month. Multi-practitioner businesses (salons, clinics) scale naturally. Venue-based businesses (restaurants, studios, escape rooms) pay a flat fee regardless of staff count.

---

## 9. Summary — What to Build and In What Order

1. **Now:** Finish polishing the restaurant product. Get founding venues live.
2. **Next (Phase 1):** Build Model B (practitioner appointments). This single model covers the largest number of NI businesses and is the fastest path to revenue diversification.
3. **Then (Phase 2):** Build Model C (events/experiences). NI's experience economy is growing.
4. **Then (Phase 3):** Build Model D (classes). Heavily reuses Model C.
5. **Finally (Phase 4):** Build Model E (resources). Simplest model, smallest market.
6. **After all models:** Build the multi-vertical landing page and onboarding flow that routes users to the right experience.
7. **Future:** Consumer-facing app for discovery and booking across all verticals.

At each phase, the existing models continue working unchanged. New business types can be added to the config file without new code — they just need a mapping to one of the five models and a set of default services.
