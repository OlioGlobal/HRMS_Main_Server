/**
 * Shared HTML email builder for every notification email.
 *
 * Produces Handlebars-ready strings — placeholders like {{employeeName}} pass straight
 * through and are compiled later by the rule engine. Design goals:
 *   • compact, centered card (max 480px) so text never feels stretched
 *   • hairline borders + tight, even padding
 *   • clear type scale, comfortable line-height, emoji icon badge per rule
 *   • light + dark color-scheme support
 *   • table-free but broadly compatible (Gmail / Apple Mail / Outlook web)
 *
 * Usage:
 *   buildEmail({ accent, icon, iconBg, title, greeting, intro, rows, extraHtml, note })
 */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ── Reusable pieces ──────────────────────────────────────────────────────────

/** Key/value info panel. rows = [[label, value], ...] */
const panel = (rows) =>
  rows && rows.length
    ? `<div class="panel">${rows
        .map(
          ([k, v]) =>
            `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`
        )
        .join('')}</div>`
    : '';

/** Action buttons. btns = [{ label, url, bg, color }] */
const buttons = (btns) =>
  btns && btns.length
    ? `<div class="btns">${btns
        .map(
          (b) =>
            `<a class="btn" href="${b.url}" style="background:${b.bg || '#6366f1'};color:${
              b.color || '#ffffff'
            };">${b.label}</a>`
        )
        .join('')}</div>`
    : '';

// ── Shell ────────────────────────────────────────────────────────────────────

const shell = ({ accent = '#6366f1', preheader = '', content }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>{{companyName}}</title>
<style>
  body{margin:0;padding:0;width:100%!important;background:#eef0f3;-webkit-font-smoothing:antialiased;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  .wrap{width:100%;background:#eef0f3;padding:32px 14px;}
  .card{max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(24,24,27,.06);}
  /* Header */
  .hd{background:#18181b;padding:24px 28px;text-align:center;}
  .hd .mark{display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};vertical-align:middle;margin:0 9px 2px 0;}
  .hd .brand{font-family:${FONT};font-size:17px;font-weight:700;color:#fafafa;letter-spacing:.3px;vertical-align:middle;}
  .accent{height:4px;background:${accent};}
  /* Body */
  .bd{padding:28px 28px 8px;color:#27272a;font-family:${FONT};}
  .icon{width:46px;height:46px;line-height:46px;text-align:center;font-size:23px;border-radius:13px;margin:0 0 16px;}
  h1.t{margin:0 0 8px;font-size:20px;font-weight:700;color:#18181b;letter-spacing:-.35px;line-height:1.3;}
  p.x{margin:0 0 12px;font-size:15px;line-height:1.65;color:#3f3f46;}
  p.x strong{color:#18181b;font-weight:600;}
  .panel{border:1px solid #ececee;border-radius:13px;margin:18px 0;overflow:hidden;}
  .row{padding:11px 15px;border-bottom:1px solid #f2f2f4;}
  .row:last-child{border-bottom:0;}
  .row .k{color:#8a8a94;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;margin:0 0 3px;}
  .row .v{color:#18181b;font-weight:600;font-size:14.5px;line-height:1.45;}
  .btns{text-align:center;margin:22px 0 10px;}
  .btn{display:inline-block;padding:12px 28px;border-radius:11px;font-size:14.5px;font-weight:600;text-decoration:none;margin:5px;}
  .note{font-size:12.5px;color:#a1a1aa;line-height:1.55;margin:16px 0 0;}
  .ft{padding:18px 28px 26px;border-top:1px solid #f1f1f3;text-align:center;}
  .ft p{margin:0;font-size:11px;color:#b4b4bb;line-height:1.55;font-family:${FONT};}
  /* Mobile */
  @media only screen and (max-width:520px){
    .wrap{padding:0!important;}
    .card{max-width:100%!important;width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important;box-shadow:none!important;}
    .hd{padding:20px 18px!important;}
    .hd .brand{font-size:16px!important;}
    .bd{padding:24px 18px 4px!important;}
    h1.t{font-size:19px!important;}
    p.x{font-size:15px!important;line-height:1.6!important;}
    .panel{margin:16px 0!important;}
    .row{padding:11px 13px!important;}
    .btns{margin:20px 0 6px!important;}
    .btn{display:block!important;margin:9px 0!important;padding:13px 20px!important;}
    .ft{padding:16px 18px 22px!important;}
  }
  /* Dark mode */
  @media (prefers-color-scheme:dark){
    body,.wrap{background:#09090b!important;}
    .card{background:#161618!important;border-color:#27272a!important;box-shadow:none!important;}
    .hd{background:#0f0f11!important;}
    .bd{color:#e4e4e7!important;}
    h1.t{color:#fafafa!important;}
    p.x{color:#c4c4cc!important;}
    p.x strong{color:#fafafa!important;}
    .panel{border-color:#2a2a2e!important;}
    .row{border-color:#242427!important;}
    .row .v{color:#fafafa!important;}
    .ft{border-color:#242427!important;}
  }
</style>
</head>
<body>
<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</span>
<div class="wrap">
  <div class="card">
    <div class="hd"><span class="mark"></span><span class="brand">{{companyName}}</span></div>
    <div class="accent"></div>
    <div class="bd">${content}</div>
    <div class="ft"><p>Automated message from {{companyName}} · please don't reply directly.</p></div>
  </div>
</div>
</body>
</html>`;

// ── High-level builder ───────────────────────────────────────────────────────

/**
 * Compose a complete email body.
 * @param {object} o
 * @param {string} o.accent    - accent color (hex)
 * @param {string} o.icon      - emoji shown in the badge
 * @param {string} o.iconBg    - badge background (light tint hex)
 * @param {string} o.title     - main heading
 * @param {string} [o.greeting]- e.g. "Hi {{recipientName}},"
 * @param {string} [o.intro]   - lead paragraph (may contain <strong>)
 * @param {Array}  [o.rows]    - info panel rows [[label, value]]
 * @param {string} [o.extraHtml] - raw HTML appended after the panel (e.g. CTA blocks)
 * @param {string} [o.note]    - small muted footnote inside the body
 * @param {string} [o.preheader] - inbox preview text
 */
const buildEmail = ({
  accent = '#6366f1',
  icon = '🔔',
  iconBg = '#eef2ff',
  title,
  greeting,
  intro,
  rows,
  extraHtml = '',
  note,
  preheader,
}) => {
  const parts = [];
  if (icon) parts.push(`<div class="icon" style="background:${iconBg};">${icon}</div>`);
  if (title) parts.push(`<h1 class="t">${title}</h1>`);
  if (greeting) parts.push(`<p class="x">${greeting}</p>`);
  if (intro) parts.push(`<p class="x">${intro}</p>`);
  const p = panel(rows);
  if (p) parts.push(p);
  if (extraHtml) parts.push(extraHtml);
  if (note) parts.push(`<p class="note">${note}</p>`);
  return shell({ accent, preheader: preheader || title || '', content: parts.join('\n') });
};

module.exports = { buildEmail, shell, panel, buttons };
