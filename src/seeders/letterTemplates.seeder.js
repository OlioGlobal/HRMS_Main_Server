const LetterTemplate = require('../models/LetterTemplate');

// ─── Page break marker (splits into separate printed pages) ───────────────────
const PB = `<hr data-type="page-break">`;

// ─── Olio header / footer ─────────────────────────────────────────────────────
// Replace the <img> src below with your actual logo by clicking "Edit HTML → Upload Logo / Image" in the editor.
const OLIO_HEADER = `
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #dc2626;padding-bottom:10px;">
  <div>
    <!-- LOGO: upload your Olio logo via Edit HTML → Upload Logo / Image button in the editor -->
    <span style="font-size:22px;font-weight:bold;color:#dc2626;font-style:italic;letter-spacing:-0.5px;">Olio</span>
  </div>
  <div style="text-align:right;font-size:11px;line-height:1.8;color:#555;">
    <strong style="font-size:13px;color:#000;">{{company.name}}</strong><br>
    LLPIN: ABB-4484<br>
    GSTIN 27AAFLF00132H1Z3
  </div>
</div>`;

const OLIO_FOOTER = `
<div style="border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:10px;color:#6b7280;line-height:1.6;">
  <strong>{{company.name}}</strong><br>
  {{company.website}} | {{company.email}} | {{company.phone}}<br>
  <em>This document is confidential and intended for authorized personnel only. Unauthorized use, distribution, or disclosure is strictly prohibited and may result in legal action.</em>
</div>`;

// ─── APPOINTMENT LETTER — 8 pages ─────────────────────────────────────────────
const S  = 'margin-bottom:12px;text-align:justify;';   // standard paragraph
const H  = 'font-weight:bold;font-size:13px;text-transform:uppercase;margin:18px 0 8px 0;';  // section heading
const appointmentContent = `
<h2 style="text-align:center;font-weight:bold;font-size:15px;margin:22px 0 22px;">Employment Appointment Letter</h2>

<p style="margin-bottom:4px;"><strong>Date - {{meta.today}}</strong></p>

<p style="margin-top:16px;margin-bottom:2px;"><strong>To,</strong></p>
<p style="margin-bottom:2px;"><strong>{{employee.firstName}} {{employee.lastName}},</strong></p>
<p style="margin-bottom:18px;"><strong>{{employee.officeAddress}}</strong></p>

<p style="${S}">We are pleased to offer you a full-time position as <strong>{{employee.designation}}</strong> at <strong>{{company.name}}</strong>, following your successful completion of our selection process. Your appointment is a reflection of your qualifications, relevant experience, and the strengths demonstrated during your interactions with our team.</p>

<p style="${S}">Your employment with {{company.name}} will commence on <strong>{{employee.joiningDate}}</strong>. We request you to report to the <strong>{{employee.officeAddress}}</strong> office. At {{company.name}}, we take pride in being a hub of fresh ideas, innovation, and entrepreneurial spirit. We are confident that your journey here will be both professionally rewarding and personally enriching.</p>

<p style="${S}">We warmly welcome you to the {{company.name}} family and look forward to working with you to shape a meaningful and successful career path.</p>

<p style="margin-bottom:40px;text-align:justify;">Please sign and return a copy of this letter as a token of your acceptance.</p>

<p style="margin-bottom:56px;">Best regards,</p>

<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:1px;"><strong>Sarita Nikale</strong></p>
<p style="margin-bottom:1px;">HR Manager</p>
<p style="margin-bottom:1px;"><span style="color:#1d4ed8;">hrms@olioglobaladtech.com</span></p>
<p style="margin-bottom:0;">{{company.name}}, Mumbai</p>

${PB}

<p style="${H}">TERMS AND CONDITIONS OF EMPLOYMENT</p>
<p style="${S}">Please review this summary of terms and conditions for your anticipated employment with us.</p>

<p style="${H}">POSITION</p>
<p style="${S}">Your title will be <strong>{{employee.designation}}</strong>. This is a full-time position.</p>

<p style="font-weight:bold;margin:10px 0 4px;">Primary Reporting Manager (For overall operations, systems, processes)</p>
<p style="margin-bottom:10px;">Mr. Suraj Shinde – Operations Head &amp; SEO Manager | suraj@olioglobaladtech.com</p>

<p style="font-weight:bold;margin:0 0 4px;">For Escalations &amp; Strategic Inputs</p>
<p style="margin-bottom:14px;">Mr. Amol D. Salke – Director Marketing Head (Amol Salke, Siddhesh Mane, Suraj Shinde)</p>

<p style="${H}">OFFICE TIMING POLICY:&nbsp; HOURS OF WORK</p>
<p style="margin-bottom:10px;">→ &nbsp;<strong>The Working Hours Will Be From &nbsp;: {{policy.workStart}} To {{policy.workEnd}}</strong></p>
<p style="${S}">The company expects that every employee should be regular and punctual in attendance. This means being in the office, ready to work, at their starting time each day. If you are unable to report at work for any reason, notify your hierarchy before regular starting time. You are responsible for speaking directly with your hierarchy about your absence. It is not acceptable to leave a message on WhatsApp/text.</p>

<p style="${H}">LATE ARRIVALS/ FLEXIBILITY TO COME LATE</p>
<p style="${S}">Employees are required to arrive by 10 a.m. However, a flexi-entry between <strong>10 am and 7:00 pm</strong> will be allowed. An employee shall be exempted from late punch for maximum 30 minutes three times in a month. More than 30 minutes after these three times shall be considered as half day or half casual leave (CL), which will be deducted from the salary. This cannot be accumulated.</p>

<p style="${H}">MANDATORY WORKING HOURS</p>
<p style="${S}">It is mandatory for all employees to clock-in 9 hours each day. Failing so will be treated as a half day of absence from work. Repeated default will be considered as indiscipline and can lead to strict disciplinary action from the management.</p>

<p style="${H}">EARLY GOING</p>
<p style="${S}">An employee shall be exempted for early going once a month for two hours on any particular day, but it is very essential to inform one day in advance to complete urgent work. Except this, any one who would be leaving early before the office hours, that particular day shall be considered as a half a day. Which would be deducted from the salary or can be taken as half day cl. This cannot be accumulated.</p>

${PB}

<p style="${H}">WEEKLY OFFS</p>
<p style="${S}">Saturday and Sunday of the month will be the weekly off. Owing to work exigencies, an employee on an exceptional basis may be expected to work either on a weekly off or on a public holiday.</p>

<p style="${H}">REMUNERATION</p>
<p style="${S}">Your Gross Salary including all benefits will be <strong>INR {{salary.grossMonthly}}/- per month (payable in accordance with the company's standard payroll schedule)</strong>. This salary will be subject to adjustment pursuant to the company's employee compensation policies in effect from time to time. All forms of compensation referred to in this letter agreement are subject to reduction to reflect applicable withholding and payroll taxes and other deductions required by law. Statutory deductions (PF, ESI, Professional Tax, TDS) will be made as applicable under prevailing laws.</p>

<p style="font-weight:bold;margin:14px 0 8px;">Salary Structure:-</p>
{{salary.table}}
<p style="font-size:12px;color:#444;margin:8px 0 18px;">Gross Salary includes Basic, HRA, &amp; Other Allowances</p>

<p style="${H}">INCREMENTS AND PROMOTIONS</p>
<p style="${S}">Your performance and contribution to the company will be an important consideration for Incentives. Salary increments and promotions will be based on {{company.name}}'s Compensation, Progression and Promotion Policy.</p>

<p style="margin-bottom:8px;text-align:justify;"><strong>Compensation Policy:</strong> Salary reviews are conducted annually based on company performance, individual contribution, and market benchmarks.</p>
<p style="margin-bottom:8px;text-align:justify;"><strong>Progression Policy:</strong> Career advancement opportunities are provided based on performance evaluations, skill development, and business requirements.</p>

${PB}

<p style="margin-bottom:20px;text-align:justify;"><strong>Promotion Policy:</strong> Yearly promotions are merit-based, considering performance ratings, leadership potential, role availability, and organizational needs.</p>

<p style="${H}">TRAINING &amp; DEVELOPMENT</p>
<p style="${S}">All employees have to complete aligned Trainings and Development modules assigned to their stream in order to qualify for the next level/progression/promotion.</p>

<p style="${H}">EMPLOYEE BENEFITS</p>
<p style="${S}">As a regular employee of the company, you will be eligible to participate in a number of Company-sponsored benefits.</p>

<p style="${H}">LEAVES AND HOLIDAY POLICY</p>
<p style="${S}">The policy is designed to encourage all team members to take the vacation time they have earned each financial year. The {{company.name}} administration feels it is important for team members' well-being that they take their vacations.</p>

<p style="font-weight:bold;margin:14px 0 8px;">Summary</p>
<p style="margin-bottom:4px;">→ &nbsp;Total Earned leaves per year* &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;<strong>{{leave.annualLeaves}} Days</strong></p>
<p style="margin-bottom:4px;padding-left:20px;">(AL – 15 days, CL – 6 days, SL – 7 days.)</p>
<p style="margin-bottom:4px;">→ &nbsp;Total Festive Holidays per year &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;<strong>10 Days</strong></p>
<p style="margin-bottom:14px;">→ &nbsp;Special Day (Birthday or Anniversary Day) &nbsp;: &nbsp;<strong>01 Day</strong> (Included Total Earned leaves)</p>

<p style="margin-bottom:16px;text-align:justify;"><strong>Earned Leaves (EL):</strong> Not applicable during the probation period. Only <strong>Sick Leave (SL)</strong> is provided, with <strong>1 paid leave per month</strong> for the first 6 months of probation.</p>

<p style="${H}">LEAVES AND HOLIDAY POLICY</p>
<ol style="margin:0 0 8px 18px;padding:0;">
  <li style="margin-bottom:10px;text-align:justify;"><strong>Annual Leave Entitlement:</strong> You are entitled to {{leave.annualLeaves}} days of paid leave per calendar year, which includes sick leave and all planned absences. All leave requests must be submitted to your manager via email and HRM app with a minimum of 10 days' advance notice and require prior approval.</li>
  <li style="margin-bottom:10px;text-align:justify;"><strong>Festive Holidays:</strong> You will receive 10 days of festive holidays annually. The holiday schedule will be published and communicated by year-end via email or HRM app.</li>
  <li style="margin-bottom:10px;text-align:justify;"><strong>Special Day Off:</strong> You are entitled to one special day off annually for your birthday or wedding anniversary (based on official dates). This benefit does not apply if the date falls on a Sunday. Personal days are separate from your annual leave entitlement.</li>
  <li style="margin-bottom:10px;text-align:justify;"><strong>Leave Policy:</strong> Leave is applicable from 1st April to 31st March, in line with the financial year.Unused leave cannot be carried forward to the next year and will be forfeited.</li>
</ol>

${PB}

<p style="${H}" class="page-top-section">PROBATION PERIOD</p>
<p style="${S}">You will be on probation for <strong>{{manual.probationMonths}}</strong>. Your confirmation will be communicated to you over email or in person. {{company.name}} reserves the right to terminate your employment in case your performance, behavior and/or conduct during the probation period is found unsatisfactory.</p>

<p style="${H}">NOTICE PERIOD &amp; TERMINATION POLICY</p>
<p style="${S}">During your employment with {{company.name}}, including probation / training, either you or {{company.name}} can terminate the appointment by giving 60 calendar days written notice or 2 month's basic salary in lieu of the notice. {{company.name}} reserves the right, if it is in the interest of the business and current assignment, to ask you to complete your notice period or decide whether your existing earned vacation or basic salary in lieu of notice period may be adjusted against the entire or partial notice period.</p>

<p style="${H}">JOINING DOCUMENTS</p>
<p style="margin-bottom:8px;text-align:justify;">To ensure a smooth onboarding process, please submit the following documents on your joining date (scanned copies after original verification):</p>
<ul style="margin:0 0 16px 20px;padding:0;">
  <li style="margin-bottom:6px;">All academic certificates</li>
  <li style="margin-bottom:6px;">Experience letter from your previous employer</li>
  <li style="margin-bottom:6px;">Last 3 months' salary slips</li>
  <li style="margin-bottom:6px;">Personal identification proof (Passport, Driving License, or equivalent)</li>
</ul>

<p style="${H}">RULES AND REGULATIONS</p>
<p style="${S}">Your appointment will be governed by the policies, rules, regulations, practices, processes and procedures of {{company.name}} as applicable to you and the changes therein from time to time.</p>

<p style="${H}">OFFER ACCEPTANCE AND VALIDITY</p>
<p style="margin-bottom:12px;text-align:justify;"><strong>Compliance Requirements:</strong> You must fulfill all terms and conditions outlined in this offer letter. Failure to comply with any provision may result in withdrawal of this offer at the company's discretion.</p>

${PB}

<p style="margin-bottom:12px;text-align:justify;"><strong>Acceptance Timeline:</strong> This offer must be accepted within 7 days of receipt. Failure to respond within this timeframe will be considered as declination, and the offer will be automatically withdrawn.</p>
<p style="margin-bottom:18px;text-align:justify;"><strong>Joining Timeline:</strong> Upon acceptance, you must join within 7 days of the agreed joining date. Failure to do so will result in automatic termination of this offer.</p>

<p style="${H}">EMPLOYMENT CONDITIONS</p>
<p style="margin-bottom:10px;text-align:justify;"><strong>Conflict of Interest:</strong> During your employment with {{company.name}} Adtech LLP, you shall not engage in any other employment, consulting, or business activities (full-time or part-time) that create a conflict of interest with the company.</p>
<p style="margin-bottom:10px;text-align:justify;"><strong>Prior Commitments:</strong> By accepting this offer, you confirm that you have no existing contractual commitments or legal obligations that would prevent you from fulfilling your duties with the company.</p>
<p style="margin-bottom:18px;text-align:justify;"><strong>Compensation Confidentiality:</strong> Your compensation information is strictly confidential and must not be disclosed to anyone except senior management, unless required for tax, legal, or regulatory purposes. Any unauthorized disclosure will constitute a breach of agreement.</p>

<p style="${H}">CONFIDENTIALITY AGREEMENT</p>
<p style="margin-bottom:8px;text-align:justify;"><strong>Confidential Information</strong> includes all proprietary information and trade secrets of the company, including but not limited to:</p>
<ul style="margin:0 0 10px 20px;padding:0;">
  <li style="margin-bottom:5px;">Business affairs, products, financial data, cost information, marketing and sales plans</li>
  <li style="margin-bottom:5px;">Client lists, prospects, pricing information, supplier details</li>
  <li style="margin-bottom:5px;">Computer databases, software, and technical systems</li>
  <li style="margin-bottom:5px;">Research data, inventions, designs, processes, and specifications</li>
  <li style="margin-bottom:5px;">Staff details and employment records</li>
  <li style="margin-bottom:5px;">Any copies of the above information not publicly available</li>
</ul>

${PB}

<p style="font-weight:bold;font-size:13px;margin:0 0 10px;">Your Obligations</p>
<p style="margin-bottom:8px;">You agree to:</p>

<p style="font-weight:bold;margin:0 0 6px;">Maintain Confidentiality:</p>
<ul style="margin:0 0 12px 20px;padding:0;">
  <li style="margin-bottom:5px;">Keep all confidential information strictly confidential</li>
  <li style="margin-bottom:5px;">Not disclose confidential information except:
    <ul style="margin:4px 0 0 18px;padding:0;">
      <li style="margin-bottom:3px;">As required by law</li>
      <li style="margin-bottom:3px;">With prior written company consent</li>
      <li style="margin-bottom:3px;">To authorized company personnel in performance of your duties</li>
    </ul>
  </li>
</ul>

<p style="font-weight:bold;margin:0 0 6px;">Protect Information:</p>
<ul style="margin:0 0 12px 20px;padding:0;">
  <li style="margin-bottom:5px;">Prevent unauthorized use or disclosure by third parties</li>
  <li style="margin-bottom:5px;">Maintain secure custody of all confidential materials</li>
  <li style="margin-bottom:5px;">Use confidential information solely for company purposes</li>
</ul>

<p style="font-weight:bold;margin:0 0 6px;">Information Classification:</p>
<ul style="margin:0 0 12px 20px;padding:0;">
  <li style="margin-bottom:5px;">When uncertain whether information is confidential, treat it as confidential until advised otherwise in writing</li>
  <li style="margin-bottom:5px;">Additional confidentiality agreements may be required for particularly sensitive information</li>
</ul>

<p style="font-weight:bold;margin:0 0 8px;">Return of Materials</p>
<p style="margin-bottom:8px;text-align:justify;">Upon termination of employment or upon request, you must immediately return all confidential information in physical or digital form, including:</p>
<ul style="margin:0 0 12px 20px;padding:0;">
  <li style="margin-bottom:5px;">Email ID &amp; Drive Access with credentials</li>
  <li style="margin-bottom:5px;">Documents, manuals, and written materials</li>
  <li style="margin-bottom:5px;">Computer files, databases, and storage media</li>
  <li style="margin-bottom:5px;">All copies and derivatives of confidential information</li>
</ul>

<p style="font-weight:bold;margin:0 0 6px;">Continuing Obligations</p>
<ul style="margin:0 0 10px 20px;padding:0;">
  <li style="margin-bottom:5px;">These confidentiality obligations commence from your first day of employment</li>
  <li style="margin-bottom:5px;">Obligations survive termination of employment indefinitely</li>
  <li style="margin-bottom:5px;">The company may enforce these obligations through legal proceedings</li>
</ul>

${PB}

<p style="${H}">ACCEPTANCE</p>
<p style="margin-bottom:14px;">By signing below, I: <strong>{{employee.firstName}} {{employee.lastName}}</strong></p>
<ul style="margin:0 0 10px 20px;padding:0;">
  <li style="margin-bottom:6px;">Accept this appointment under the stated terms and conditions</li>
  <li style="margin-bottom:6px;">Agree to comply with all company rules and regulations, current and future</li>
  <li style="margin-bottom:6px;">Confirm that I have read and understood all employment terms outlined in this letter.</li>
</ul>

<p style="margin-top:48px;margin-bottom:2px;font-weight:bold;">Sign</p>
<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:20px;"><strong>{{employee.firstName}} {{employee.lastName}}</strong></p>

<p style="margin-bottom:48px;">Best regards,</p>

<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:1px;"><strong>Sarita Nikale</strong></p>
<p style="margin-bottom:1px;">HR Manager</p>
<p style="margin-bottom:1px;"><span style="color:#1d4ed8;">hrms@olioglobaladtech.com</span></p>
<p style="margin-bottom:12px;">{{company.name}}, Mumbai</p>

<p style="margin-bottom:2px;"><strong>Date:</strong> <strong>{{meta.today}}</strong></p>
<p style="margin-bottom:0;"><strong>Location: Mumbai</strong></p>
`;

// ─── INTERIM OFFER LETTER ─────────────────────────────────────────────────────
const interimOfferContent = `
<p style="margin-bottom:4px;"><strong>Date: {{meta.today}}</strong></p>

<p style="margin-top:16px;margin-bottom:2px;">To,</p>
<p style="margin-bottom:16px;"><strong>{{employee.firstName}} {{employee.lastName}}</strong> &nbsp;<strong>{{employee.officeAddress}}</strong></p>

<hr style="border:none;border-top:1px solid #aaa;margin:0 0 14px;">

<p style="margin-bottom:14px;font-size:13px;"><strong style="color:#c00;">Subject: Interim Offer for the Position of {{employee.designation}}</strong></p>

<p style="margin-bottom:14px;"><strong>Dear {{employee.firstName}} {{employee.lastName}}</strong></p>

<p style="font-weight:bold;margin-bottom:12px;">Heartiest Congratulations!</p>

<p style="margin-bottom:12px;text-align:justify;">After exploring career opportunities with Olio Global AdTech, we are pleased to offer you the position of <strong>{{employee.designation}}</strong> at Olio Creative Digital Agency, Mumbai. <strong>({{employee.location}})</strong></p>

<p style="margin-bottom:12px;text-align:justify;">Based on your profile, relevant experience, and performance during the selection process, we find you a suitable candidate for this role.</p>

<p style="margin-bottom:12px;text-align:justify;">Your professional journey with Olio — a hub of innovation, growth, and dynamic enterprise — is scheduled to begin on <strong>{{employee.joiningDate}}</strong>. We request you to adhere to the given timeline for joining.</p>

<p style="margin-bottom:12px;text-align:justify;">As per our discussion, your compensation will be a <strong>Yearly CTC of INR {{salary.ctcAnnual}}/-</strong>, subject to applicable statutory deductions.</p>

<p style="margin-bottom:40px;text-align:justify;">Please confirm your acceptance of this offer at the earliest. We warmly welcome you to the Olio family and look forward to a successful journey together. The original appointment letter will be provided on your joining day at Olio Global Adtech.</p>

<p style="margin-bottom:4px;">Warm regards,</p>
<p style="margin-bottom:48px;">Best regards,</p>

<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:1px;"><strong>Sarita Nikale</strong></p>
<p style="margin-bottom:1px;">HR Manager</p>
<p style="margin-bottom:1px;"><span style="color:#1d4ed8;">hrms@olioglobaladtech.com</span></p>
<p>Olio Global AdTech LLP, Mumbai</p>
`;

// ─── EXPERIENCE LETTER ────────────────────────────────────────────────────────
const experienceContent = `
<p style="margin-bottom:4px;"><strong>Date: {{meta.today}}</strong></p>

<p style="margin-top:16px;margin-bottom:2px;"><strong>Name: {{employee.firstName}} {{employee.lastName}}</strong></p>
<p style="margin-bottom:18px;"><strong>Designation: {{employee.designation}}</strong></p>

<p style="margin-bottom:16px;"><strong>Subject: Experience Letter</strong></p>

<p style="margin-bottom:16px;"><strong>Dear {{employee.firstName}} {{employee.lastName}},</strong></p>

<p style="margin-bottom:12px;text-align:justify;">This is to certify that <strong>{{employee.firstName}} {{employee.lastName}}</strong> was employed with Olio Global AdTech as a <strong>{{employee.designation}}</strong> from <strong>{{employee.joiningDate}}</strong> Till <strong>{{manual.lastWorkingDate}}</strong>. During their tenure, they consistently demonstrated professionalism, dedication, and a strong understanding of their responsibilities. They contributed effectively to <strong>{{manual.workDetails}}</strong>.</p>

<p style="margin-bottom:12px;text-align:justify;">Throughout their time with us, <strong>{{employee.firstName}}</strong> met performance expectations and carried out their tasks with sincerity and commitment.</p>

<p style="margin-bottom:44px;text-align:justify;">We are confident that they will continue to grow and succeed in their future endeavors. We wish them all the very best for their continued success.</p>

<p style="margin-bottom:52px;">Best regards,</p>

<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:1px;"><strong>Sarita Nikale</strong></p>
<p style="margin-bottom:1px;">HR Manager</p>
<p style="margin-bottom:1px;"><span style="color:#1d4ed8;">hrms@olioglobaladtech.com</span></p>
<p>Olio Global AdTech LLP, Mumbai</p>
`;

// ─── INCREMENT / APPRAISAL LETTER ─────────────────────────────────────────────
const incrementContent = `
<p style="margin-bottom:4px;"><strong>Date {{meta.today}}</strong></p>

<p style="margin-top:16px;margin-bottom:2px;">To:</p>
<p style="margin-bottom:2px;"><strong>{{employee.firstName}} {{employee.lastName}}</strong></p>
<p style="margin-bottom:2px;"><strong>{{employee.designation}}</strong></p>
<p style="margin-bottom:20px;"><strong>{{employee.officeAddress}}</strong></p>

<p style="text-align:center;margin-bottom:20px;font-size:13px;"><strong>Subject: Salary Increment Letter</strong></p>

<p style="margin-bottom:14px;"><strong>Dear {{employee.firstName}} {{employee.lastName}},</strong></p>

<p style="font-weight:bold;margin-bottom:12px;">Heartiest Congratulations!</p>

<p style="margin-bottom:12px;text-align:justify;">We are pleased to extend our sincere appreciation for the passion, dedication, and commitment you have consistently demonstrated in your role.</p>

<p style="margin-bottom:12px;text-align:justify;">This letter formally acknowledges your valuable contribution as an <strong>{{employee.designation}}</strong> at Olio Global AdTech, where you have been employed since <strong>{{employee.joiningDate}}</strong>.</p>

<p style="margin-bottom:12px;text-align:justify;">Following a comprehensive review of your performance from <strong>{{manual.appraisalPeriod}}</strong>, we are delighted to inform you that, effective <strong>{{manual.effectiveDate}}</strong>, your monthly basic salary will be <strong>increased by {{manual.incrementPercent}}</strong>, from <strong>INR {{manual.previousSalary}}</strong> to <strong>INR {{salary.grossMonthly}}</strong>. In recognition of your contributions and growth, you are also being promoted to the role of <strong>{{manual.newDesignation}}</strong>, effective from the same date.</p>

<p style="margin-bottom:20px;text-align:justify;">Once again, congratulations on this well-deserved recognition.</p>

${PB}

<p style="font-weight:bold;margin:8px 0 16px;">Salary Structure:-</p>
{{salary.table}}

<p style="font-weight:bold;color:#b45309;margin:24px 0 8px;font-size:13px;">New Role &amp; Responsibilities:- &nbsp;({{manual.newRoleTitle}})</p>

<p style="margin-bottom:12px;text-align:justify;">As part of this promotion, your new role will encompass the following responsibilities:</p>

<ol style="margin:0 0 24px 18px;padding:0;">
  <li style="margin-bottom:10px;"><strong>Strategic Planning</strong><br><span style="text-align:justify;display:block;">Develop and implement data-driven strategies aligned with business goals.</span></li>
  <li style="margin-bottom:10px;"><strong>Team Leadership</strong><br><span style="text-align:justify;display:block;">Lead and support the team to enhance performance, foster collaboration, and encourage innovation.</span></li>
  <li style="margin-bottom:10px;"><strong>Technical Oversight</strong><br><span style="text-align:justify;display:block;">Identify and resolve technical issues to boost operational health and visibility.</span></li>
  <li style="margin-bottom:10px;"><strong>Content &amp; Process Optimization</strong><br><span style="text-align:justify;display:block;">Collaborate on strategies to enhance performance, user engagement, and search rankings.</span></li>
  <li style="margin-bottom:10px;"><strong>Performance Monitoring &amp; Reporting</strong><br><span style="text-align:justify;display:block;">Track and analyze key metrics to deliver actionable insights and performance reports.</span></li>
  <li style="margin-bottom:10px;"><strong>Client Communication</strong><br><span style="text-align:justify;display:block;">Maintain proactive, clear, and timely communication with clients, providing updates, insights, and strategic guidance.</span></li>
  <li style="margin-bottom:10px;"><strong>Cross-Functional Collaboration</strong><br><span style="text-align:justify;display:block;">Work closely with development, content, and marketing teams to align efforts with broader business initiatives.</span></li>
</ol>

<p style="margin-bottom:40px;text-align:justify;">All other terms and conditions of your employment remain unchanged. We look forward to your continued growth and contribution to {{company.name}}.</p>

<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:1px;"><strong>Sarita Nikale</strong></p>
<p style="margin-bottom:1px;">HR Manager</p>
<p style="margin-bottom:1px;"><span style="color:#1d4ed8;">hrms@olioglobaladtech.com</span></p>
<p>Olio Global AdTech LLP, Mumbai</p>
`;

// ─── RELIEVING LETTER ─────────────────────────────────────────────────────────
const relievingContent = `
<p style="margin-bottom:4px;"><strong>Date: {{meta.today}}</strong></p>

<p style="margin-top:16px;margin-bottom:2px;"><strong>Name: {{employee.firstName}} {{employee.lastName}}</strong></p>
<p style="margin-bottom:18px;"><strong>Designation: {{employee.designation}}</strong></p>

<p style="margin-bottom:16px;"><strong>Subject: Relieving Order</strong></p>

<p style="margin-bottom:16px;"><strong>Dear {{employee.firstName}} {{employee.lastName}},</strong></p>

<p style="margin-bottom:12px;text-align:justify;">This letter serves as confirmation that your resignation from Olio Global AdTech has been accepted.</p>

<p style="margin-bottom:12px;text-align:justify;">We would like to take this opportunity to express our sincere appreciation for your valuable contributions during your time with us. Your last working day will be <strong>{{manual.lastWorkingDate}}</strong>. We kindly request that you complete any pending tasks and return any company property in your possession before your departure.</p>

<p style="margin-bottom:48px;text-align:justify;">We wish you the very best in all your future endeavors.</p>

<p style="margin-bottom:52px;">Best regards,</p>

<p style="margin-bottom:2px;">_______________________</p>
<p style="margin-bottom:1px;"><strong>Sarita Nikale</strong></p>
<p style="margin-bottom:1px;">HR Manager</p>
<p style="margin-bottom:1px;"><span style="color:#1d4ed8;">hrms@olioglobaladtech.com</span></p>
<p>Olio Global AdTech LLP, Mumbai</p>
`;

// ─── Template definitions ──────────────────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    name:         'Interim Offer Letter',
    letterType:   'interim_offer',
    category:     'pre_join',
    content:      interimOfferContent,
    headerHtml:   OLIO_HEADER,
    footerHtml:   OLIO_FOOTER,
    signatoryName:  'Sarita Nikale',
    signatoryTitle: 'HR Manager',
    signatoryEmail: 'hrms@olioglobaladtech.com',
    isDefault:    true,
    manualVariables: [],
  },
  {
    name:         'Appointment Letter',
    letterType:   'appointment',
    category:     'pre_join',
    content:      appointmentContent,
    headerHtml:   OLIO_HEADER,
    footerHtml:   OLIO_FOOTER,
    signatoryName:  'Sarita Nikale',
    signatoryTitle: 'HR Manager',
    signatoryEmail: 'hrms@olioglobaladtech.com',
    isDefault:    true,
    manualVariables: [
      { key: 'probationMonths', label: 'Probation Period (e.g. 06 Months)', inputType: 'text', required: true },
    ],
  },
  {
    name:         'Experience Certificate',
    letterType:   'experience',
    category:     'exit',
    content:      experienceContent,
    headerHtml:   OLIO_HEADER,
    footerHtml:   OLIO_FOOTER,
    signatoryName:  'Sarita Nikale',
    signatoryTitle: 'HR Manager',
    signatoryEmail: 'hrms@olioglobaladtech.com',
    isDefault:    true,
    manualVariables: [
      { key: 'lastWorkingDate', label: 'Last Working Date', inputType: 'date', required: true },
      { key: 'workDetails',     label: 'Work Details / Responsibilities (e.g. SEO activities, On-Page, Off-Page)', inputType: 'text', required: true },
    ],
  },
  {
    name:         'Increment / Appraisal Letter',
    letterType:   'increment',
    category:     'employment',
    content:      incrementContent,
    headerHtml:   OLIO_HEADER,
    footerHtml:   OLIO_FOOTER,
    signatoryName:  'Sarita Nikale',
    signatoryTitle: 'HR Manager',
    signatoryEmail: 'hrms@olioglobaladtech.com',
    isDefault:    true,
    manualVariables: [
      { key: 'appraisalPeriod',  label: 'Performance Review Period (e.g. Jan 2024 – Dec 2024)', inputType: 'text', required: true },
      { key: 'effectiveDate',    label: 'Effective Date of Increment',                           inputType: 'date', required: true },
      { key: 'incrementPercent', label: 'Increment Percentage (e.g. 20%)',                       inputType: 'text', required: true },
      { key: 'previousSalary',   label: 'Previous Gross Salary (e.g. 15,000)',                   inputType: 'text', required: true },
      { key: 'newDesignation',   label: 'New Designation / Role',                                inputType: 'text', required: true },
      { key: 'newRoleTitle',     label: 'New Role Title for Responsibilities (e.g. SEO Manager)',inputType: 'text', required: false },
    ],
  },
  {
    name:         'Relieving Letter',
    letterType:   'relieving',
    category:     'exit',
    content:      relievingContent,
    headerHtml:   OLIO_HEADER,
    footerHtml:   OLIO_FOOTER,
    signatoryName:  'Sarita Nikale',
    signatoryTitle: 'HR Manager',
    signatoryEmail: 'hrms@olioglobaladtech.com',
    isDefault:    true,
    manualVariables: [
      { key: 'lastWorkingDate', label: 'Last Working Date', inputType: 'date', required: true },
    ],
  },
];

// ─── Seeder ────────────────────────────────────────────────────────────────────
const seedDefaultLetterTemplates = async (companyId) => {
  for (const tpl of DEFAULT_TEMPLATES) {
    const exists = await LetterTemplate.findOne({ company_id: companyId, letterType: tpl.letterType, isDefault: true });
    if (exists) continue; // already seeded — never overwrite user edits
    await LetterTemplate.create({ company_id: companyId, isActive: true, version: 1, ...tpl });
  }
};

module.exports = { seedDefaultLetterTemplates };
