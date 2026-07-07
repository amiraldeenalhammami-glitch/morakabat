import { ExamSlot } from '../types';

// Helper to convert Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to Western Arabic numerals (0123456789)
export function convertArabicNumerals(str: string): string {
  return str.replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// Clean and normalize Arabic text for robust comparisons
export function cleanArabicText(text: string): string {
  return text
    .replace(/^\uFEFF/, '') // Remove BOM
    .trim()
    .replace(/['"“”]+/g, '') // Remove quotes
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .replace(/[أإآ]/g, 'ا') // Normalize Alif variants to plain Alif
    .replace(/ة/g, 'ه') // Normalize Tehmorboota to Heh
    .replace(/ى/g, 'ي') // Normalize Alef Maksoura to Yeh
    .toLowerCase();
}

// Helper to parse Arabic year text into number
function parseArabicYear(text: string): number {
  const converted = convertArabicNumerals(text.trim());
  const normalized = cleanArabicText(converted);
  
  if (normalized.includes('الاولي') || normalized.includes('الاول') || normalized === '1') return 1;
  if (normalized.includes('الثانيه') || normalized.includes('الثاني') || normalized === '2') return 2;
  if (normalized.includes('الثالثه') || normalized.includes('الثالث') || normalized === '3') return 3;
  if (normalized.includes('الرابعه') || normalized.includes('الرابع') || normalized === '4') return 4;
  if (normalized.includes('الخامسه') || normalized.includes('الخامس') || normalized === '5') return 5;
  
  const num = parseInt(normalized);
  if (!isNaN(num) && num >= 1 && num <= 5) return num;
  return 1; // Default fallback
}

// Helper to format time to HH:MM
function formatTime(timeStr: string): string {
  const converted = convertArabicNumerals(timeStr.trim().toLowerCase());
  let cleaned = converted;
  
  // Handle AM/PM and Arabic equivalents (ص/م)
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

// Helper to format date to YYYY-MM-DD
function formatDate(dateStr: string): string {
  let cleaned = convertArabicNumerals(dateStr.trim());
  // Replace slashes or spaces with dashes
  cleaned = cleaned.replace(/[\/\s]/g, '-');
  
  // Check if already in YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (regex.test(cleaned)) return cleaned;
  
  const parts = cleaned.split('-').map(p => p.trim());
  if (parts.length === 3) {
    let part1 = parts[0];
    let part2 = parts[1];
    let part3 = parts[2];
    
    // Check if it is DD-MM-YYYY
    if (part3.length === 4 && part1.length <= 2) {
      return `${part3}-${part2.padStart(2, '0')}-${part1.padStart(2, '0')}`;
    }
    // Check if it is YYYY-MM-DD
    if (part1.length === 4 && part3.length <= 2) {
      return `${part1}-${part2.padStart(2, '0')}-${part3.padStart(2, '0')}`;
    }
  }
  
  // Try fallback JavaScript parsing
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (e) {}

  return cleaned; // Return original cleaned value as-is if parsing fails
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
  const converted = convertArabicNumerals(text.trim().toLowerCase());
  const normalized = cleanArabicText(converted);
  if (!normalized) return 2; // Default to 2 hours
  
  if (normalized.includes('ساعتين') || normalized.includes('ساعتان') || normalized === '2') return 2;
  if (normalized.includes('ساعه واحده') || normalized.includes('ساعة واحدة') || normalized.includes('ساعه') || normalized.includes('ساعة') || normalized === '1') return 1;
  if (normalized.includes('ثلاث') || normalized === '3') return 3;
  if (normalized.includes('اربع') || normalized === '4') return 4;
  if (normalized.includes('خمس') || normalized === '5') return 5;
  
  // Extract digits
  const match = normalized.match(/\d+(\.\d+)?/);
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

// Content-based detector to identify column indices dynamically from data rows (acts as a backup/validation)
function detectColumnIndicesByContent(lines: string[], delimiter: string): {
  courseIdx: number;
  yearIdx: number;
  dateIdx: number;
  timeIdx: number;
  durationIdx: number;
} {
  const numLinesToAnalyze = Math.min(lines.length, 10);
  if (numLinesToAnalyze <= 1) {
    return { courseIdx: 0, yearIdx: 1, dateIdx: 2, timeIdx: 3, durationIdx: 4 };
  }

  // Split lines using double quotes aware splitter
  const splitCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
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

  let maxCols = 0;
  const parsedRows: string[][] = [];
  for (let i = 1; i < numLinesToAnalyze; i++) {
    const cols = splitCSVLine(lines[i]);
    parsedRows.push(cols);
    if (cols.length > maxCols) maxCols = cols.length;
  }

  const scores = Array.from({ length: maxCols }, () => ({
    date: 0,
    year: 0,
    time: 0,
    duration: 0,
    text: 0
  }));

  parsedRows.forEach((cols) => {
    cols.forEach((cell, idx) => {
      const val = cell.trim();
      if (!val) return;

      const converted = convertArabicNumerals(val);
      const cleaned = cleanArabicText(val);

      // 1. Check for date patterns
      const isDate = /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(converted) || /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(converted);
      if (isDate) {
        scores[idx].date += 15;
        return;
      }

      // 2. Check for academic year
      const isYearWord = cleaned.includes('الاولي') || cleaned.includes('الاول') || cleaned.includes('الثانيه') || cleaned.includes('الثاني') || cleaned.includes('الثالثه') || cleaned.includes('الثالث') || cleaned.includes('الرابعه') || cleaned.includes('الرابع') || cleaned.includes('الخامسه') || cleaned.includes('الخامس') || cleaned.includes('صف') || cleaned.includes('مستوي');
      const isYearNum = /^[1-5]$/.test(converted);
      if (isYearWord) {
        scores[idx].year += 15;
      } else if (isYearNum) {
        scores[idx].year += 4;
      }

      // 3. Check for exam duration indicators
      const isDurationWord = cleaned.includes('ساعه') || cleaned.includes('ساعة') || cleaned.includes('ساعتين') || cleaned.includes('ساعتان') || cleaned.includes('ساعات');
      if (isDurationWord) {
        scores[idx].duration += 15;
      }

      // 4. Distinction between start hours (usually >= 8 and <= 18) and duration (usually <= 5)
      const parsedNum = parseInt(converted);
      if (!isNaN(parsedNum)) {
        if (parsedNum >= 8 && parsedNum <= 20) {
          scores[idx].time += 8;
        } else if (parsedNum > 0 && parsedNum <= 5) {
          scores[idx].duration += 5;
        }
      } else if (converted.includes(':')) {
        scores[idx].time += 15;
      }

      // 5. Course name (long text containing Arabic characters, non-numeric, not a short year/duration)
      if (isNaN(parsedNum) && !isDate && !isYearWord && !isDurationWord && val.length > 2) {
        scores[idx].text += 10;
      }
    });
  });

  let dateIdx = -1;
  let yearIdx = -1;
  let timeIdx = -1;
  let durationIdx = -1;
  let courseIdx = -1;

  // Resolve indices using priority
  // Date is the most unique
  let maxDateScore = 0;
  for (let idx = 0; idx < maxCols; idx++) {
    if (scores[idx].date > maxDateScore) {
      maxDateScore = scores[idx].date;
      dateIdx = idx;
    }
  }

  // Year is highly distinct
  let maxYearScore = 0;
  for (let idx = 0; idx < maxCols; idx++) {
    if (idx === dateIdx) continue;
    if (scores[idx].year > maxYearScore) {
      maxYearScore = scores[idx].year;
      yearIdx = idx;
    }
  }

  // Duration
  let maxDurationScore = 0;
  for (let idx = 0; idx < maxCols; idx++) {
    if (idx === dateIdx || idx === yearIdx) continue;
    if (scores[idx].duration > maxDurationScore) {
      maxDurationScore = scores[idx].duration;
      durationIdx = idx;
    }
  }

  // Start Time
  let maxTimeScore = 0;
  for (let idx = 0; idx < maxCols; idx++) {
    if (idx === dateIdx || idx === yearIdx || idx === durationIdx) continue;
    if (scores[idx].time > maxTimeScore) {
      maxTimeScore = scores[idx].time;
      timeIdx = idx;
    }
  }

  // Course Name
  let maxTextScore = 0;
  for (let idx = 0; idx < maxCols; idx++) {
    if (idx === dateIdx || idx === yearIdx || idx === durationIdx || idx === timeIdx) continue;
    if (scores[idx].text > maxTextScore) {
      maxTextScore = scores[idx].text;
      courseIdx = idx;
    }
  }

  // Fill in any gaps from remaining columns
  const assigned = [courseIdx, yearIdx, dateIdx, timeIdx, durationIdx];
  const getUnassigned = () => {
    for (let i = 0; i < maxCols; i++) {
      if (!assigned.includes(i)) return i;
    }
    return -1;
  };

  if (courseIdx === -1) { courseIdx = getUnassigned(); assigned[0] = courseIdx; }
  if (yearIdx === -1) { yearIdx = getUnassigned(); assigned[1] = yearIdx; }
  if (dateIdx === -1) { dateIdx = getUnassigned(); assigned[2] = dateIdx; }
  if (timeIdx === -1) { timeIdx = getUnassigned(); assigned[3] = timeIdx; }
  if (durationIdx === -1) { durationIdx = getUnassigned(); assigned[4] = durationIdx; }

  // Absolute default fallbacks if still unassigned
  if (courseIdx === -1) courseIdx = 0;
  if (yearIdx === -1) yearIdx = 1;
  if (dateIdx === -1) dateIdx = 2;
  if (timeIdx === -1) timeIdx = 3;
  if (durationIdx === -1) durationIdx = 4;

  return { courseIdx, yearIdx, dateIdx, timeIdx, durationIdx };
}

export function parseCSVToSlots(csvContent: string): ParsedSlotInput[] {
  const lines = csvContent.replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  // Determine delimiter
  const delimiter = lines[0].includes(';') ? ';' : ',';

  // Parser to split CSV lines, honoring double quotes
  const splitCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
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
  
  // 1. Attempt Header-based Mapping
  let courseIdx = -1;
  let yearIdx = -1;
  let dateIdx = -1;
  let timeIdx = -1;
  let durationIdx = -1;

  headers.forEach((h, idx) => {
    const cleaned = cleanArabicText(h);
    
    // 1. Check for Date first, to prevent "تاريخ المادة" matching "المادة" / "اسم المادة"
    if (
      cleaned.includes('تاريخ') || 
      cleaned.includes('التاريخ') || 
      cleaned.includes('date')
    ) {
      dateIdx = idx;
    } 
    // 2. Check for Time / Start Time
    else if (
      cleaned.includes('وقت البدء') || 
      cleaned.includes('وقت المباشره') || 
      cleaned.includes('البدء') || 
      cleaned.includes('المباشره') || 
      cleaned.includes('المباشرة') || 
      cleaned.includes('الوقت') || 
      cleaned.includes('ساعه البدء') || 
      cleaned.includes('ساعة البدء') || 
      cleaned.includes('time') || 
      cleaned.includes('start')
    ) {
      timeIdx = idx;
    } 
    // 3. Check for Duration
    else if (
      cleaned.includes('مده الامتحان') || 
      cleaned.includes('مدة الامتحان') || 
      cleaned.includes('المده') || 
      cleaned.includes('المدة') || 
      cleaned.includes('مده') || 
      cleaned.includes('مدة') || 
      cleaned.includes('duration') || 
      cleaned.includes('ساعات') || 
      cleaned.includes('ساعات الامتحان')
    ) {
      durationIdx = idx;
    } 
    // 4. Check for Academic Year
    else if (
      cleaned.includes('السنه الدراسيه') || 
      cleaned.includes('السنة الدراسية') || 
      cleaned.includes('السنه') || 
      cleaned.includes('السنة') || 
      cleaned.includes('academic') || 
      cleaned.includes('year') || 
      cleaned.includes('صف') || 
      cleaned.includes('مستوي') || 
      cleaned.includes('المستوى')
    ) {
      yearIdx = idx;
    } 
    // 5. Finally, check for Course Name (now safe from matching "تاريخ المادة")
    else if (
      cleaned.includes('اسم الماده') || 
      cleaned.includes('اسم المادة') || 
      cleaned.includes('الماده') || 
      cleaned.includes('المادة') || 
      cleaned.includes('course') || 
      cleaned.includes('subject')
    ) {
      courseIdx = idx;
    }
  });

  // 2. If any of the index mappings failed, trigger Content-based fallback auto-detection
  if (courseIdx === -1 || yearIdx === -1 || dateIdx === -1 || timeIdx === -1 || durationIdx === -1) {
    console.log('Some headers were not matched exactly. Utilizing smart content-based auto-detection...');
    const detected = detectColumnIndicesByContent(lines, delimiter);
    if (courseIdx === -1) courseIdx = detected.courseIdx;
    if (yearIdx === -1) yearIdx = detected.yearIdx;
    if (dateIdx === -1) dateIdx = detected.dateIdx;
    if (timeIdx === -1) timeIdx = detected.timeIdx;
    if (durationIdx === -1) durationIdx = detected.durationIdx;
  }

  const results: ParsedSlotInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length === 0 || !cols[0]) continue;

    const course_name = courseIdx !== -1 && cols[courseIdx] ? cols[courseIdx].replace(/['"“”]+/g, '').trim() : '';
    if (!course_name) continue; // Skip lines without a valid course name

    const yearText = yearIdx !== -1 && cols[yearIdx] ? cols[yearIdx] : '1';
    const academic_year = parseArabicYear(yearText);

    const dateText = dateIdx !== -1 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().split('T')[0];
    const exam_date = formatDate(dateText);

    const timeText = timeIdx !== -1 && cols[timeIdx] ? cols[timeIdx] : '09:00';
    const start_time = formatTime(timeText);
    
    const durationText = durationIdx !== -1 && cols[durationIdx] ? cols[durationIdx] : '2';
    const duration_hours = parseDuration(durationText);
    
    const end_time = calculateEndTimeWithDuration(start_time, duration_hours);

    // Morning session if starting before 12:00, otherwise evening
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
