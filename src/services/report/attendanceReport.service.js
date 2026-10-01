// ─── Attendance Report (grouped, color-coded) ────────────────────────────────
// One sheet, ACTIVE employees only, laid out employee-by-employee:
//   Title + active count
//   For each employee:  header → day-by-day table → regularizations (+counts) → totals
// Colours make each status obvious at a glance. Reuses the app's civil-day /
// work-policy / holiday / leave conventions so statuses match the calendar.
const mongoose         = require('mongoose');
// exceljs is required lazily inside renderWorkbook so a missing dep can't crash startup.
const Employee         = require('../../models/Employee');
const AttendanceRecord = require('../../models/AttendanceRecord');
const RegularizationRequest = require('../../models/RegularizationRequest');
const LeaveRequest     = require('../../models/LeaveRequest');
const PublicHoliday    = require('../../models/PublicHoliday');
const WorkPolicy       = require('../../models/WorkPolicy');
const Department       = require('../../models/Department');
const Designation      = require('../../models/Designation');
const Location         = require('../../models/Location');
const Company          = require('../../models/Company');
const AppError         = require('../../utils/AppError');
const { dayKey, parseCivil, addDays, DAY_NAMES, todayCivil } = require('../../utils/civilDate');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// A full working day = >= this many hours worked. Below it (but clocked in) is
// flagged "Short Hours" — still present, just under-worked.
const FULL_DAY_HOURS = 9;

const STATUS_LABEL = {
  present: 'Present', short: 'Short Hours', late: 'Late', half_day: 'Half Day', absent: 'Absent',
  on_leave: 'On Leave (Paid)', on_leave_unpaid: 'On Leave (Unpaid/LWP)', holiday: 'Holiday', week_off: 'Week Off',
};

// Fill + font colours per status (ARGB).
const STATUS_COLOR = {
  present:  { fill: 'FFC6EFCE', font: 'FF106B21' },  // green
  short:    { fill: 'FFFCE4CC', font: 'FFB45309' },  // orange — present but < full hours
  late:     { fill: 'FFFFEB9C', font: 'FF9C6500' },  // amber
  half_day: { fill: 'FFDDEBF7', font: 'FF1F4E78' },  // blue
  absent:   { fill: 'FFFFC7CE', font: 'FF9C0006' },  // red
  on_leave: { fill: 'FFE4D5F2', font: 'FF5B3A83' },  // purple — paid leave
  on_leave_unpaid: { fill: 'FFF5D0D8', font: 'FF9C0006' }, // red-purple — unpaid/LWP
  holiday:  { fill: 'FFD1F2EB', font: 'FF117864' },  // teal
  week_off: { fill: 'FFF2F2F2', font: 'FF808080' },  // grey
};
const REG_COLOR = {
  approved:  { fill: 'FFC6EFCE', font: 'FF106B21' },
  rejected:  { fill: 'FFFFC7CE', font: 'FF9C0006' },
  pending:   { fill: 'FFFFEB9C', font: 'FF9C6500' },
  cancelled: { fill: 'FFF2F2F2', font: 'FF808080' },
};
const HEADER_DARK = 'FF18181B';   // employee header band
const HEADER_GREY = 'FF595959';   // column header
const TOTALS_FILL = 'FFF4F4F5';

const MISSED_LABEL = { clock_in: 'Clock-in', clock_out: 'Clock-out', both: 'Both' };
const REG_LABEL    = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };

const fmtTime = (instant, tz) => {
  if (!instant) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant));
  } catch { return new Date(instant).toISOString().slice(11, 16); }
};
const dowTitle = (i) => DAY_NAMES[i].charAt(0) + DAY_NAMES[i].slice(1).toLowerCase();
const thin = { style: 'thin', color: { argb: 'FFE4E4E7' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const fillOf = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/**
 * @returns {Promise<{ filename:string, buffer:Buffer }>}
 */
const generateAttendanceReport = async (companyId, { month, year, employeeId, teamId }) => {
  const m = Number(month), y = Number(year);
  if (!m || !y || m < 1 || m > 12) throw new AppError('Valid month and year are required.', 400);

  // ─── ACTIVE employees only (specific employee/team still honoured) ───────
  const empFilter = { company_id: companyId, status: 'active' };
  if (employeeId) { delete empFilter.status; empFilter._id = new mongoose.Types.ObjectId(employeeId); }
  else if (teamId) empFilter.team_id = new mongoose.Types.ObjectId(teamId);

  const employees = await Employee.find(empFilter)
    .select('employeeId firstName lastName department_id designation_id location_id workPolicy_id joiningDate lastWorkingDay')
    .sort({ employeeId: 1, firstName: 1 }).lean();
  if (!employees.length) throw new AppError('No active employees match the selected filters.', 404);
  const empIds = employees.map((e) => e._id);

  // ─── Month bounds ────────────────────────────────────────────────────────
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const civilDays = [];
  for (let d = 1; d <= daysInMonth; d++) civilDays.push(parseCivil(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`));
  const firstCivil = civilDays[0], lastCivil = civilDays[civilDays.length - 1];
  const attStart = new Date(Date.UTC(y, m - 1, 1)), attEnd = new Date(Date.UTC(y, m, 1));
  const todayKey = dayKey(todayCivil());

  // ─── Batch fetches ───────────────────────────────────────────────────────
  const [records, holidays, leaves, regs, policies, departments, designations, locations, company] = await Promise.all([
    AttendanceRecord.find({ company_id: companyId, employee_id: { $in: empIds }, date: { $gte: attStart, $lt: attEnd } })
      .select('employee_id date status clockInTime clockOutTime totalHours overtimeHours isLate lateByMinutes').lean(),
    PublicHoliday.find({ company_id: companyId, isActive: true, date: { $gte: addDays(firstCivil, -1), $lte: addDays(lastCivil, 1) } })
      .select('name date location_id isOptional').lean(),
    LeaveRequest.find({ company_id: companyId, employee_id: { $in: empIds }, status: 'approved',
      startDate: { $lte: addDays(lastCivil, 1) }, endDate: { $gte: addDays(firstCivil, -1) } })
      .populate('leaveType_id', 'name').select('employee_id startDate endDate isHalfDay isLWP leaveType_id').lean(),
    RegularizationRequest.find({ company_id: companyId, employee_id: { $in: empIds }, date: { $gte: addDays(firstCivil, -1), $lte: addDays(lastCivil, 1) } })
      .select('employee_id date missedType requestedClockIn requestedClockOut status reason reviewNote').sort({ date: 1 }).lean(),
    WorkPolicy.find({ company_id: companyId }).select('workingDays isDefault').lean(),
    Department.find({ company_id: companyId }).select('name').lean(),
    Designation.find({ company_id: companyId }).select('name').lean(),
    Location.find({ company_id: companyId }).select('timezone').lean(),
    Company.findById(companyId).select('settings.timezone name').lean(),
  ]);

  const deptMap = new Map(departments.map((d) => [String(d._id), d.name]));
  const desigMap = new Map(designations.map((d) => [String(d._id), d.name]));
  const locTzMap = new Map(locations.map((l) => [String(l._id), l.timezone]));
  const companyTz = company?.settings?.timezone || 'UTC';
  const policyMap = new Map(policies.map((p) => [String(p._id), p]));
  const defaultPolicy = policies.find((p) => p.isDefault) || null;

  const attByEmp = new Map();
  for (const r of records) { const k = String(r.employee_id); if (!attByEmp.has(k)) attByEmp.set(k, {}); attByEmp.get(k)[dayKey(r.date)] = r; }

  const holidayByDay = new Map();
  for (const h of holidays) { if (h.isOptional) continue; const k = dayKey(h.date); if (!holidayByDay.has(k)) holidayByDay.set(k, []); holidayByDay.get(k).push({ name: h.name, location_id: h.location_id ? String(h.location_id) : null }); }
  const holidayForEmp = (k, emp) => (holidayByDay.get(k) || []).find((h) => !h.location_id || (emp.location_id && String(emp.location_id) === h.location_id)) || null;

  const leaveByEmp = new Map();
  for (const lv of leaves) { const k = String(lv.employee_id); if (!leaveByEmp.has(k)) leaveByEmp.set(k, []); leaveByEmp.get(k).push({ startKey: dayKey(lv.startDate), endKey: dayKey(lv.endDate), isHalfDay: lv.isHalfDay, isLWP: !!lv.isLWP, typeName: lv.leaveType_id?.name || null }); }
  const leaveForEmp = (eid, k) => (leaveByEmp.get(eid) || []).find((lv) => k >= lv.startKey && k <= lv.endKey) || null;

  const regByEmp = new Map();
  for (const rg of regs) { const k = String(rg.employee_id); if (!regByEmp.has(k)) regByEmp.set(k, []); regByEmp.get(k).push(rg); }

  // ─── Build per-employee structured data ──────────────────────────────────
  const blocks = [];
  for (const emp of employees) {
    const eid = String(emp._id);
    const tz = locTzMap.get(String(emp.location_id)) || companyTz;
    const policy = (emp.workPolicy_id && policyMap.get(String(emp.workPolicy_id))) || defaultPolicy;
    const workingDays = policy?.workingDays?.length ? policy.workingDays : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const joinKey = emp.joiningDate ? dayKey(emp.joiningDate) : null;
    const lwdKey  = emp.lastWorkingDay ? dayKey(emp.lastWorkingDay) : null;
    const empAtt  = attByEmp.get(eid) || {};

    const days = [];
    const sum = { present: 0, short: 0, late: 0, half_day: 0, absent: 0, on_leave: 0, on_leave_unpaid: 0, holiday: 0, week_off: 0, totalHours: 0, overtimeHours: 0 };

    for (const civil of civilDays) {
      const k = dayKey(civil);
      if (joinKey && k < joinKey) continue;
      if (lwdKey && k > lwdKey) continue;
      if (k > todayKey) continue;

      const dow = DAY_NAMES[civil.getUTCDay()];
      const isWorking = workingDays.includes(dow);
      const holiday = holidayForEmp(k, emp);
      const leave = leaveForEmp(eid, k);
      const rec = empAtt[k];

      let statusKey, note = '', cin = '', cout = '', hrs = '';
      const leaveLabel = (lv) => (lv?.typeName || '') + (lv ? (lv.isLWP ? ' (Unpaid/LWP)' : ' (Paid)') : '');
      const leaveKey   = (lv) => (lv?.isHalfDay ? 'half_day' : (lv?.isLWP ? 'on_leave_unpaid' : 'on_leave'));
      if (rec && rec.clockInTime) {
        statusKey = rec.status === 'present' && rec.isLate ? 'late' : rec.status;
        cin = fmtTime(rec.clockInTime, tz); cout = fmtTime(rec.clockOutTime, tz);
        hrs = rec.totalHours || 0;
        // Present but under a full day's hours → flag "Short Hours".
        if (statusKey === 'present' && hrs > 0 && hrs < FULL_DAY_HOURS) statusKey = 'short';
      } else if (rec) {
        statusKey = rec.status;
        if (statusKey === 'absent') { if (holiday) statusKey = 'holiday'; else if (leave) statusKey = leaveKey(leave); else if (!isWorking) statusKey = 'week_off'; }
        else if (statusKey === 'on_leave' && leave?.isLWP) statusKey = 'on_leave_unpaid';
        if (statusKey === 'on_leave' || statusKey === 'on_leave_unpaid' || statusKey === 'half_day') note = leaveLabel(leave);
        if (statusKey === 'holiday') note = holiday?.name || '';
      } else if (holiday) { statusKey = 'holiday'; note = holiday.name || ''; }
      else if (leave) { statusKey = leaveKey(leave); note = leaveLabel(leave); }
      else if (!isWorking) statusKey = 'week_off';
      else statusKey = 'absent';

      days.push({ date: `${String(civil.getUTCDate()).padStart(2, '0')} ${MONTHS[m - 1].slice(0, 3)}`, day: dowTitle(civil.getUTCDay()), cin, cout, hrs, statusKey, label: STATUS_LABEL[statusKey] + (note ? ` — ${note}` : '') });

      if (sum[statusKey] !== undefined) sum[statusKey]++;
      sum.totalHours += rec?.totalHours || 0; sum.overtimeHours += rec?.overtimeHours || 0;
    }

    const empRegs = (regByEmp.get(eid) || []).map((rg) => ({
      date: `${String(new Date(rg.date).getUTCDate()).padStart(2, '0')} ${MONTHS[new Date(rg.date).getUTCMonth()].slice(0, 3)}`,
      type: MISSED_LABEL[rg.missedType] || rg.missedType,
      reqIn: fmtTime(rg.requestedClockIn, tz), reqOut: fmtTime(rg.requestedClockOut, tz),
      status: rg.status, statusLabel: REG_LABEL[rg.status] || rg.status,
      reason: rg.reason || '', note: rg.reviewNote || '',
    }));
    const regCounts = { raised: empRegs.length, approved: 0, rejected: 0, pending: 0 };
    for (const r of empRegs) { if (r.status === 'approved') regCounts.approved++; else if (r.status === 'rejected') regCounts.rejected++; else if (r.status === 'pending') regCounts.pending++; }

    // Full-month context (not clamped to join/today): total calendar days, and the
    // employee's scheduled working days per their policy minus public holidays.
    const monthDays = civilDays.length;
    let workingDaysCount = 0;
    for (const civil of civilDays) {
      if (!workingDays.includes(DAY_NAMES[civil.getUTCDay()])) continue; // non-working weekday
      if (holidayForEmp(dayKey(civil), emp)) continue;                   // public holiday
      workingDaysCount++;
    }

    blocks.push({
      emp, tz, days, regs: empRegs, regCounts,
      header: `${emp.employeeId || ''}  ·  ${`${emp.firstName || ''} ${emp.lastName || ''}`.trim()}` +
        `${deptMap.get(String(emp.department_id)) ? '  ·  ' + deptMap.get(String(emp.department_id)) : ''}` +
        `${desigMap.get(String(emp.designation_id)) ? ' · ' + desigMap.get(String(emp.designation_id)) : ''}`,
      totals: `Totals:   Month Days ${monthDays}   |   Working Days ${workingDaysCount}   |   Present ${sum.present}   |   Short ${sum.short}   |   Late ${sum.late}   |   Half ${sum.half_day}   |   Absent ${sum.absent}   |   Leave-Paid ${sum.on_leave}   |   Leave-Unpaid ${sum.on_leave_unpaid}   |   Holiday ${sum.holiday}   |   Week-off ${sum.week_off}   |   Hrs ${Math.round(sum.totalHours * 10) / 10}   |   OT ${Math.round(sum.overtimeHours * 10) / 10}`,
    });
  }

  const buffer = await renderWorkbook({ company, month: m, year: y, count: employees.length, blocks });
  const filename = `Attendance-${MONTHS[m - 1]}-${y}${employeeId ? `-${employees[0]?.employeeId || 'emp'}` : ''}.xlsx`;
  return { filename, buffer };
};

// ─── ExcelJS rendering ────────────────────────────────────────────────────────
const NCOLS = 6; // A..F
const renderWorkbook = async ({ company, month, year, count, blocks }) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HRMS';
  const ws = wb.addWorksheet(`${MONTHS[month - 1].slice(0, 3)} ${year}`);
  [11, 7, 9, 9, 8, 40].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  let r = 1;
  const merge = (row) => ws.mergeCells(row, 1, row, NCOLS);

  // Title
  merge(r); let c = ws.getCell(r, 1);
  c.value = `ATTENDANCE REPORT — ${MONTHS[month - 1]} ${year}`;
  c.font = { bold: true, size: 15, color: { argb: 'FF18181B' } }; c.alignment = { vertical: 'middle' };
  ws.getRow(r).height = 24; r++;

  merge(r); c = ws.getCell(r, 1);
  c.value = `${company?.name || 'Company'}      Active Employees: ${count}`;
  c.font = { size: 11, color: { argb: 'FF71717A' } }; r++;
  r++; // spacer

  for (const b of blocks) {
    // Employee header band
    merge(r); c = ws.getCell(r, 1);
    c.value = b.header;
    c.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    c.fill = fillOf(HEADER_DARK); c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 20; r++;

    // Day table header
    ['Date', 'Day', 'In', 'Out', 'Hrs', 'Status'].forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = fillOf(HEADER_GREY); cell.alignment = { horizontal: i >= 2 && i <= 4 ? 'center' : 'left' }; cell.border = border;
    });
    r++;

    // Day rows
    for (const d of b.days) {
      const vals = [d.date, d.day, d.cin, d.cout, d.hrs === '' ? '' : Number(d.hrs), d.label];
      vals.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v === '' ? '' : v; cell.border = border;
        cell.alignment = { horizontal: i >= 2 && i <= 4 ? 'center' : 'left', vertical: 'middle' };
      });
      const sc = STATUS_COLOR[d.statusKey] || STATUS_COLOR.week_off;
      const st = ws.getCell(r, 6);
      st.fill = fillOf(sc.fill); st.font = { color: { argb: sc.font }, bold: true };
      r++;
    }

    r++; // spacer

    // Regularizations header + counts
    merge(r); c = ws.getCell(r, 1);
    c.value = `REGULARIZATIONS        Raised ${b.regCounts.raised}   |   Approved ${b.regCounts.approved}   |   Rejected ${b.regCounts.rejected}   |   Pending ${b.regCounts.pending}`;
    c.font = { bold: true, size: 10, color: { argb: 'FF3F3F46' } }; c.fill = fillOf('FFEDEDF0'); r++;

    if (b.regs.length) {
      ['Date', 'Type', 'Req In', 'Req Out', 'Status', 'Reason'].forEach((h, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = h; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
        cell.fill = fillOf(HEADER_GREY); cell.alignment = { horizontal: i >= 2 && i <= 4 ? 'center' : 'left' }; cell.border = border;
      });
      r++;
      for (const rg of b.regs) {
        const vals = [rg.date, rg.type, rg.reqIn, rg.reqOut, rg.statusLabel, rg.reason + (rg.note ? `  (note: ${rg.note})` : '')];
        vals.forEach((v, i) => {
          const cell = ws.getCell(r, i + 1);
          cell.value = v; cell.border = border; cell.alignment = { horizontal: i >= 2 && i <= 4 ? 'center' : 'left', vertical: 'middle' };
        });
        const rc = REG_COLOR[rg.status] || REG_COLOR.pending;
        const st = ws.getCell(r, 5); st.fill = fillOf(rc.fill); st.font = { color: { argb: rc.font }, bold: true };
        r++;
      }
    } else {
      merge(r); c = ws.getCell(r, 1);
      c.value = 'No regularization requests'; c.font = { italic: true, size: 9, color: { argb: 'FFA1A1AA' } }; r++;
    }

    r++; // spacer

    // Totals band
    merge(r); c = ws.getCell(r, 1);
    c.value = b.totals; c.font = { bold: true, size: 10, color: { argb: 'FF18181B' } };
    c.fill = fillOf(TOTALS_FILL); c.border = border; ws.getRow(r).height = 18; r++;

    r += 2; // gap between employees
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
};

module.exports = { generateAttendanceReport };
