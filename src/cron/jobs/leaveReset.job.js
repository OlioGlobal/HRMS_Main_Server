/**
 * Leave Balance Reset Job
 *
 * Runs daily at midnight UTC.
 *
 * Logic:
 *   For each company → for each reset cycle (fiscal_year, calendar_year):
 *     - Compute what "current year" should be right now using getLeaveYear()
 *     - Check if balances already exist for that year (1 indexed query)
 *     - If YES  → already reset, skip (exits in ~1ms, 363 days/year)
 *     - If NO   → new year started, create balances for all active employees
 *
 * Server-down safe:
 *   Server down Apr 1 → runs Apr 2 → sees no year=2026 balances → resets ✅
 *
 * Idempotent:
 *   Uses $setOnInsert → running twice has no effect ✅
 */

const logger       = require('../../utils/logger');
const Company      = require('../../models/Company');
const Employee     = require('../../models/Employee');
const LeaveType    = require('../../models/LeaveType');
const LeaveBalance = require('../../models/LeaveBalance');
const { getLeaveYear } = require('../../utils/getLeaveYear');

const RESETABLE_CYCLES = ['fiscal_year', 'calendar_year'];

const run = async () => {
  const today      = new Date();
  today.setHours(0, 0, 0, 0);

  logger.info('[LeaveReset] Job started', { date: today.toISOString().slice(0, 10) });

  const companies = await Company.find({ isActive: true }).lean();
  logger.info(`[LeaveReset] Processing ${companies.length} company(ies)`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const company of companies) {
    const fiscalStart = company.settings?.fiscalYearStart ?? 1;
    logger.debug(`[LeaveReset] Company: ${company.name} | fiscalYearStart: ${fiscalStart}`);

    for (const cycle of RESETABLE_CYCLES) {
      const currentYear = getLeaveYear(today, cycle, fiscalStart);

      // ── Fast check: get leave types for this cycle ───────────────────────
      const leaveTypes = await LeaveType.find({
        company_id: company._id,
        isActive:   true,
        resetCycle: cycle,
      }).lean();

      if (leaveTypes.length === 0) {
        logger.debug(`[LeaveReset] ${company.name} | ${cycle} | no active leave types, skipping`);
        continue;
      }

      const leaveTypeIds = leaveTypes.map((lt) => lt._id);

      // ── Check if balances already exist for currentYear ──────────────────
      // This is the key gate — exits in ~1ms on 363 days/year
      const alreadyExists = await LeaveBalance.exists({
        company_id:   company._id,
        leaveType_id: { $in: leaveTypeIds },
        year:         currentYear,
      });

      if (alreadyExists) {
        logger.debug(
          `[LeaveReset] ${company.name} | ${cycle} | year=${currentYear} already reset, skipping`,
        );
        totalSkipped += leaveTypes.length;
        continue;
      }

      // ── New year detected ─────────────────────────────────────────────────
      logger.info(
        `[LeaveReset] ${company.name} | ${cycle} | NEW YEAR detected — resetting to year=${currentYear}`,
      );

      const employees = await Employee.find({
        company_id: company._id,
        isActive:   true,
      }).lean();

      if (employees.length === 0) {
        logger.warn(`[LeaveReset] ${company.name} | no active employees found`);
        continue;
      }

      const oldYear = currentYear - 1;

      // ── Fetch all old-year balances in one query ──────────────────────────
      const oldBalances = await LeaveBalance.find({
        company_id:   company._id,
        leaveType_id: { $in: leaveTypeIds },
        year:         oldYear,
      }).lean({ virtuals: true });

      // Map: "empId_ltId" → old balance doc
      const oldBalanceMap = {};
      for (const b of oldBalances) {
        oldBalanceMap[`${b.employee_id}_${b.leaveType_id}`] = b;
      }

      logger.info(
        `[LeaveReset] ${company.name} | ${cycle} | ${employees.length} employees × ${leaveTypes.length} leave types`,
      );

      const ops = [];

      for (const lt of leaveTypes) {
        for (const emp of employees) {
          const old = oldBalanceMap[`${emp._id}_${lt._id}`];

          // ── Carry-forward calculation ──────────────────────────────────
          let carryForwardDays = 0;
          if (lt.carryForward && old) {
            const remaining = (
              old.allocated +
              old.carryForward +
              old.adjustment -
              old.used -
              old.pending
            );
            carryForwardDays = Math.max(0, Math.min(remaining, lt.maxCarryForwardDays));

            if (carryForwardDays > 0) {
              logger.debug(
                `[LeaveReset] ${emp.firstName} ${emp.lastName} | ${lt.code} | carry-forward=${carryForwardDays}`,
              );
            }
          }

          ops.push({
            updateOne: {
              filter: {
                company_id:   company._id,
                employee_id:  emp._id,
                leaveType_id: lt._id,
                year:         currentYear,
              },
              update: {
                $setOnInsert: {
                  company_id:   company._id,
                  employee_id:  emp._id,
                  leaveType_id: lt._id,
                  year:         currentYear,
                  allocated:    lt.daysPerYear,
                  carryForward: carryForwardDays,
                  used:         0,
                  pending:      0,
                  adjustment:   0,
                },
              },
              upsert: true,
            },
          });

          totalCreated++;
        }
      }

      if (ops.length > 0) {
        const result = await LeaveBalance.bulkWrite(ops, { ordered: false });
        logger.info(
          `[LeaveReset] ${company.name} | ${cycle} | year=${currentYear} | upserted=${result.upsertedCount} matched=${result.matchedCount}`,
        );
      }
    }
  }

  const summary = `${totalCreated} balance(s) processed, ${totalSkipped} skipped (already reset)`;
  logger.info(`[LeaveReset] Job completed | ${summary}`);
  return summary;
};

module.exports = { run };
