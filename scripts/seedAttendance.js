/**
 * Seed realistic attendance records for all active employees.
 * Run: node scripts/seedAttendance.js
 * Creates records for the past 30 working days.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const Employee = require('../src/models/Employee');
const WorkPolicy = require('../src/models/WorkPolicy');
const Company = require('../src/models/Company');

const STATUSES = ['present', 'present', 'present', 'present', 'late', 'half_day', 'absent', 'on_leave'];
const CLOCK_TYPES = ['office', 'office', 'office', 'wfh', 'remote'];

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomMinutes = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME || 'hrms' });
  console.log('Connected to DB');

  const companies = await Company.find().lean();

  for (const company of companies) {
    const employees = await Employee.find({ company_id: company._id, status: 'active' }).lean();
    if (!employees.length) { console.log(`No active employees for ${company.name}`); continue; }

    const defaultPolicy = await WorkPolicy.findOne({ company_id: company._id, isDefault: true }).lean();
    if (!defaultPolicy) { console.log(`No default policy for ${company.name}`); continue; }

    const snap = {
      workStart: defaultPolicy.workStart || '09:00',
      workEnd: defaultPolicy.workEnd || '18:00',
      graceMinutes: defaultPolicy.graceMinutes || 10,
      lateMarkAfterMinutes: defaultPolicy.lateMarkAfterMinutes || 15,
      halfDayThresholdHours: defaultPolicy.halfDayThresholdHours || 4,
      absentThresholdHours: defaultPolicy.absentThresholdHours || 2,
      overtimeThresholdHours: defaultPolicy.overtimeThresholdHours || 9,
    };

    const workingDays = defaultPolicy.workingDays || ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const DAY_MAP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    const records = [];
    const today = new Date();

    for (const emp of employees) {
      const policy = emp.workPolicy_id
        ? await WorkPolicy.findById(emp.workPolicy_id).lean()
        : defaultPolicy;

      const policySnap = policy ? {
        workStart: policy.workStart || snap.workStart,
        workEnd: policy.workEnd || snap.workEnd,
        graceMinutes: policy.graceMinutes ?? snap.graceMinutes,
        lateMarkAfterMinutes: policy.lateMarkAfterMinutes ?? snap.lateMarkAfterMinutes,
        halfDayThresholdHours: policy.halfDayThresholdHours ?? snap.halfDayThresholdHours,
        absentThresholdHours: policy.absentThresholdHours ?? snap.absentThresholdHours,
        overtimeThresholdHours: policy.overtimeThresholdHours ?? snap.overtimeThresholdHours,
      } : snap;

      const [startH, startM] = policySnap.workStart.split(':').map(Number);

      // Generate records for past 30 days (skip today)
      for (let daysAgo = 1; daysAgo <= 30; daysAgo++) {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayName = DAY_MAP[date.getUTCDay()];

        // Skip weekends
        if (!workingDays.includes(dayName)) continue;

        const status = randomItem(STATUSES);

        // No clock times for absent/on_leave/holiday
        if (status === 'absent' || status === 'on_leave' || status === 'holiday') {
          records.push({
            company_id: company._id,
            employee_id: emp._id,
            date,
            status,
            workPolicySnapshot: policySnap,
          });
          continue;
        }

        // Clock in: shift start +/- some minutes
        const lateMin = status === 'late' ? randomMinutes(16, 45) : randomMinutes(-5, 8);
        const clockInTime = new Date(date);
        clockInTime.setUTCHours(startH, startM + lateMin, randomMinutes(0, 59), 0);

        // Clock out
        let workedHours;
        if (status === 'half_day') {
          workedHours = randomMinutes(3, 4) + Math.random();
        } else {
          workedHours = randomMinutes(8, 10) + Math.random();
        }
        const clockOutTime = new Date(clockInTime.getTime() + workedHours * 60 * 60 * 1000);

        const totalHours = Math.round(((clockOutTime - clockInTime) / (1000 * 60 * 60)) * 100) / 100;
        const isLate = lateMin > (policySnap.graceMinutes || 10);
        const lateByMinutes = isLate ? lateMin : 0;
        const overtimeHours = totalHours > policySnap.overtimeThresholdHours
          ? Math.round((totalHours - policySnap.overtimeThresholdHours) * 100) / 100
          : 0;

        const clockType = randomItem(CLOCK_TYPES);

        records.push({
          company_id: company._id,
          employee_id: emp._id,
          date,
          clockInTime,
          clockOutTime,
          clockInType: clockType,
          clockOutType: clockType,
          totalHours,
          overtimeHours,
          status,
          isLate,
          lateByMinutes,
          workPolicySnapshot: policySnap,
        });
      }
    }

    // Clear existing and insert
    await AttendanceRecord.deleteMany({ company_id: company._id });
    console.log(`Cleared old attendance for ${company.name}`);

    if (records.length) {
      try {
        await AttendanceRecord.insertMany(records, { ordered: false });
        console.log(`Inserted ${records.length} records for ${company.name} (${employees.length} employees)`);
      } catch (err) {
        if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
          console.log(`Inserted ${err.result?.nInserted ?? 'some'} records (duplicates skipped)`);
        } else {
          throw err;
        }
      }
    }
  }

  await mongoose.disconnect();
  console.log('Done!');
};

run().catch((err) => { console.error(err); process.exit(1); });
