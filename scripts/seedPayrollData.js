require('dotenv').config();
const mongoose = require('mongoose');

const PROD_URI = 'mongodb+srv://olioclientwebsiteleads_db_user:fm94Z1SVE0bHmdtu@hrms.qtoqbwo.mongodb.net/hrms?appName=HRMS';
const companyId = '69b2fcef09ab0d0538f21b7c';

async function run() {
  await mongoose.connect(PROD_URI);
  console.log('Connected to production DB');

  const Employee = require('../src/models/Employee');
  const EmployeeSalary = require('../src/models/EmployeeSalary');
  const SalaryComponent = require('../src/models/SalaryComponent');
  const AttendanceRecord = require('../src/models/AttendanceRecord');
  const PayrollRun = require('../src/models/PayrollRun');
  const PayrollRecord = require('../src/models/PayrollRecord');
  const PublicHoliday = require('../src/models/PublicHoliday');
  const Company = require('../src/models/Company');

  const emps = await Employee.find({ company_id: companyId }).lean();
  const empMap = {};
  emps.forEach(e => { empMap[e.employeeId] = e; });

  const components = await SalaryComponent.find({ company_id: companyId, isActive: true }).lean();
  const basic = components.find(c => c.name === 'Basic Salary');
  const hra = components.find(c => c.name === 'HRA');
  const travel = components.find(c => c.name === 'Travel Allowance');
  const medical = components.find(c => c.name === 'Medical Allowance');
  const pfEmp = components.find(c => c.name === 'PF Employee');
  const pfEr = components.find(c => c.name === 'PF Employer');
  const pt = components.find(c => c.name === 'Professional Tax');

  // ══════════════════════════════════════════════════
  // 1. Assign salaries to all employees
  // ══════════════════════════════════════════════════
  const salaryData = {
    'EMP001': { ctcAnnual: 600000, basic: 25000, hra: 10000, travel: 5000, medical: 3000 },  // Yash - Developer
    'EMP002': { ctcAnnual: 480000, basic: 20000, hra: 8000, travel: 4000, medical: 2500 },   // Austin - Accounting
    'EMP003': { ctcAnnual: 420000, basic: 17500, hra: 7000, travel: 3500, medical: 2000 },   // John - HR Staff
    'EMP004': { ctcAnnual: 720000, basic: 30000, hra: 12000, travel: 6000, medical: 4000 },  // Emma - HR Manager
    'EMP005': { ctcAnnual: 1200000, basic: 50000, hra: 20000, travel: 10000, medical: 5000 }, // Suraj - Manager
  };

  for (const [empId, sal] of Object.entries(salaryData)) {
    const emp = empMap[empId];
    if (!emp) continue;

    const existing = await EmployeeSalary.findOne({ employee_id: emp._id, company_id: companyId, status: 'active' });
    if (existing) {
      console.log(`  ${empId} ${emp.firstName} already has salary: ₹${existing.ctcAnnual}`);
      continue;
    }

    const comps = [];

    if (basic) comps.push({ component_id: basic._id, name: basic.name, type: 'earning', calcType: 'fixed', value: sal.basic, monthlyAmount: sal.basic });
    if (hra) comps.push({ component_id: hra._id, name: hra.name, type: 'earning', calcType: 'percentage', value: 40, monthlyAmount: sal.hra });
    if (travel) comps.push({ component_id: travel._id, name: travel.name, type: 'earning', calcType: 'fixed', value: sal.travel, monthlyAmount: sal.travel });
    if (medical) comps.push({ component_id: medical._id, name: medical.name, type: 'earning', calcType: 'fixed', value: sal.medical, monthlyAmount: sal.medical });
    if (pfEmp) comps.push({ component_id: pfEmp._id, name: pfEmp.name, type: 'deduction', calcType: 'percentage', value: 12, monthlyAmount: Math.round(sal.basic * 0.12) });
    if (pt) comps.push({ component_id: pt._id, name: pt.name, type: 'deduction', calcType: 'fixed', value: 200, monthlyAmount: 200 });

    const grossMonthly = comps.filter(c => c.type === 'earning').reduce((s, e) => s + e.monthlyAmount, 0);
    const totalDeductions = comps.filter(c => c.type === 'deduction').reduce((s, d) => s + d.monthlyAmount, 0);
    const ctcMonthly = grossMonthly - totalDeductions;

    await EmployeeSalary.create({
      company_id: companyId,
      employee_id: emp._id,
      type: 'custom',
      ctcAnnual: sal.ctcAnnual,
      ctcMonthly,
      components: comps,
      effectiveDate: new Date('2026-01-01'),
      status: 'active',
    });
    console.log(`✅ ${empId} ${emp.firstName}: ₹${sal.ctcAnnual}/yr (₹${grossMonthly}/mo gross, ₹${grossMonthly - totalDeductions}/mo net)`);
  }

  // ══════════════════════════════════════════════════
  // 2. Clear old attendance + payroll
  // ══════════════════════════════════════════════════
  await AttendanceRecord.deleteMany({ company_id: companyId });
  await PayrollRun.deleteMany({ company_id: companyId });
  await PayrollRecord.deleteMany({ company_id: companyId });
  console.log('\n✅ Cleared old attendance + payroll data');

  // ══════════════════════════════════════════════════
  // 3. Generate attendance: Jan 1 to today
  // ══════════════════════════════════════════════════
  const holidays = await PublicHoliday.find({ company_id: companyId, year: 2026 }).lean();
  const holidayDates = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));

  const company = await Company.findById(companyId).lean();
  const weekendDays = company?.settings?.leave?.weekendDays || ['SAT', 'SUN'];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const startDate = new Date('2026-01-01');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const records = [];
  let totalDays = 0;

  const activeEmps = emps.filter(e => e.status === 'active');

  for (let d = new Date(startDate); d < today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayName = dayNames[d.getDay()];

    // Skip weekends
    if (weekendDays.includes(dayName)) continue;

    // Skip holidays
    if (holidayDates.has(dateStr)) continue;

    totalDays++;

    for (const emp of activeEmps) {
      // Random variation: 90% present, 5% absent, 5% late
      const rand = Math.random();

      if (rand < 0.05) {
        // Absent
        records.push({
          company_id: companyId,
          employee_id: emp._id,
          date: new Date(d),
          status: 'absent',
          totalHours: 0,
        });
      } else {
        // Present or late
        const isLate = rand < 0.15; // 10% late
        const clockInHour = isLate ? 10 + Math.floor(Math.random() * 2) : 9;
        const clockInMin = Math.floor(Math.random() * 30);
        const clockOutHour = 18 + Math.floor(Math.random() * 2);
        const clockOutMin = Math.floor(Math.random() * 30);

        const clockIn = new Date(d);
        clockIn.setHours(clockInHour, clockInMin, 0);
        const clockOut = new Date(d);
        clockOut.setHours(clockOutHour, clockOutMin, 0);

        const totalHours = parseFloat(((clockOut - clockIn) / (1000 * 60 * 60)).toFixed(1));
        const lateBy = isLate ? (clockInHour - 9) * 60 + clockInMin : 0;

        let status = 'present';
        if (totalHours < 4) status = 'absent';
        else if (totalHours < 6) status = 'half_day';
        else if (isLate) status = 'late';

        records.push({
          company_id: companyId,
          employee_id: emp._id,
          date: new Date(d),
          clockInTime: clockIn,
          clockOutTime: clockOut,
          clockInType: 'office',
          clockOutType: 'office',
          totalHours,
          status,
          isLate,
          lateByMinutes: lateBy,
          overtimeHours: totalHours > 9 ? parseFloat((totalHours - 9).toFixed(1)) : 0,
        });
      }
    }
  }

  // Batch insert in chunks
  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    await AttendanceRecord.insertMany(records.slice(i, i + chunkSize), { ordered: false });
  }
  console.log(`✅ ${records.length} attendance records created (${totalDays} working days × ${activeEmps.length} employees)`);

  // ══════════════════════════════════════════════════
  // 4. Run payroll for Jan + Feb (processed + paid)
  // ══════════════════════════════════════════════════
  const { calculatePayrollRecord } = require('../src/services/payroll/calculatePayroll.service');

  for (const month of [1, 2]) {
    const monthName = month === 1 ? 'January' : 'February';

    // Create payroll run
    const payrollRun = await PayrollRun.create({
      company_id: companyId,
      month,
      year: 2026,
      status: 'paid',
      paidAt: new Date(`2026-${String(month + 1).padStart(2, '0')}-01`),
      initiatedBy: empMap['EMP005'].user_id,
      totalEmployees: activeEmps.length,
    });

    let totalGross = 0, totalDeductions = 0, totalNet = 0;

    for (const emp of activeEmps) {
      const salary = await EmployeeSalary.findOne({ employee_id: emp._id, status: 'active' }).lean();
      if (!salary) continue;

      // Count attendance for this month
      const monthStart = new Date(`2026-${String(month).padStart(2, '0')}-01`);
      const monthEnd = new Date(`2026-${String(month + 1).padStart(2, '0')}-01`);

      const attRecords = records.filter(r =>
        r.employee_id.toString() === emp._id.toString() &&
        new Date(r.date) >= monthStart && new Date(r.date) < monthEnd
      );

      const daysPresent = attRecords.filter(r => ['present', 'late'].includes(r.status)).length;
      const daysAbsent = attRecords.filter(r => r.status === 'absent').length;
      const halfDays = attRecords.filter(r => r.status === 'half_day').length;
      const lateDays = attRecords.filter(r => r.isLate).length;

      // Count working days in month
      let workingDays = 0;
      for (let dd = new Date(monthStart); dd < monthEnd; dd.setDate(dd.getDate() + 1)) {
        const dn = dayNames[dd.getDay()];
        const ds = dd.toISOString().split('T')[0];
        if (!weekendDays.includes(dn) && !holidayDates.has(ds)) workingDays++;
      }

      const perDay = salary.grossMonthly / workingDays;
      const absentDeduction = Math.round(daysAbsent * perDay);
      const halfDayDeduction = Math.round(halfDays * perDay * 0.5);
      const gross = salary.grossMonthly;
      const deductions = salary.totalDeductions + absentDeduction + halfDayDeduction;
      const net = gross - deductions;

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;

      await PayrollRecord.create({
        company_id: companyId,
        payrollRun_id: payrollRun._id,
        employee_id: emp._id,
        employeeSalary_id: salary._id,
        ctcMonthly: salary.ctcMonthly,
        earnings: salary.earnings,
        deductions: salary.deductions,
        grossEarnings: gross,
        totalDeductions: deductions,
        netPay: Math.max(0, net),
        perDaySalary: Math.round(perDay),
        totalWorkingDays: workingDays,
        daysWorked: daysPresent + halfDays * 0.5,
        daysAbsent,
        halfDays,
        lateCount: lateDays,
        status: 'ready',
      });
    }

    await PayrollRun.updateOne({ _id: payrollRun._id }, {
      totalGross, totalDeductions, totalNetPay: totalNet,
    });

    console.log(`✅ ${monthName} 2026 payroll: ₹${totalGross} gross → ₹${totalNet} net (${activeEmps.length} employees, PAID)`);
  }

  // ══════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════
  console.log('\n=== Summary ===');
  console.log('Salaries: 5 employees assigned');
  console.log(`Attendance: Jan 1 - today (${records.length} records)`);
  console.log('Payroll: Jan + Feb processed and paid');
  console.log('March payroll: ready to be initiated from UI');

  await mongoose.disconnect();
  console.log('\n✅ All done!');
}

run().catch(err => { console.error(err); process.exit(1); });
