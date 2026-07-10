export type UserRole = 'student' | 'admin' | 'exam_officer';
export type ObserverType = 'طالب دراسات' | 'موظف' | 'أمين قاعة' | 'دكتور مشرف';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  university_id?: string;
  department?: string;
  role: UserRole;
  requested_role?: UserRole;
  avatar_emoji?: string;
  required_hours?: number;
  required_hours_mode?: 'default' | 'manual';
  status?: 'pending' | 'active' | 'frozen';
  admin_note?: string;
  student_note?: string;
  profile_image_url?: string;
  id_card_image_url?: string;
  observer_type?: ObserverType;
  email_verified?: boolean;
}

export interface RoomRange {
  type: 'المرسم' | 'البهو' | 'القبو' | 'القاعات' | 'التوسع';
  from: number;
  to: number;
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
  duration_hours?: number; // Duration of exam in hours (e.g. 1, 2, 3, 4, 5)
  isDeleted?: boolean;

  // New rooms config fields
  observers_per_room?: number;
  has_studios?: boolean;
  studios_from?: number;
  studios_to?: number;
  has_lobbies?: boolean;
  lobbies_from?: number;
  lobbies_to?: number;
  has_basements?: boolean;
  basements_from?: number;
  basements_to?: number;
  has_halls?: boolean;
  halls_from?: number;
  halls_to?: number;
  has_expansions?: boolean;
  expansions_from?: number;
  expansions_to?: number;
  room_ranges?: RoomRange[];
  student_distribution?: { student_name: string; room: string; exam_number?: string }[];
  exam_results?: StudentExamResult[];
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
  attendance_status?: 'present' | 'absent' | 'pending';
  admin_notes?: string;
  createdAt?: string;
  observer_type?: ObserverType;
}

export interface AppSettings {
  registration_open: boolean;
  registration_start: string;
  registration_end: string;
  exam_start: string;
  exam_end: string;
  default_required_hours: number;
  app_logo_url?: string;
  reset_password?: string;
  security_code?: string;
  profiles_locked?: boolean;
  trim_hours_duration?: number;
  trim_hours_deadline?: string | null;
  trim_hours_target?: number | null;
  trim_hours_started_at?: string | null;
  trim_hours_processed?: boolean;
  show_public_schedule?: boolean;
  show_public_results?: boolean;
  global_settings_version?: number;
  developer_fb_link?: string;
  distribution_unlock_hours?: number;
}

export interface StudentExamResult {
  student_name: string;
  exam_number: string;
  course_name: string;
  practical_grade: number;
  theory_grade: number;
  final_score: number;
  status: string; // 'ناجح' | 'راسب'
}

export interface GroupNote {
  id: string;
  content: string;
  admin_name: string;
  admin_id: string;
  timestamp: any;
}
