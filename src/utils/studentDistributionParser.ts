/**
 * Parses a student room distribution CSV file and returns an array of student-to-room mappings.
 * It supports both a 2-column format (Student Name, Room) and a 4-column layout
 * (Student Name, Room, Student Name, Room) which is common in Excel exports.
 */
export function parseCSVToStudentDistribution(csvContent: string): { student_name: string; room: string }[] {
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
  const list: { student_name: string; room: string }[] = [];

  // Check if it is a 4-column structure (at least 4 columns)
  const isFourColumns = headers.length >= 4;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length === 0) continue;

    // Pair 1: Column 1 (index 0) and Column 2 (index 1)
    const name1 = cols[0] ? cols[0].replace(/['"“”]+/g, '').trim() : '';
    const room1 = cols[1] ? cols[1].replace(/['"“”]+/g, '').trim() : '';
    if (name1) {
      list.push({
        student_name: name1,
        room: room1 || 'القاعة العامة'
      });
    }

    // Pair 2: Column 3 (index 2) and Column 4 (index 3)
    if (isFourColumns && cols.length >= 4) {
      const name2 = cols[2] ? cols[2].replace(/['"“”]+/g, '').trim() : '';
      const room2 = cols[3] ? cols[3].replace(/['"“”]+/g, '').trim() : '';
      if (name2) {
        list.push({
          student_name: name2,
          room: room2 || 'القاعة العامة'
        });
      }
    }
  }

  // Sort alphabetically by student_name (Arabic locale aware)
  list.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ar'));

  return list;
}
