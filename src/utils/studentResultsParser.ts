import { StudentExamResult } from '../types';

/**
 * Parses a student exam results CSV file and returns an array of StudentExamResult.
 * It searches headers dynamically for Arabic keywords or English equivalents.
 */
export function parseCSVToStudentResults(csvContent: string): StudentExamResult[] {
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

  const headers = splitCSVLine(lines[0]);
  
  let nameIdx = -1;
  let examNoIdx = -1;
  let courseIdx = -1;
  let practicalIdx = -1;
  let theoryIdx = -1;
  let finalIdx = -1;
  let statusIdx = -1;

  // Search headers dynamically
  headers.forEach((h, idx) => {
    const cleaned = h.toLowerCase().trim();
    if (cleaned.includes('اسم الطالب') || cleaned.includes('الطالب') || (cleaned.includes('اسم') && !cleaned.includes('مادة') && !cleaned.includes('مقرر')) || cleaned.includes('name') || cleaned.includes('student')) {
      nameIdx = idx;
    } else if (cleaned.includes('امتحاني') || cleaned.includes('رقم امتحاني') || cleaned.includes('رقم المكتتب') || cleaned.includes('رقم') || cleaned.includes('number') || cleaned.includes('exam_no')) {
      examNoIdx = idx;
    } else if (cleaned.includes('مادة') || cleaned.includes('المادة') || cleaned.includes('مقرر') || cleaned.includes('المقرر') || cleaned.includes('course') || cleaned.includes('subject')) {
      courseIdx = idx;
    } else if (cleaned.includes('عملي') || cleaned.includes('العملي') || cleaned.includes('عمل') || cleaned.includes('practical') || cleaned.includes('prac')) {
      practicalIdx = idx;
    } else if (cleaned.includes('نظري') || cleaned.includes('النظري') || cleaned.includes('theory') || cleaned.includes('theo')) {
      theoryIdx = idx;
    } else if (cleaned.includes('محصلة') || cleaned.includes('المحصلة') || cleaned.includes('مجموع') || cleaned.includes('علامة') || cleaned.includes('final') || cleaned.includes('total') || cleaned.includes('score') || cleaned.includes('grade')) {
      finalIdx = idx;
    } else if (cleaned.includes('نتيجة') || cleaned.includes('النتيجة') || cleaned.includes('ناجح') || cleaned.includes('راسب') || cleaned.includes('status') || cleaned.includes('result')) {
      statusIdx = idx;
    }
  });

  // Fallback indices based on column positions if headers weren't matches perfectly
  if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
  if (examNoIdx === -1 && headers.length > 1) examNoIdx = 1;
  if (courseIdx === -1 && headers.length > 2) courseIdx = 2;
  if (practicalIdx === -1 && headers.length > 3) practicalIdx = 3;
  if (theoryIdx === -1 && headers.length > 4) theoryIdx = 4;
  if (finalIdx === -1 && headers.length > 5) finalIdx = 5;
  if (statusIdx === -1 && headers.length > 6) statusIdx = 6;

  const results: StudentExamResult[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length === 0 || !cols[0]) continue;

    const student_name = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx].replace(/['"“”]+/g, '').trim() : '';
    const exam_number = examNoIdx !== -1 && cols[examNoIdx] ? cols[examNoIdx].replace(/['"“”]+/g, '').trim() : '';
    const course_name = courseIdx !== -1 && cols[courseIdx] ? cols[courseIdx].replace(/['"“”]+/g, '').trim() : '';
    
    const practicalVal = practicalIdx !== -1 && cols[practicalIdx] ? cols[practicalIdx].replace(/['"“”]+/g, '').trim() : '0';
    const practical_grade = parseFloat(practicalVal) || 0;

    const theoryVal = theoryIdx !== -1 && cols[theoryIdx] ? cols[theoryIdx].replace(/['"“”]+/g, '').trim() : '0';
    const theory_grade = parseFloat(theoryVal) || 0;

    const finalVal = finalIdx !== -1 && cols[finalIdx] ? cols[finalIdx].replace(/['"“”]+/g, '').trim() : '0';
    const final_score = parseFloat(finalVal) || (practical_grade + theory_grade);

    let status = statusIdx !== -1 && cols[statusIdx] ? cols[statusIdx].replace(/['"“”]+/g, '').trim() : '';
    if (!status) {
      status = final_score >= 50 ? 'ناجح' : 'راسب';
    }

    if (exam_number || student_name) {
      results.push({
        student_name: student_name || 'طالب غير مسمى',
        exam_number: exam_number || 'بدون رقم',
        course_name,
        practical_grade,
        theory_grade,
        final_score,
        status: status === 'pass' || status.includes('ناجح') ? 'ناجح' : 'راسب'
      });
    }
  }

  // Sort alphabetically by student name (Arabic locale aware)
  results.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ar'));

  return results;
}
