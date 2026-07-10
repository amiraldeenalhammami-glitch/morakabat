/**
 * Parses a student room distribution CSV file and returns an array of student-to-room mappings.
 * It supports a 3-column format:
 * - Column 1: الرقم الامتحاني (Exam Number)
 * - Column 2: اسم الطالب (Student Name)
 * - Column 3: القاعة الامتحانية / المكان (Exam Room / Location)
 */
export function parseCSVToStudentDistribution(csvContent: string): { exam_number: string; student_name: string; room: string }[] {
  // Normalize line endings
  const lines = csvContent.replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  // Detect delimiter (comma or semicolon)
  const delimiter = lines[0].includes(';') ? ';' : ',';

  // Helper to split line respecting quotes
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

  const headers = splitCSVLine(lines[0]).map(h => h.replace(/['"“”]+/g, '').trim().toLowerCase());

  let examNumIdx = -1;
  let studentNameIdx = -1;
  let roomIdx = -1;

  // Try to match headers dynamically based on keywords
  for (let idx = 0; idx < headers.length; idx++) {
    const header = headers[idx];
    if (!header) continue;

    // 1. Check Room/Location first to avoid "القاعة الامتحانية" matching "امتحان"
    if (
      header.includes('قاعة') || 
      header.includes('مكان') || 
      header.includes('room') || 
      header.includes('مقر') || 
      header.includes('مراقبة') || 
      header.includes('صف') || 
      header.includes('موقع') ||
      header.includes('المكان')
    ) {
      if (roomIdx === -1) roomIdx = idx;
    }
    // 2. Check Student Name
    else if (
      header.includes('اسم') || 
      header.includes('طالب') || 
      header.includes('name') || 
      header.includes('كامل')
    ) {
      if (studentNameIdx === -1) studentNameIdx = idx;
    }
    // 3. Check Exam Number
    else if (
      header.includes('رقم') || 
      header.includes('امتحان') || 
      header.includes('exam') || 
      header.includes('number') || 
      header.includes('no') || 
      header.includes('id') ||
      header.includes('متسلسل')
    ) {
      if (examNumIdx === -1) examNumIdx = idx;
    }
  }

  // If some indices are still not resolved, resolve them dynamically from remaining unused indices
  const allIndices = Array.from({ length: headers.length }, (_, i) => i);
  const usedIndices = new Set<number>();
  if (roomIdx !== -1) usedIndices.add(roomIdx);
  if (studentNameIdx !== -1) usedIndices.add(studentNameIdx);
  if (examNumIdx !== -1) usedIndices.add(examNumIdx);

  const unusedIndices = allIndices.filter(i => !usedIndices.has(i));

  if (examNumIdx === -1) {
    if (unusedIndices.includes(0)) {
      examNumIdx = 0;
      usedIndices.add(0);
    } else if (unusedIndices.length > 0) {
      examNumIdx = unusedIndices.shift()!;
      usedIndices.add(examNumIdx);
    }
  }

  if (studentNameIdx === -1) {
    if (unusedIndices.includes(1)) {
      studentNameIdx = 1;
      usedIndices.add(1);
    } else if (unusedIndices.length > 0) {
      studentNameIdx = unusedIndices.shift()!;
      usedIndices.add(studentNameIdx);
    }
  }

  if (roomIdx === -1) {
    if (unusedIndices.includes(2)) {
      roomIdx = 2;
      usedIndices.add(2);
    } else if (unusedIndices.length > 0) {
      roomIdx = unusedIndices.shift()!;
      usedIndices.add(roomIdx);
    }
  }

  // Final absolute fallbacks if still unassigned
  if (examNumIdx === -1) examNumIdx = 0;
  if (studentNameIdx === -1) studentNameIdx = headers.length > 1 ? 1 : 0;
  if (roomIdx === -1) roomIdx = headers.length > 2 ? 2 : (headers.length > 1 ? (examNumIdx === 0 && studentNameIdx === 1 ? 2 : 1) : 0);

  const list: { exam_number: string; student_name: string; room: string }[] = [];

  // Start from line 1 to skip the header row
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length === 0) continue;

    const examNumber = cols[examNumIdx] ? cols[examNumIdx].replace(/['"“”]+/g, '').trim() : '';
    const studentName = cols[studentNameIdx] ? cols[studentNameIdx].replace(/['"“”]+/g, '').trim() : '';
    const roomName = cols[roomIdx] ? cols[roomIdx].replace(/['"“”]+/g, '').trim() : 'القاعة العامة';

    if (studentName) {
      list.push({
        exam_number: examNumber,
        student_name: studentName,
        room: roomName
      });
    }
  }

  // Sort alphabetically by student_name (Arabic locale aware)
  list.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ar'));

  return list;
}
