/**
 * Business type → booking model mapping.
 * When a business selects their type during onboarding, the system
 * maps it to one of five booking models and applies template defaults.
 */

import type { BookingModel, VenueTerminology } from '@/types/booking-models';

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
};

export function getBusinessConfig(businessType: string): BusinessConfig {
  return BUSINESS_TYPE_CONFIG[businessType] ?? BUSINESS_TYPE_CONFIG.other!;
}

/** All business types grouped by category. */
export function getBusinessTypesByCategory(): Record<string, Array<{ key: string; label: string; model: BookingModel }>> {
  const result: Record<string, Array<{ key: string; label: string; model: BookingModel }>> = {};
  for (const [key, config] of Object.entries(BUSINESS_TYPE_CONFIG)) {
    if (key === 'other') continue;
    if (!result[config.category]) result[config.category] = [];
    result[config.category]!.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      model: config.model,
    });
  }
  return result;
}
