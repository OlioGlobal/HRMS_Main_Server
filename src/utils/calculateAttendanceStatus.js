/**
 * Calculate attendance status based on clock times and work policy.
 *
 * @param {Date}   clockInTime   — UTC clock-in time
 * @param {Date}   clockOutTime  — UTC clock-out time (can be null)
 * @param {Object} policy        — work policy snapshot
 * @param {string} policy.workStart              — "HH:mm" (employee's local time)
 * @param {string} policy.workEnd                — "HH:mm" (employee's local time)
 * @param {number} policy.graceMinutes
 * @param {number} policy.lateMarkAfterMinutes
 * @param {number} policy.halfDayThresholdHours
 * @param {number} policy.absentThresholdHours
 * @param {number} policy.overtimeThresholdHours
 * @param {Date}   dateRef       — the attendance date (UTC midnight)
 * @param {string} timezone      — employee's timezone (e.g. 'Asia/Kolkata')
 * @returns {Object} { status, isLate, lateByMinutes, totalHours, overtimeHours }
 */
const calculateAttendanceStatus = (clockInTime, clockOutTime, policy, dateRef, timezone = 'UTC') => {
  const result = {
    status: 'present',
    isLate: false,
    lateByMinutes: 0,
    totalHours: 0,
    overtimeHours: 0,
  };

  if (!clockInTime) {
    result.status = 'absent';
    return result;
  }

  // Build shift start in the employee's local timezone, then compare in UTC
  // dateRef is UTC midnight (e.g. 2026-03-11T00:00:00Z)
  // workStart is local time (e.g. "09:00" in Asia/Kolkata)
  // We need: what UTC time is "09:00 on 2026-03-11 in Asia/Kolkata"?
  const [startH, startM] = policy.workStart.split(':').map(Number);
  const shiftStartUTC = localTimeToUTC(dateRef, startH, startM, timezone);

  // Late calculation
  const clockInMs = clockInTime.getTime();
  const diffMinutes = Math.floor((clockInMs - shiftStartUTC.getTime()) / (1000 * 60));

  if (diffMinutes > policy.graceMinutes) {
    result.isLate = true;
    result.lateByMinutes = diffMinutes;
  }

  // No clock-out yet — can't calculate total hours or final status
  if (!clockOutTime) {
    if (diffMinutes > policy.lateMarkAfterMinutes) {
      result.status = 'late';
    }
    return result;
  }

  // Total hours worked
  const totalMs = clockOutTime.getTime() - clockInTime.getTime();
  result.totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100; // 2 decimal places

  // Status based on hours worked
  if (result.totalHours < policy.absentThresholdHours) {
    result.status = 'absent';
  } else if (result.totalHours < policy.halfDayThresholdHours) {
    result.status = 'half_day';
  } else if (diffMinutes > policy.lateMarkAfterMinutes) {
    result.status = 'late';
  } else {
    result.status = 'present';
  }

  // Overtime
  if (result.totalHours > policy.overtimeThresholdHours) {
    result.overtimeHours = Math.round((result.totalHours - policy.overtimeThresholdHours) * 100) / 100;
  }

  return result;
};

/**
 * Convert a local time (HH:mm) on a given date to a UTC Date object.
 *
 * Uses Intl.DateTimeFormat to figure out the UTC offset for that timezone
 * on that specific date (handles DST automatically).
 *
 * @param {Date}   dateRef  — the date (UTC midnight)
 * @param {number} hours    — local hour (0-23)
 * @param {number} minutes  — local minutes (0-59)
 * @param {string} tz       — IANA timezone (e.g. 'Asia/Kolkata')
 * @returns {Date} UTC Date
 */
const localTimeToUTC = (dateRef, hours, minutes, tz) => {
  if (tz === 'UTC') {
    const d = new Date(dateRef);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  // Get the date string from dateRef (YYYY-MM-DD)
  const year  = dateRef.getUTCFullYear();
  const month = dateRef.getUTCMonth();
  const day   = dateRef.getUTCDate();

  // Create a rough UTC estimate: assume the local time as UTC first
  const rough = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));

  // Format that rough time in the target timezone to see what local time it maps to
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(rough);

  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const localH = get('hour') === 24 ? 0 : get('hour');
  const localM = get('minute');

  // The difference between what we wanted (hours:minutes) and what we got
  // tells us the UTC offset adjustment needed
  const wantedMinutes = hours * 60 + minutes;
  const gotMinutes    = localH * 60 + localM;
  const offsetMinutes = gotMinutes - wantedMinutes;

  // Adjust: if the timezone is ahead (e.g. +5:30), the local time is ahead of UTC
  // so we need to subtract the offset to get the correct UTC time
  return new Date(rough.getTime() - offsetMinutes * 60 * 1000);
};

module.exports = { calculateAttendanceStatus, localTimeToUTC };
