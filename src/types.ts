export type UserRole = 'student' | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  university_id?: string;
  department?: string;
  role: UserRole;
  photo?: string;
  student_card_image?: string;
  required_hours?: number;
}

export interface ExamSlot {
  id: string;
  course_name: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  session_type: 'morning' | 'evening';
  required_invigilators: number;
  current_invigilators?: number; // Track current bookings
  location?: string;
  academic_year: 1 | 2 | 3 | 4 | 5;
}

export interface Booking {
  id: string;
  student_id: string;
  slot_id: string;
  booked_hours: number;
  student_name: string;
  course_name: string;
  exam_date: string;
  attended?: boolean;
  admin_notes?: string;
}

export interface AppSettings {
  registration_open: boolean;
  registration_start: string;
  registration_end: string;
  default_required_hours: number;
}
