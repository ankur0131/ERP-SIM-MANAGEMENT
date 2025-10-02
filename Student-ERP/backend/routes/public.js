const express = require('express');
const { readSheetData, appendToSheet, updateSheetData, SHEET_NAMES, getAllSheets } = require('../goggle_apis/sheets');

const router = express.Router();

// Helper: safe length (minus header when present)
function countRows(rows) {
  if (!rows || rows.length === 0) return 0;
  // Assume first row is header when it contains strings
  return rows.length > 0 ? Math.max(0, rows.length - 1) : 0;
}

// GET /public/metrics
// Returns basic counts for dashboard visuals
// List all sheets in the spreadsheet
router.get('/sheets', async (req, res) => {
  try {
    const sheets = await getAllSheets();
    res.json({ success: true, sheets });
  } catch (err) {
    console.error('Error listing sheets:', err);
    res.status(500).json({ success: false, message: 'Error listing sheets', error: err.message });
  }
});

// Preview the first few rows of the Students sheet
router.get('/preview/students', async (req, res) => {
  try {
    const data = await readSheetData('Students', 'A1:Z5'); // First 5 rows, columns A-Z
    res.json({ success: true, headers: data[0], data: data.slice(1) });
  } catch (err) {
    console.error('Error previewing Students sheet:', err);
    res.status(500).json({ success: false, message: 'Error previewing Students sheet', error: err.message });
  }
});

router.get('/metrics', async (req, res) => {
  try {
    const [students, faculty, courses] = await Promise.all([
      readSheetData(SHEET_NAMES.USERS || 'Students'),
      readSheetData(SHEET_NAMES.FACULTY || 'Faculty'),
      readSheetData(SHEET_NAMES.COURSES || 'Courses'),
    ]);

    const data = {
      totalStudents: countRows(students),
      totalFaculty: countRows(faculty),
      coursesCount: countRows(courses),
    };

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error computing metrics:', err);
    res.status(500).json({ success: false, message: 'Error computing metrics', error: err.message });
  }
});

// Helper to convert column index (0-based) to A1 notation letter(s)
function columnIndexToLetter(index) {
  let dividend = index + 1;
  let columnName = '';
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
}

// POST /public/students
// Body: { name?, firstName?, lastName?, email, course?, status? }
router.post('/students', async (req, res) => {
  try {
    const sheetName = SHEET_NAMES.USERS || 'Students';
    const rows = await readSheetData(sheetName);
    const headers = (rows && rows[0]) ? rows[0].map(h => (h || '').toString()) : [];
    const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
    const find = (...names) => {
      for (const n of names) {
        const k = n.toLowerCase();
        if (hmap[k] !== undefined) return hmap[k];
      }
      return -1;
    };

    const email = (req.body.email || '').toString().trim();
    if (!email) return res.status(400).json({ success: false, message: 'email is required' });

    // Build row with same width as headers (or default to 6 cols)
    const width = Math.max(headers.length, 6);
    const row = new Array(width).fill('');

    const nameIdx = find('name','student name','full name');
    const firstIdx = find('first name','firstname','first');
    const lastIdx = find('last name','lastname','last');
    const emailIdx = find('email','student','student email','studentid','student_id');
    const courseIdx = find('course','courseid','course_id','subject');
    const statusIdx = find('status');

    const name = (req.body.name || '').toString().trim();
    const first = (req.body.firstName || '').toString().trim();
    const last = (req.body.lastName || '').toString().trim();
    const course = (req.body.course || '').toString().trim();
    const status = (req.body.status || 'Active').toString().trim();

    if (nameIdx >= 0 && name) row[nameIdx] = name;
    if (firstIdx >= 0 && first) row[firstIdx] = first;
    if (lastIdx >= 0 && last) row[lastIdx] = last;
    if (emailIdx >= 0) row[emailIdx] = email; else row[0] = email;
    if (courseIdx >= 0 && course) row[courseIdx] = course;
    if (statusIdx >= 0 && status) row[statusIdx] = status;

    const result = await appendToSheet(sheetName, row);
    res.status(201).json({ success: true, message: 'Student created', data: { name, firstName: first, lastName: last, email, course, status }, sheetResult: result.data || result });
  } catch (err) {
    console.error('Error creating student:', err);
    res.status(500).json({ success: false, message: 'Error creating student', error: err.message });
  }
});

// PUT /public/students
// Body: { email, name?, firstName?, lastName?, course?, status? }
router.put('/students', async (req, res) => {
  try {
    const sheetName = SHEET_NAMES.USERS || 'Students';
    const rows = await readSheetData(sheetName);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'No sheet data' });
    const headers = rows[0].map(h => (h || '').toString());
    const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
    const find = (...names) => {
      for (const n of names) {
        const k = n.toLowerCase();
        if (hmap[k] !== undefined) return hmap[k];
      }
      return -1;
    };

    const emailIdx = find('email','student','student email','studentid','student_id');
    if (emailIdx < 0) return res.status(400).json({ success: false, message: 'Email column not found in sheet' });
    const targetEmail = (req.body.email || '').toString().trim().toLowerCase();
    if (!targetEmail) return res.status(400).json({ success: false, message: 'email is required' });

    let rowIndex = -1; // 0-based index in rows array
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const em = (r[emailIdx] || '').toString().trim().toLowerCase();
      if (em && em === targetEmail) { rowIndex = i; break; }
    }
    if (rowIndex < 0) return res.status(404).json({ success: false, message: 'Student not found' });

    // Build updated row by copying existing row
    const existing = rows[rowIndex].slice();
    const nameIdx = find('name','student name','full name');
    const firstIdx = find('first name','firstname','first');
    const lastIdx = find('last name','lastname','last');
    const courseIdx = find('course','courseid','course_id','subject');
    const statusIdx = find('status');

    const updates = req.body || {};
    if (nameIdx >= 0 && updates.name !== undefined) existing[nameIdx] = (updates.name || '').toString();
    if (firstIdx >= 0 && updates.firstName !== undefined) existing[firstIdx] = (updates.firstName || '').toString();
    if (lastIdx >= 0 && updates.lastName !== undefined) existing[lastIdx] = (updates.lastName || '').toString();
    if (courseIdx >= 0 && updates.course !== undefined) existing[courseIdx] = (updates.course || '').toString();
    if (statusIdx >= 0 && updates.status !== undefined) existing[statusIdx] = (updates.status || '').toString();

    // Write back full row length of headers
    const lastColLetter = columnIndexToLetter(Math.max(headers.length, existing.length) - 1);
    const range = `A${rowIndex + 1}:${lastColLetter}${rowIndex + 1}`;
    const padded = new Array(Math.max(headers.length, existing.length)).fill('');
    for (let i = 0; i < existing.length; i++) padded[i] = existing[i];

    const result = await updateSheetData(sheetName, range, [padded]);
    res.json({ success: true, message: 'Student updated', data: { email: targetEmail, ...updates }, sheetResult: result.data || result });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ success: false, message: 'Error updating student', error: err.message });
  }
});
 

// POST /public/messages
// Appends a message row into Helpdesk_tickets
// Body: { student: string, sender: string, content: string, timestamp?: string, status?: string }
router.post('/messages', async (req, res) => {
  try {
    const { student, sender, content, timestamp, status } = req.body || {};
    if (!student || !content) {
      return res.status(400).json({ success: false, message: 'student and content are required' });
    }
    const ticketId = `T${Date.now()}`;
    const time = timestamp || new Date().toISOString();
    const row = [ticketId, student, sender || 'Student', content, time, status || 'Open'];
    const result = await appendToSheet('Helpdesk_tickets', row);
    return res.status(201).json({ success: true, message: 'Message sent', data: { id: ticketId, student, sender, content, timestamp: time, status: status || 'Open' }, sheetResult: result });
  } catch (err) {
    console.error('Error posting message:', err);
    return res.status(500).json({ success: false, message: 'Error posting message', error: err.message });
  }
});

// GET /public/students
// Returns a basic list of students with name, email, course, status (flexible header mapping)
// Optional: ?limit=5
router.get('/students', async (req, res) => {
  try {
    const rows = await readSheetData(SHEET_NAMES.USERS || 'Students');
    const out = [];
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };

      const nameIdx = find('name','student name','full name');
      const firstIdx = find('first name','firstname','first');
      const lastIdx = find('last name','lastname','last');
      const emailIdx = find('email','student','student email','studentid','student_id');
      const courseIdx = find('course','courseid','course_id','subject');
      const statusIdx = find('status');

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        // Compose name from best available sources
        let name = '';
        if (nameIdx >= 0) name = (r[nameIdx] || '').toString();
        if (!name && (firstIdx >= 0 || lastIdx >= 0)) {
          const first = firstIdx >= 0 ? (r[firstIdx] || '').toString() : '';
          const last = lastIdx >= 0 ? (r[lastIdx] || '').toString() : '';
          name = `${first} ${last}`.trim();
        }
        if (!name && emailIdx >= 0) {
          const em = (r[emailIdx] || '').toString();
          const base = em.split('@')[0] || '';
          name = base.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        out.push({
          name,
          email: emailIdx >= 0 ? (r[emailIdx] || '').toString() : '',
          course: courseIdx >= 0 ? (r[courseIdx] || '').toString() : '',
          status: statusIdx >= 0 ? (r[statusIdx] || '').toString() : '',
        });
      }
    }

    // Legacy limit support
    const limit = Math.max(0, parseInt(req.query.limit || '0', 10) || 0);

    // Pagination support: ?page=&pageSize=
    const pageSize = Math.max(0, parseInt(req.query.pageSize || '0', 10) || 0);
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);

    let data = out;
    if (pageSize > 0) {
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      data = out.slice(start, end);
    } else if (limit > 0) {
      data = out.slice(0, limit);
    }

    res.json({ success: true, data, count: data.length, total: out.length, page: pageSize > 0 ? page : undefined, pageSize: pageSize || undefined });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, message: 'Error fetching students', error: err.message });
  }
});

// GET /public/messages
// Returns messages for a student from Helpdesk_tickets (optional filter ?student=), newest first
router.get('/messages', async (req, res) => {
  try {
    const rows = await readSheetData('Helpdesk_tickets');
    const studentQ = (req.query.student || '').toString().trim().toLowerCase();

    const out = [];
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };

      const idIdx = find('ticketid','ticket_id','id');
      const studentIdx = find('studentid','student_id','student','email');
      const senderIdx = find('sender','from','agent');
      const contentIdx = find('message','content','description');
      const timeIdx = find('timestamp','time','date');
      const statusIdx = find('status');

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const student = studentIdx >= 0 ? (r[studentIdx] || '').toString() : '';
        if (studentQ && student.toLowerCase() !== studentQ) continue;
        out.push({
          id: idIdx >= 0 ? (r[idIdx] || `${i}`) : `${i}`,
          student,
          sender: senderIdx >= 0 ? (r[senderIdx] || '').toString() : 'System',
          content: contentIdx >= 0 ? (r[contentIdx] || '').toString() : '',
          timestamp: timeIdx >= 0 ? (r[timeIdx] || '').toString() : '',
          status: statusIdx >= 0 ? (r[statusIdx] || '').toString() : '',
        });
      }
    }

    // sort newest first by timestamp string if comparable
    out.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || '') * -1);
    res.json({ success: true, data: out });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ success: false, message: 'Error fetching messages', error: err.message });
  }
});

// GET /public/exams
// Returns exams/schedule/results for a student (optional ?student=) using flexible header mapping
router.get('/exams', async (req, res) => {
  try {
    const rows = await readSheetData('Exams');
    const studentQ = (req.query.student || '').toString().trim().toLowerCase();

    const out = [];
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };

      const idIdx = find('examid','exam_id','id');
      const studentIdx = find('studentid','student_id','student','email');
      const nameIdx = find('name','exam','exam name','title');
      const dateIdx = find('date','exam date');
      const typeIdx = find('type');
      const statusIdx = find('status','result');

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const rec = {
          id: idIdx >= 0 ? (r[idIdx] || `${i}`) : `${i}`,
          student: studentIdx >= 0 ? (r[studentIdx] || '').toString() : '',
          name: nameIdx >= 0 ? (r[nameIdx] || '').toString() : '',
          date: dateIdx >= 0 ? (r[dateIdx] || '').toString() : '',
          type: typeIdx >= 0 ? (r[typeIdx] || '').toString() : '',
          status: statusIdx >= 0 ? (r[statusIdx] || '').toString() : '',
        };
        if (studentQ && rec.student && rec.student.toLowerCase() !== studentQ) continue;
        out.push(rec);
      }
    }

    res.json({ success: true, data: out, count: out.length });
  } catch (err) {
    console.error('Error fetching exams:', err);
    res.status(500).json({ success: false, message: 'Error fetching exams', error: err.message });
  }
});

// GET /public/finance-summary
// Returns simple fee summary per student from Finance_records (Total, Paid, Pending)
router.get('/finance-summary', async (req, res) => {
  try {
    const rows = await readSheetData('Finance_records');
    const studentQ = (req.query.student || '').toString().trim().toLowerCase();
    let summary = { total: 0, paid: 0, pending: 0, currency: '₹' };

    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };
      const studentIdx = find('studentid','student_id','student','email');
      const totalIdx = find('total','total fees','total_fee','amount');
      const paidIdx = find('paid','paid amount');
      const pendingIdx = find('pending','pending amount','due');
      const currencyIdx = find('currency');

      // Aggregate rows for this student (or overall if not provided)
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const student = studentIdx >= 0 ? (r[studentIdx] || '').toString().toLowerCase() : '';
        if (studentQ && student !== studentQ) continue;
        const total = totalIdx >= 0 ? parseFloat(r[totalIdx] || '0') : 0;
        const paid = paidIdx >= 0 ? parseFloat(r[paidIdx] || '0') : 0;
        const pending = pendingIdx >= 0 ? parseFloat(r[pendingIdx] || '0') : Math.max(0, total - paid);
        const currency = currencyIdx >= 0 ? (r[currencyIdx] || '₹').toString() : '₹';
        summary.total += isNaN(total) ? 0 : total;
        summary.paid += isNaN(paid) ? 0 : paid;
        summary.pending += isNaN(pending) ? 0 : pending;
        summary.currency = currency || summary.currency;
      }
    }

    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('Error fetching finance summary:', err);
    res.status(500).json({ success: false, message: 'Error fetching finance summary', error: err.message });
  }
});

// GET /public/library-issues
// Returns library issues for a student (optional filter ?student=) using flexible header mapping
router.get('/library-issues', async (req, res) => {
  try {
    const rows = await readSheetData('Library_issues');
    const studentQ = (req.query.student || '').toString().trim().toLowerCase();

    const out = [];
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };

      const issueIdx = find('issueid','issue_id','id');
      const studentIdx = find('studentid','student_id','student','email');
      const bookIdx = find('bookid','book_id','book','title');
      const issueDateIdx = find('issuedate','issue_date','date');
      const dueDateIdx = find('duedate','due_date');
      const returnDateIdx = find('returndate','return_date');
      const statusIdx = find('status');

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const rec = {
          issueId: issueIdx >= 0 ? (r[issueIdx] || '').toString() : `${i}`,
          student: studentIdx >= 0 ? (r[studentIdx] || '').toString() : '',
          book: bookIdx >= 0 ? (r[bookIdx] || '').toString() : '',
          issueDate: issueDateIdx >= 0 ? (r[issueDateIdx] || '').toString() : '',
          dueDate: dueDateIdx >= 0 ? (r[dueDateIdx] || '').toString() : '',
          returnDate: returnDateIdx >= 0 ? (r[returnDateIdx] || '').toString() : '',
          status: statusIdx >= 0 ? (r[statusIdx] || '').toString() : '',
        };
        if (studentQ && rec.student && rec.student.toLowerCase() !== studentQ) continue;
        out.push(rec);
      }
    }

    res.json({ success: true, data: out, count: out.length });
  } catch (err) {
    console.error('Error fetching library issues:', err);
    res.status(500).json({ success: false, message: 'Error fetching library issues', error: err.message });
  }
});

// GET /public/grades
// Returns grades for a student using flexible header mapping. Optional filter: ?student=&semester=&courseId=
router.get('/grades', async (req, res) => {
  try {
    const rows = await readSheetData(SHEET_NAMES.GRADES || 'Grades');
    const studentQ = (req.query.student || '').toString().trim().toLowerCase();
    const semQ = (req.query.semester || '').toString().trim();
    const courseQ = (req.query.courseId || '').toString().trim();

    const out = [];
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };
      const studentIdx = find('studentid','student_id','student','email','student email');
      const courseIdx = find('courseid','course_id','course');
      const semIdx = find('semester','term');
      const gradeIdx = find('grade');
      const pointsIdx = find('points','grade points');
      const dateIdx = find('gradedate','grade date','date');

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const student = studentIdx >= 0 ? (r[studentIdx] || '').toString() : '';
        const courseId = courseIdx >= 0 ? (r[courseIdx] || '').toString() : '';
        const semester = semIdx >= 0 ? (r[semIdx] || '').toString() : '';
        const grade = gradeIdx >= 0 ? (r[gradeIdx] || '').toString() : '';
        const points = pointsIdx >= 0 ? parseFloat(r[pointsIdx] || '0') : 0;
        const date = dateIdx >= 0 ? (r[dateIdx] || '').toString() : '';

        if (studentQ && student.toLowerCase() !== studentQ) continue;
        if (semQ && semester !== semQ) continue;
        if (courseQ && courseId !== courseQ) continue;

        out.push({ student, courseId, semester, grade, points, date });
      }
    }

    res.json({ success: true, data: out, count: out.length });
  } catch (err) {
    console.error('Error fetching grades:', err);
    res.status(500).json({ success: false, message: 'Error fetching grades', error: err.message });
  }
});

// GET /public/attendance
// Returns raw attendance records for a student with optional filters: ?student=&courseId=&startDate=&endDate=
router.get('/attendance', async (req, res) => {
  try {
    const rows = await readSheetData(SHEET_NAMES.ATTENDANCE || 'Attendance');
    const studentQ = (req.query.student || '').toString().trim().toLowerCase();
    const courseQ = (req.query.courseId || '').toString().trim();
    const startQ = (req.query.startDate || '').toString().trim();
    const endQ = (req.query.endDate || '').toString().trim();

    const out = [];
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), i]));
      const find = (...names) => {
        for (const n of names) {
          const k = n.toLowerCase();
          if (hmap[k] !== undefined) return hmap[k];
        }
        return -1;
      };
      const studentIdx = find('studentid','student_id','student','email','student email');
      const courseIdx = find('courseid','course_id','course');
      const dateIdx = find('date');
      const statusIdx = find('status');

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const student = studentIdx >= 0 ? (r[studentIdx] || '').toString() : '';
        const courseId = courseIdx >= 0 ? (r[courseIdx] || '').toString() : '';
        const date = dateIdx >= 0 ? (r[dateIdx] || '').toString() : '';
        const status = statusIdx >= 0 ? (r[statusIdx] || '').toString() : '';

        if (studentQ && student.toLowerCase() !== studentQ) continue;
        if (courseQ && courseId !== courseQ) continue;
        if (startQ && date < startQ) continue;
        if (endQ && date > endQ) continue;

        out.push({ student, courseId, date, status });
      }
    }

    res.json({ success: true, data: out, count: out.length });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ success: false, message: 'Error fetching attendance', error: err.message });
  }
});

// GET /public/assignments/headers
// Returns detected headers and index mapping used by the assignments endpoint
router.get('/assignments/headers', async (req, res) => {
  try {
    const ASSIGN_SHEET = process.env.GOOGLE_ASSIGNMENTS_SHEET_NAME || 'Assignments';
    const rows = await readSheetData(ASSIGN_SHEET, 'A1:Z1');
    const headers = (rows && rows[0]) ? rows[0].map(h => (h || '').toString()) : [];
    const hmap = Object.fromEntries(headers.map((h, idx) => [h, idx]));

    // Normalized keys the main endpoint looks for
    const normMap = Object.fromEntries(headers.map((h, idx) => [h.trim().toLowerCase(), idx]));
    const find = (names) => {
      for (const n of names) {
        const k = n.toLowerCase();
        if (normMap[k] !== undefined) return normMap[k];
      }
      return -1;
    };

    const mapping = {
      id: find(['AssignmentID','ID']),
      title: find(['Title']),
      subject: find(['Subject','CourseID','Course','Type']),
      dueDate: find(['DueDate','Due Date']),
      status: find(['Status']),
      priority: find(['Priority']),
      student: find(['Student','Student_ID','StudentID','StudentEmail']),
    };

    res.json({ success: true, headers, indices: hmap, mapping });
  } catch (err) {
    console.error('Error fetching assignment headers:', err);
    res.status(500).json({ success: false, message: 'Error fetching assignment headers', error: err.message });
  }
});

// GET /public/attendance-trend
// Returns attendance percentage per month (YYYY-MM) for last 5 months, based on Attendance sheet
router.get('/attendance-trend', async (req, res) => {
  try {
    const rows = await readSheetData(SHEET_NAMES.ATTENDANCE || 'Attendance');
    // Expect header: studentId, courseId, date(YYYY-MM-DD), status, timestamp
    const now = new Date();
    const lastMonths = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      lastMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const byMonth = Object.fromEntries(lastMonths.map(m => [m, { total: 0, presentish: 0 }]));

    if (rows && rows.length > 1) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const date = row[2] || ''; // date column
        const status = (row[3] || '').toString().toLowerCase();
        if (!date || date.length < 7) continue;
        const ym = date.slice(0, 7);
        if (!(ym in byMonth)) continue;
        byMonth[ym].total += 1;
        if (status === 'present' || status === 'late') byMonth[ym].presentish += 1;
      }
    }

    const series = lastMonths.map(m => ({
      month: m,
      attendance: byMonth[m].total > 0 ? Math.round((byMonth[m].presentish / byMonth[m].total) * 100) : 0,
    }));

    res.json({ success: true, data: series });
  } catch (err) {
    console.error('Error computing attendance trend:', err);
    res.status(500).json({ success: false, message: 'Error computing attendance trend', error: err.message });
  }
});

// GET /public/notices
// Returns top 5 notices from Notices sheet (first two columns)
router.get('/notices', async (req, res) => {
  try {
    const rows = await readSheetData('Notices');
    const items = [];
    if (rows && rows.length > 1) {
      for (let i = 1; i < Math.min(rows.length, 6); i++) {
        const r = rows[i];
        items.push({
          title: r[0] || `Notice ${i}`,
          detail: r[1] || '',
          date: r[2] || '',
        });
      }
    }
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('Error fetching notices:', err);
    res.status(500).json({ success: false, message: 'Error fetching notices', error: err.message });
  }
});

module.exports = router;
 
// GET /public/assignments
// Returns latest assignments; optionally filter by studentId/email via ?student=<id>
router.get('/assignments', async (req, res) => {
  try {
    const ASSIGN_SHEET = process.env.GOOGLE_ASSIGNMENTS_SHEET_NAME || 'Assignments';
    const rows = await readSheetData(ASSIGN_SHEET);
    const studentFilter = (req.query.student || '').toString().trim().toLowerCase();
    const items = [];

    // Flexible header-based mapping to align with current sheet structure
    if (rows && rows.length > 0) {
      const headers = (rows[0] || []).map(h => (h || '').toString());
      const hmap = Object.fromEntries(headers.map((h, idx) => [h.trim().toLowerCase(), idx]));

      const idx = (nameVariants) => {
        for (const v of nameVariants) {
          const key = v.toLowerCase();
          if (hmap[key] !== undefined) return hmap[key];
        }
        return -1;
      };

      const idIdx = idx(['AssignmentID','ID']);
      const titleIdx = idx(['Title']);
      const subjectIdx = idx(['Subject','CourseID','Course','Type']);
      const dueIdx = idx(['DueDate','Due Date']);
      const statusIdx = idx(['Status']);
      const priorityIdx = idx(['Priority']);
      const studentIdx = idx(['Student','Student_ID','StudentID','StudentEmail']);

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const rec = {
          id: idIdx >= 0 ? (r[idIdx] || `${i}`) : `${i}`,
          title: titleIdx >= 0 ? (r[titleIdx] || '') : '',
          subject: subjectIdx >= 0 ? (r[subjectIdx] || '') : '',
          dueDate: dueIdx >= 0 ? (r[dueIdx] || '') : '',
          status: statusIdx >= 0 ? (r[statusIdx] || 'Pending') : 'Pending',
          priority: priorityIdx >= 0 ? (r[priorityIdx] || 'Medium') : 'Medium',
          student: studentIdx >= 0 ? (r[studentIdx] || '').toString() : '',
        };
        if (studentFilter && rec.student && rec.student.toLowerCase() !== studentFilter) continue;
        items.push(rec);
      }
    }

    res.json({ success: true, data: items.slice(0, 50) });
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ success: false, message: 'Error fetching assignments', error: err.message });
  }
});
