/**
 * Business type → booking model mapping.
 * When a business selects their type during onboarding, the system
 * maps it to one of five booking models and applies template defaults.
 */

import type { BookingModel, VenueTerminology } from '@/types/booking-models';
import { DEFAULT_TERMINOLOGY } from '@/types/booking-models';

export interface DefaultService {
  name: string;
  duration: number;
  price: number;
}

export interface BusinessConfig {
  model: BookingModel;
  category: string;
  terms: VenueTerminology;
  defaultServices?: DefaultService[];
}

export const BUSINESS_TYPE_CONFIG: Record<string, BusinessConfig> = {
  // MODEL A: Table Reservation
  restaurant:       { model: 'table_reservation', category: 'hospitality', terms: { client: 'Guest', booking: 'Reservation', staff: 'Staff' } },
  cafe:             { model: 'table_reservation', category: 'hospitality', terms: { client: 'Guest', booking: 'Reservation', staff: 'Staff' } },
  pub:              { model: 'table_reservation', category: 'hospitality', terms: { client: 'Guest', booking: 'Reservation', staff: 'Staff' } },
  hotel_restaurant: { model: 'table_reservation', category: 'hospitality', terms: { client: 'Guest', booking: 'Reservation', staff: 'Staff' } },

  // MODEL B: Practitioner Appointment
  barber: {
    model: 'practitioner_appointment', category: 'beauty_grooming',
    terms: { client: 'Client', booking: 'Appointment', staff: 'Barber' },
    defaultServices: [
      { name: "Men's Cut", duration: 30, price: 1500 },
      { name: 'Beard Trim', duration: 15, price: 1000 },
      { name: 'Cut & Beard', duration: 45, price: 2200 },
      { name: "Kid's Cut", duration: 20, price: 1000 },
    ],
  },
  hairdresser: {
    model: 'practitioner_appointment', category: 'beauty_grooming',
    terms: { client: 'Client', booking: 'Appointment', staff: 'Stylist' },
    defaultServices: [
      { name: 'Cut & Blow Dry', duration: 60, price: 4000 },
      { name: 'Colour', duration: 90, price: 6500 },
      { name: 'Highlights', duration: 120, price: 8500 },
      { name: 'Blow Dry', duration: 30, price: 2500 },
    ],
  },
  beauty_therapist: {
    model: 'practitioner_appointment', category: 'beauty_grooming',
    terms: { client: 'Client', booking: 'Appointment', staff: 'Therapist' },
    defaultServices: [
      { name: 'Facial', duration: 60, price: 5000 },
      { name: 'Manicure', duration: 45, price: 2500 },
      { name: 'Pedicure', duration: 45, price: 3000 },
      { name: 'Waxing', duration: 30, price: 2000 },
    ],
  },
  nail_technician:   { model: 'practitioner_appointment', category: 'beauty_grooming', terms: { client: 'Client', booking: 'Appointment', staff: 'Nail Tech' } },
  massage_therapist: { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Client', booking: 'Appointment', staff: 'Therapist' } },
  physiotherapist: {
    model: 'practitioner_appointment', category: 'health_wellness',
    terms: { client: 'Patient', booking: 'Appointment', staff: 'Physio' },
    defaultServices: [
      { name: 'Initial Assessment', duration: 60, price: 5500 },
      { name: 'Follow-up Treatment', duration: 30, price: 4000 },
      { name: 'Sports Massage', duration: 45, price: 4500 },
    ],
  },
  osteopath:               { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Patient', booking: 'Appointment', staff: 'Osteopath' } },
  chiropractor:            { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Patient', booking: 'Appointment', staff: 'Chiropractor' } },
  podiatrist:              { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Patient', booking: 'Appointment', staff: 'Podiatrist' } },
  occupational_therapist:  { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Patient', booking: 'Session', staff: 'OT' } },
  counsellor:              { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Client', booking: 'Session', staff: 'Counsellor' } },
  dentist:                 { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Patient', booking: 'Appointment', staff: 'Dentist' } },
  optician:                { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Patient', booking: 'Appointment', staff: 'Optician' } },
  veterinary:              { model: 'practitioner_appointment', category: 'health_wellness', terms: { client: 'Pet Owner', booking: 'Appointment', staff: 'Vet' } },
  dog_groomer:             { model: 'practitioner_appointment', category: 'pets', terms: { client: 'Client', booking: 'Appointment', staff: 'Groomer' } },
  tattoo_artist:           { model: 'practitioner_appointment', category: 'beauty_grooming', terms: { client: 'Client', booking: 'Session', staff: 'Artist' } },
  personal_trainer:        { model: 'practitioner_appointment', category: 'fitness', terms: { client: 'Client', booking: 'Session', staff: 'Trainer' } },
  tutor:                   { model: 'practitioner_appointment', category: 'education', terms: { client: 'Student', booking: 'Lesson', staff: 'Tutor' } },
  driving_instructor:      { model: 'practitioner_appointment', category: 'education', terms: { client: 'Learner', booking: 'Lesson', staff: 'Instructor' } },
  photographer:            { model: 'practitioner_appointment', category: 'creative', terms: { client: 'Client', booking: 'Session', staff: 'Photographer' } },
  solicitor:               { model: 'practitioner_appointment', category: 'professional', terms: { client: 'Client', booking: 'Consultation', staff: 'Solicitor' } },
  accountant:              { model: 'practitioner_appointment', category: 'professional', terms: { client: 'Client', booking: 'Consultation', staff: 'Accountant' } },

  // MODEL C: Event/Experience
  escape_room:       { model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Host' } },
  cooking_class:     { model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Chef' } },
  boat_tour:         { model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Guide' } },
  distillery_tour:   { model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Guide' } },
  adventure_activity:{ model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Instructor' } },
  workshop:          { model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Host' } },
  theatre:           { model: 'event_ticket', category: 'entertainment', terms: { client: 'Guest', booking: 'Ticket', staff: 'Staff' } },
  comedy_night:      { model: 'event_ticket', category: 'entertainment', terms: { client: 'Guest', booking: 'Ticket', staff: 'Staff' } },
  live_music_venue:  { model: 'event_ticket', category: 'entertainment', terms: { client: 'Guest', booking: 'Ticket', staff: 'Staff' } },
  kids_party_venue:  { model: 'event_ticket', category: 'experiences', terms: { client: 'Guest', booking: 'Booking', staff: 'Host' } },

  // MODEL D: Class/Group
  yoga_studio:       { model: 'class_session', category: 'fitness', terms: { client: 'Member', booking: 'Booking', staff: 'Instructor' } },
  pilates_studio:    { model: 'class_session', category: 'fitness', terms: { client: 'Member', booking: 'Booking', staff: 'Instructor' } },
  gym:               { model: 'class_session', category: 'fitness', terms: { client: 'Member', booking: 'Booking', staff: 'Instructor' } },
  dance_school:      { model: 'class_session', category: 'education', terms: { client: 'Student', booking: 'Booking', staff: 'Instructor' } },
  martial_arts:      { model: 'class_session', category: 'fitness', terms: { client: 'Member', booking: 'Booking', staff: 'Instructor' } },
  swimming_lessons:  { model: 'class_session', category: 'fitness', terms: { client: 'Member', booking: 'Booking', staff: 'Instructor' } },
  baby_classes:      { model: 'class_session', category: 'family', terms: { client: 'Parent', booking: 'Booking', staff: 'Leader' } },
  language_school:   { model: 'class_session', category: 'education', terms: { client: 'Student', booking: 'Booking', staff: 'Teacher' } },

  // MODEL E: Resource/Facility
  meeting_room:      { model: 'resource_booking', category: 'business', terms: { client: 'Booker', booking: 'Booking', staff: 'Manager' } },
  sports_pitch:      { model: 'resource_booking', category: 'sports', terms: { client: 'Booker', booking: 'Booking', staff: 'Manager' } },
  tennis_court:      { model: 'resource_booking', category: 'sports', terms: { client: 'Player', booking: 'Booking', staff: 'Manager' } },
  golf_tee_time:     { model: 'resource_booking', category: 'sports', terms: { client: 'Golfer', booking: 'Tee Time', staff: 'Pro Shop' } },
  studio_hire:       { model: 'resource_booking', category: 'creative', terms: { client: 'Booker', booking: 'Booking', staff: 'Manager' } },
  equipment_hire:    { model: 'resource_booking', category: 'leisure', terms: { client: 'Hirer', booking: 'Hire', staff: 'Staff' } },
  glamping_site:     { model: 'resource_booking', category: 'accommodation', terms: { client: 'Guest', booking: 'Booking', staff: 'Host' } },

  // CATCH-ALL
  other: {
    model: 'practitioner_appointment', category: 'other',
    terms: { client: 'Client', booking: 'Booking', staff: 'Staff' },
    defaultServices: [],
  },

  /**
   * Signup-only keys when the user chooses a booking model directly (not in the business directory).
   * Persisted as `venues.business_type`; excluded from `getBusinessTypesByCategory()`.
   */
  model_table_reservation: {
    model: 'table_reservation',
    category: 'other',
    terms: { ...DEFAULT_TERMINOLOGY.table_reservation },
  },
  model_practitioner_appointment: {
    model: 'practitioner_appointment',
    category: 'other',
    terms: { ...DEFAULT_TERMINOLOGY.practitioner_appointment },
  },
  model_event_ticket: {
    model: 'event_ticket',
    category: 'other',
    terms: { ...DEFAULT_TERMINOLOGY.event_ticket },
  },
  model_class_session: {
    model: 'class_session',
    category: 'other',
    terms: { ...DEFAULT_TERMINOLOGY.class_session },
  },
  model_resource_booking: {
    model: 'resource_booking',
    category: 'other',
    terms: { ...DEFAULT_TERMINOLOGY.resource_booking },
  },
};

/** Short label for chips when browsing business types by category. */
export const BOOKING_MODEL_CHIP_LABEL: Record<BookingModel, string> = {
  table_reservation: 'Table booking',
  practitioner_appointment: 'Appointments',
  event_ticket: 'Event tickets',
  class_session: 'Group classes',
  resource_booking: 'Spaces & resources',
};

export interface BookingModelSignupCard {
  model: BookingModel;
  /** Key in `BUSINESS_TYPE_CONFIG` used when this model is chosen directly. */
  businessTypeKey: string;
  title: string;
  summary: string;
  /** Shown on the direct-selection card */
  detail: string;
  examples: string;
}

/** Order shown on the “choose by booking type” signup path. */
export const BOOKING_MODEL_SIGNUP_CARDS: BookingModelSignupCard[] = [
  {
    model: 'table_reservation',
    businessTypeKey: 'model_table_reservation',
    title: 'Table & cover booking',
    summary: 'Guests book a time for a party size; you manage capacity per slot.',
    detail:
      'Best for restaurants, cafés, pubs, and anywhere people reserve tables or covers for a sitting.',
    examples: 'Restaurant, café, hotel dining, afternoon tea',
  },
  {
    model: 'practitioner_appointment',
    businessTypeKey: 'model_practitioner_appointment',
    title: 'Appointments with a person',
    summary: 'Clients book a service with a specific team member for a set duration.',
    detail:
      'Each practitioner has their own calendar, services, and working hours. One client per staff member at a time.',
    examples: 'Barber, salon, physio, tutor, consultant',
  },
  {
    model: 'event_ticket',
    businessTypeKey: 'model_event_ticket',
    title: 'Events & experiences',
    summary: 'Guests buy tickets for dated experiences with fixed start times and capacity.',
    detail:
      'You define events (or sessions), ticket types, and how many people can attend each run.',
    examples: 'Escape room, tour, tasting, workshop, show night',
  },
  {
    model: 'class_session',
    businessTypeKey: 'model_class_session',
    title: 'Recurring group classes',
    summary: 'Members book a spot in scheduled sessions that repeat on a timetable.',
    detail:
      'Define class types and weekly slots; clients pick which instance they want to join.',
    examples: 'Yoga studio, gym class, swim school, language class',
  },
  {
    model: 'resource_booking',
    businessTypeKey: 'model_resource_booking',
    title: 'Rooms, pitches & equipment',
    summary: 'Bookers reserve a space or item for a length of time—no specific staff required.',
    detail:
      'Resources have their own availability and pricing; bookings are tied to the asset, not a named practitioner.',
    examples: 'Meeting room, court, studio hire, lane, pitch',
  },
];

/** `business_type` value stored when user picks a model directly (matches card `businessTypeKey`). */
export function directModelBusinessTypeKey(model: BookingModel): string {
  return `model_${model}`;
}

export function isDirectModelBusinessType(businessType: string): boolean {
  return businessType.startsWith('model_');
}

/** Human-readable label for plan summary / payment (handles `model_*` keys). */
export function formatSignupBusinessTypeLabel(businessType: string): string {
  if (isDirectModelBusinessType(businessType)) {
    const card = BOOKING_MODEL_SIGNUP_CARDS.find((c) => c.businessTypeKey === businessType);
    if (card) return card.title;
  }
  return businessType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getBusinessConfig(businessType: string): BusinessConfig {
  return BUSINESS_TYPE_CONFIG[businessType] ?? BUSINESS_TYPE_CONFIG.other!;
}

/** All business types grouped by category. */
export function getBusinessTypesByCategory(): Record<string, Array<{ key: string; label: string; model: BookingModel }>> {
  const result: Record<string, Array<{ key: string; label: string; model: BookingModel }>> = {};
  for (const [key, config] of Object.entries(BUSINESS_TYPE_CONFIG)) {
    if (key === 'other' || key.startsWith('model_')) continue;
    if (!result[config.category]) result[config.category] = [];
    result[config.category]!.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      model: config.model,
    });
  }
  return result;
}
