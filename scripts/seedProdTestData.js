require('dotenv').config();
const mongoose = require('mongoose');
const { addDays, subDays } = require('date-fns');

const PROD_URI = 'mongodb+srv://olioclientwebsiteleads_db_user:fm94Z1SVE0bHmdtu@hrms.qtoqbwo.mongodb.net/hrms?appName=HRMS';
const companyId = '69b2fcef09ab0d0538f21b7c';

async function run() {
  await mongoose.connect(PROD_URI);
  console.log('Connected to production DB');

  const Location = require('../src/models/Location');
  const Employee = require('../src/models/Employee');
  const User = require('../src/models/User');
  const AppraisalCycle = require('../src/models/AppraisalCycle');
  const AppraisalRecord = require('../src/models/AppraisalRecord');
  const AppraisalGoal = require('../src/models/AppraisalGoal');
  const PublicHoliday = require('../src/models/PublicHoliday');
  const LeaveRequest = require('../src/models/LeaveRequest');
  const LeaveType = require('../src/models/LeaveType');
  const LeaveBalance = require('../src/models/LeaveBalance');
  const AttendanceRecord = require('../src/models/AttendanceRecord');
  const PayrollRun = require('../src/models/PayrollRun');
  const PayrollRecord = require('../src/models/PayrollRecord');
  const EmployeeDocument = require('../src/models/EmployeeDocument');
  const DocumentType = require('../src/models/DocumentType');

  const emps = await Employee.find({ company_id: companyId }).lean();
  const empMap = {};
  emps.forEach(e => { empMap[e.employeeId] = e; });
  const admin = await User.findOne({ company_id: companyId }).lean();

  // ══════════════════════════════════════════════════
  // 1. Fix Office Location + Add Suraj's Home geofence
  // ══════════════════════════════════════════════════
  await Location.updateOne(
    { company_id: companyId, name: 'Mumbai Main Office' },
    { $set: { 'geofence.lat': 19.0871699, 'geofence.lng': 72.9050998, 'geofence.radius': 500 } }
  );
  console.log('✅ Office updated: 19.0871699, 72.9050998');

  // Update Suraj's home address with coords
  await Employee.updateOne({ _id: empMap['EMP005']._id }, {
    addresses: [{
      label: 'home', street: '202 Bandra West', city: 'Navi Mumbai', state: 'Maharashtra',
      country: 'India', zip: '400050', lat: 18.980444, lng: 73.094393, isPrimary: true,
    }],
  });
  console.log('✅ Suraj home coords: 18.980444, 73.094393');

  // ══════════════════════════════════════════════════
  // 2. Appraisal Cycle + Records + Goals
  // ══════════════════════════════════════════════════
  const existingCycle = await AppraisalCycle.findOne({ company_id: companyId });
  if (!existingCycle) {
    const today = new Date();
    const cycle = await AppraisalCycle.create({
      company_id: companyId,
      name: 'Q1 2026 Performance Review',
      type: 'quarterly',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-03-31'),
      reviewStart: subDays(today, 5),
      reviewEnd: addDays(today, 20),
      selfRatingDeadline: addDays(today, 3),
      managerRatingDeadline: addDays(today, 10),
      ratingScale: 5,
      selfRatingWeight: 30,
      managerRatingWeight: 70,
      minGoals: 2,
      maxGoals: 5,
      status: 'active',
      createdBy: admin._id,
    });
    console.log('✅ Appraisal cycle created:', cycle.name);

    // Records for all employees
    const statuses = {
      'EMP001': 'not_started',        // Yash — needs to self-rate
      'EMP002': 'goals_approved',      // Austin — goals approved, can self-rate
      'EMP003': 'self_submitted',      // John — self rated, waiting for manager
      'EMP004': 'manager_submitted',   // Emma — manager rated, waiting for HR
      'EMP005': 'goals_set',           // Suraj — goals set, pending approval
    };

    for (const [empId, status] of Object.entries(statuses)) {
      const emp = empMap[empId];
      if (!emp) continue;

      const record = await AppraisalRecord.create({
        company_id: companyId,
        cycle_id: cycle._id,
        employee_id: emp._id,
        manager_id: emp.reportingManager_id || null,
        status,
        selfSubmittedAt: ['self_submitted', 'manager_submitted', 'finalized'].includes(status) ? subDays(today, 2) : null,
        managerSubmittedAt: ['manager_submitted', 'finalized'].includes(status) ? subDays(today, 1) : null,
      });

      // Create 2-3 goals per employee
      const goals = [
        { title: 'Complete project deliverables on time', description: 'Deliver all assigned tasks within sprint deadlines', weightage: 40 },
        { title: 'Improve code quality / process efficiency', description: 'Reduce bugs and improve documentation', weightage: 35 },
        { title: 'Team collaboration and communication', description: 'Active participation in team meetings and knowledge sharing', weightage: 25 },
      ];

      for (const g of goals) {
        await AppraisalGoal.create({
          company_id: companyId,
          cycle_id: cycle._id,
          record_id: record._id,
          employee_id: emp._id,
          title: g.title,
          description: g.description,
          weightage: g.weightage,
          selfRating: ['self_submitted', 'manager_submitted'].includes(status) ? Math.floor(Math.random() * 2) + 3 : null,
          selfComment: ['self_submitted', 'manager_submitted'].includes(status) ? 'Made good progress on this goal.' : null,
          managerRating: status === 'manager_submitted' ? Math.floor(Math.random() * 2) + 3 : null,
          managerComment: status === 'manager_submitted' ? 'Good work, keep improving.' : null,
        });
      }

      console.log(`  ${empId} ${emp.firstName}: ${status} (3 goals)`);
    }
  } else {
    console.log('✅ Appraisal cycle already exists');
  }

  // ══════════════════════════════════════════════════
  // 3. Public Holidays (2026)
  // ══════════════════════════════════════════════════
  const existingHolidays = await PublicHoliday.countDocuments({ company_id: companyId, year: 2026 });
  if (existingHolidays === 0) {
    const loc = await Location.findOne({ company_id: companyId }).lean();
    const holidays = [
      { name: 'Republic Day', date: new Date('2026-01-26'), type: 'national' },
      { name: 'Holi', date: new Date('2026-03-25'), type: 'national' },
      { name: 'Good Friday', date: new Date('2026-04-03'), type: 'national' },
      { name: 'Eid ul-Fitr', date: new Date('2026-04-01'), type: 'national' },
      { name: 'May Day', date: new Date('2026-05-01'), type: 'national' },
      { name: 'Independence Day', date: new Date('2026-08-15'), type: 'national' },
      { name: 'Gandhi Jayanti', date: new Date('2026-10-02'), type: 'national' },
      { name: 'Diwali', date: new Date('2026-10-20'), type: 'national' },
      { name: 'Christmas', date: new Date('2026-12-25'), type: 'national' },
    ];

    await PublicHoliday.insertMany(holidays.map(h => ({
      ...h,
      company_id: companyId,
      location_id: loc._id,
      year: 2026,
      source: 'manual',
      isActive: true,
    })));
    console.log('✅ 9 public holidays added for 2026');
  } else {
    console.log('✅ Holidays already exist');
  }

  // ══════════════════════════════════════════════════
  // 4. Some Leave Requests (various statuses)
  // ══════════════════════════════════════════════════
  const existingLeaves = await LeaveRequest.countDocuments({ company_id: companyId });
  if (existingLeaves === 0) {
    const cl = await LeaveType.findOne({ company_id: companyId, code: 'CL' }).lean();
    const sl = await LeaveType.findOne({ company_id: companyId, code: 'SL' }).lean();
    const al = await LeaveType.findOne({ company_id: companyId, code: 'AL' }).lean();

    if (cl && sl) {
      // Austin — approved CL last week
      await LeaveRequest.create({
        company_id: companyId, employee_id: empMap['EMP002']._id,
        leaveType_id: cl._id, startDate: subDays(new Date(), 7), endDate: subDays(new Date(), 6),
        totalDays: 1, status: 'approved', reason: 'Personal work',
        reviewedBy: empMap['EMP005'].user_id, reviewedAt: subDays(new Date(), 7),
      });
      console.log('✅ Austin: 1 approved CL');

      // John — pending SL
      await LeaveRequest.create({
        company_id: companyId, employee_id: empMap['EMP003']._id,
        leaveType_id: sl._id, startDate: addDays(new Date(), 2), endDate: addDays(new Date(), 3),
        totalDays: 2, status: 'pending', reason: 'Not feeling well',
      });
      console.log('✅ John: 1 pending SL (for approval testing)');

      // Yash — rejected AL
      if (al) {
        await LeaveRequest.create({
          company_id: companyId, employee_id: empMap['EMP001']._id,
          leaveType_id: al._id, startDate: subDays(new Date(), 14), endDate: subDays(new Date(), 12),
          totalDays: 3, status: 'rejected', reason: 'Family event',
          reviewedBy: empMap['EMP005'].user_id, reviewedAt: subDays(new Date(), 13),
          reviewNote: 'Critical project deadline, please reschedule.',
        });
        console.log('✅ Yash: 1 rejected AL');
      }
    }
  } else {
    console.log('✅ Leave requests already exist');
  }

  // ══════════════════════════════════════════════════
  // 5. Some Attendance Records (last 5 days)
  // ══════════════════════════════════════════════════
  const existingAtt = await AttendanceRecord.countDocuments({ company_id: companyId });
  if (existingAtt === 0) {
    const today = new Date();
    const records = [];

    for (let i = 1; i <= 5; i++) {
      const date = subDays(today, i);
      if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends

      for (const emp of emps) {
        const clockIn = new Date(date);
        clockIn.setHours(9, Math.floor(Math.random() * 30), 0);
        const clockOut = new Date(date);
        clockOut.setHours(18, Math.floor(Math.random() * 30), 0);
        const totalHours = ((clockOut - clockIn) / (1000 * 60 * 60)).toFixed(1);

        records.push({
          company_id: companyId,
          employee_id: emp._id,
          date,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          clockInType: 'office',
          clockOutType: 'office',
          totalHours: parseFloat(totalHours),
          status: parseFloat(totalHours) >= 8 ? 'present' : 'half_day',
          isLate: clockIn.getHours() >= 10,
          lateByMinutes: clockIn.getHours() >= 10 ? (clockIn.getHours() - 9) * 60 + clockIn.getMinutes() : 0,
        });
      }
    }

    if (records.length) {
      await AttendanceRecord.insertMany(records);
      console.log(`✅ ${records.length} attendance records created (last 5 working days)`);
    }
  } else {
    console.log('✅ Attendance records already exist');
  }

  // ══════════════════════════════════════════════════
  // 6. Document with expiry (for expiry alert testing)
  // ══════════════════════════════════════════════════
  const existingDocs = await EmployeeDocument.countDocuments({ company_id: companyId });
  if (existingDocs === 0) {
    const passport = await DocumentType.findOne({ company_id: companyId, slug: 'passport' }).lean();
    if (passport) {
      await EmployeeDocument.create({
        company_id: companyId,
        employee_id: empMap['EMP005']._id,
        document_type_id: passport._id,
        name: 'Suraj_Passport.pdf',
        fileKey: 'companies/' + companyId + '/employees/' + empMap['EMP005']._id + '/passport/suraj_passport.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        expiryDate: addDays(new Date(), 25),
        status: 'verified',
        verifiedBy: admin._id,
        verifiedAt: subDays(new Date(), 30),
        uploadedBy: admin._id,
        isVisibleToEmployee: true,
      });
      console.log('✅ Suraj passport doc — expires in 25 days');
    }

    const idProof = await DocumentType.findOne({ company_id: companyId, slug: 'id-proof' }).lean();
    if (idProof) {
      await EmployeeDocument.create({
        company_id: companyId,
        employee_id: empMap['EMP001']._id,
        document_type_id: idProof._id,
        name: 'Yash_Aadhar.pdf',
        fileKey: 'companies/' + companyId + '/employees/' + empMap['EMP001']._id + '/id-proof/yash_aadhar.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        status: 'verified',
        verifiedBy: admin._id,
        verifiedAt: subDays(new Date(), 10),
        uploadedBy: empMap['EMP001'].user_id,
        isVisibleToEmployee: true,
      });
      console.log('✅ Yash ID proof doc — verified');
    }
  } else {
    console.log('✅ Documents already exist');
  }

  // ══════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════
  console.log('\n=== Test Data Summary ===');
  console.log('Office: 19.0871699, 72.9050998 (500m radius)');
  console.log('Suraj home: 18.980444, 73.094393');
  console.log('Appraisal: Q1 2026, self-rating deadline in 3 days');
  console.log('Holidays: 9 for 2026 (Holi Mar 25 — upcoming!)');
  console.log('Leaves: Austin approved, John pending, Yash rejected');
  console.log('Attendance: Last 5 working days for all employees');
  console.log('Docs: Suraj passport (expires 25 days), Yash ID proof (verified)');
  console.log('\nReady to test all notification rules!');

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
