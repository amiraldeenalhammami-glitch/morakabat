import { ExamSlot } from '../types';

// Helper to parse Arabic year text into number
function parseArabicYear(text: string): number {
  const normalized = text.trim();
  if (normalized.includes('الأولى') || normalized.includes('الاولى') || normalized === '1' || normalized.includes('الأول') || normalized.includes('الاول')) return 1;
  if (normalized.includes('الثانية') || normalized.includes('الثانيه') || normalized === '2' || normalized.includes('الثاني')) return 2;
  if (normalized.includes('الثالثة') || normalized.includes('الثالثه') || normalized === '3' || normalized.includes('الثالث')) return 3;
  if (normalized.includes('الرابعة') || normalized.includes('الرابعه') || normalized === '4' || normalized.includes('الرابع')) return 4;
  if (normalized.includes('الخامسة') || normalized.includes('الخامسه') || normalized === '5' || normalized.includes('الخامس')) return 5;
  
  const num = parseInt(normalized);
  if (!isNaN(num) && num >= 1 && num <= 5) return num;
  return 1; // Default fallback
}

// Helper to format time to HH:MM
function formatTime(timeStr: string): string {
  let cleaned = timeStr.trim().toLowerCase();
  
  // Handle AM/PM
  const isPM = cleaned.includes('pm') || cleaned.includes('م');
  const isAM = cleaned.includes('am') || cleaned.includes('ص');
  
  cleaned = cleaned.replace(/(am|pm|ص|م)/g, '').trim();
  
  const parts = cleaned.split(':');
  if (parts.length === 0 || !parts[0]) return '09:00';
  
  let hours = parseInt(parts[0]);
  let minutes = parts[1] ? parseInt(parts[1]) : 0;
  
  if (isNaN(hours)) hours = 9;
  if (isNaN(minutes)) minutes = 0;
  
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  
  return `${formattedHours}:${formattedMinutes}`;
}

// Helper to calculate end time (2 hours after start_time)
function calculateEndTime(startTimeStr: string): string {
  const parts = startTimeStr.split(':');
  let hours = parseInt(parts[0]) || 9;
  let minutes = parseInt(parts[1]) || 0;
  
  hours = (hours + 2) % 24;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Helper to format date to YYYY-MM-DD
function formatDate(dateStr: string): string {
  let cleaned = dateStr.trim();
  // Replace slashes with dashes
  cleaned = cleaned.replace(/\//g, '-');
  
  // Check if already in YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (regex.test(cleaned)) return cleaned;
  
  // Try to parse parts
  const parts = cleaned.split('-');
  if (parts.length === 3) {
    let year = parts[0];
    let month = parts[1];
    let day = parts[2];
    
    // Check if day and year are swapped
    if (year.length <= 2 && day.length === 4) {
      const temp = year;
      year = day;
      day = temp;
    }
    
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return cleaned; // Return as-is if parsing fails
}

export interface ParsedSlotInput {
  course_name: string;
  academic_year: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  session_type: 'morning' | 'evening';
  duration_hours: number;
}

// Helper to parse duration text into number of hours
function parseDuration(text: string): number {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return 2; // Default to 2 hours
  
  if (normalized.includes('ساعتين') || normalized.includes('ساعتان') || normalized === '2' || normalized.includes('ساعتان')) return 2;
  if (normalized.includes('ساعة') || normalized.includes('ساعه') || normalized === '1' || normalized.includes('ساعة واحدة') || normalized.includes('ساعه واحده')) return 1;
  if (normalized.includes('ثلاث') || normalized.includes('3') || normalized.includes('ثلاثة') || normalized.includes('ثلاثه')) return 3;
  if (normalized.includes('اربع') || normalized.includes('أربع') || normalized.includes('4') || normalized.includes('أربعة') || normalized.includes('اربعه')) return 4;
  if (normalized.includes('خمس') || normalized.includes('5') || normalized.includes('خمسة') || normalized.includes('خمسه')) return 5;
  
  // Extract digits
  const clean = normalized.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const match = clean.match(/\d+(\.\d+)?/);
  if (match) {
    const val = parseFloat(match[0]);
    if (!isNaN(val) && val > 0 && val <= 24) return val;
  }
  
  return 2; // Fallback
}

// Helper to calculate end time based on start time and duration
function calculateEndTimeWithDuration(startTimeStr: string, duration: number): string {
  const parts = startTimeStr.split(':');
  let hours = parseInt(parts[0]) || 9;
  let minutes = parseInt(parts[1]) || 0;
  
  const totalMinutes = hours * 60 + minutes + Math.round(duration * 60);
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

export function parseCSVToSlots(csvContent: string): ParsedSlotInput[] {
  // Support both commas and semicolons as delimiters, and replace \r
  const lines = csvContent.replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  // Parse first line (header) to map columns
  // Super robust regex to parse CSV line preserving quoted values
  const splitCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    const delimiter = line.includes(';') ? ';' : ',';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCSVLine(lines[0]);
  
  // Find column indices based on header names
  let courseIdx = -1;
  let yearIdx = -1;
  let dateIdx = -1;
  let timeIdx = -1;
  let durationIdx = -1;

  headers.forEach((h, idx) => {
    const normalized = h.toLowerCase();
    if (normalized.includes('اسم المادة') || normalized.includes('المادة') || normalized.includes('اسم ماده') || normalized.includes('الماده') || normalized.includes('course')) {
      courseIdx = idx;
    } else if (normalized.includes('السنة الدراسية') || normalized.includes('السنة') || normalized.includes('السنه') || normalized.includes('academic') || normalized.includes('year')) {
      yearIdx = idx;
    } else if (normalized.includes('تاريخ المادة') || normalized.includes('تاريخ') || normalized.includes('date')) {
      dateIdx = idx;
    } else if (normalized.includes('وقت البدء') || normalized.includes('وقت المباشرة') || normalized.includes('البدء') || normalized.includes('الوقت') || normalized.includes('time') || normalized.includes('start')) {
      timeIdx = idx;
    } else if (normalized.includes('مدة الامتحان') || normalized.includes('المدة') || normalized.includes('مدة') || normalized.includes('مده') || normalized.includes('duration') || normalized.includes('ساعات')) {
      durationIdx = idx;
    }
  });

  // Fallbacks if headers are not matched exactly, try positional matching
  if (courseIdx === -1) courseIdx = 0;
  if (yearIdx === -1) yearIdx = 1 < headers.length ? 1 : -1;
  if (dateIdx === -1) dateIdx = 2 < headers.length ? 2 : -1;
  if (timeIdx === -1) timeIdx = 3 < headers.length ? 3 : -1;
  if (durationIdx === -1) durationIdx = 4 < headers.length ? 4 : -1;

  const results: ParsedSlotInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length === 0 || !cols[0]) continue;

    const course_name = courseIdx !== -1 && cols[courseIdx] ? cols[courseIdx] : '';
    if (!course_name) continue; // Skip lines without course name

    const yearText = yearIdx !== -1 && cols[yearIdx] ? cols[yearIdx] : '1';
    const academic_year = parseArabicYear(yearText);

    const dateText = dateIdx !== -1 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().split('T')[0];
    const exam_date = formatDate(dateText);

    const timeText = timeIdx !== -1 && cols[timeIdx] ? cols[timeIdx] : '09:00';
    const start_time = formatTime(timeText);
    
    const durationText = durationIdx !== -1 && cols[durationIdx] ? cols[durationIdx] : '2';
    const duration_hours = parseDuration(durationText);
    
    const end_time = calculateEndTimeWithDuration(start_time, duration_hours);

    // If start_time is before 12:00, morning, else evening
    const startHour = parseInt(start_time.split(':')[0]) || 9;
    const session_type: 'morning' | 'evening' = startHour < 12 ? 'morning' : 'evening';

    results.push({
      course_name,
      academic_year,
      exam_date,
      start_time,
      end_time,
      session_type,
      duration_hours
    });
  }

  return results;
}
