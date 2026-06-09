import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: false,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
})

const FROM = process.env.SMTP_FROM ?? 'Nexus Unlock <noreply@nexusunlock.com>'

const base = (content: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#030712;color:#f9fafb;margin:0;padding:0}
.wrap{max-width:560px;margin:40px auto;background:#0d1117;border:1px solid #1f2937;border-radius:14px;overflow:hidden}
.header{background:#111827;padding:24px 32px;border-bottom:1px solid #1f2937}
.logo{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;color:#f9fafb}
.logo-icon{width:28px;height:28px;background:#2563eb;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:14px}
.body{padding:32px}
.code-box{background:#111827;border:1px solid #166534;border-radius:10px;padding:20px 24px;margin:24px 0;text-align:center}
.code{font-family:monospace;font-size:28px;font-weight:800;letter-spacing:4px;color:#86efac}
.code-label{font-size:12px;color:#4ade80;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.field{margin-bottom:12px;font-size:14px}
.field .lbl{color:#6b7280}
.field .val{color:#f9fafb;font-weight:500}
.footer{padding:20px 32px;border-top:1px solid #1f2937;font-size:12px;color:#4b5563}
p{margin:0 0 14px;font-size:15px;color:#d1d5db;line-height:1.6}
h2{margin:0 0 20px;font-size:20px;font-weight:700;color:#f9fafb}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo"><span class="logo-icon">📱</span> Nexus Unlock</div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">© ${new Date().getFullYear()} Nexus Unlock. This is an automated message.</div>
</div>
</body>
</html>`

export async function sendOrderSubmitted(opts: {
  to: string
  imei: string
  carrier: string
  orderId: string
  estimatedMinutes?: number
}) {
  if (!process.env.SMTP_USER) return // skip if email not configured

  await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Unlock order received — ${opts.carrier}`,
    html: base(`
      <h2>We received your unlock order ✓</h2>
      <p>Your order has been submitted to our unlock system and is being processed.</p>
      <div class="field"><span class="lbl">IMEI: </span><span class="val" style="font-family:monospace">${opts.imei}</span></div>
      <div class="field"><span class="lbl">Carrier: </span><span class="val">${opts.carrier}</span></div>
      <div class="field"><span class="lbl">Estimated time: </span><span class="val">${opts.estimatedMinutes ?? 60} minutes</span></div>
      <p>You'll receive another email as soon as your unlock code is ready. You can also check your <a href="${process.env.FRONTEND_URL}/dashboard/orders" style="color:#60a5fa">order dashboard</a> at any time.</p>
    `),
  })
}

export async function sendOrderCompleted(opts: {
  to: string
  imei: string
  carrier: string
  deviceBrand: string | null
  deviceModel: string | null
  unlockCode: string
}) {
  if (!process.env.SMTP_USER) return

  await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Your phone is ready to unlock! 🔓`,
    html: base(`
      <h2>Your unlock code is ready!</h2>
      <p>Great news — your unlock code has been generated. Use it to unlock your phone from ${opts.carrier}.</p>
      <div class="field"><span class="lbl">Device: </span><span class="val">${opts.deviceBrand ?? ''} ${opts.deviceModel ?? 'Unknown'}</span></div>
      <div class="field"><span class="lbl">IMEI: </span><span class="val" style="font-family:monospace">${opts.imei}</span></div>
      <div class="code-box">
        <div class="code-label">🔓 Your Unlock Code</div>
        <div class="code">${opts.unlockCode}</div>
      </div>
      <p><strong>How to use:</strong><br>1. Insert a SIM card from a different carrier.<br>2. Power on the phone — it will prompt for an unlock code.<br>3. Enter the code above and tap OK.<br>4. Your phone is now unlocked!</p>
      <p>Questions? Reply to this email or visit our <a href="${process.env.FRONTEND_URL}" style="color:#60a5fa">support page</a>.</p>
    `),
  })
}

export async function sendOrderFailed(opts: {
  to: string
  imei: string
  carrier: string
  reason?: string
}) {
  if (!process.env.SMTP_USER) return

  await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Unlock order issue — action needed`,
    html: base(`
      <h2>We encountered an issue with your order</h2>
      <p>Unfortunately, we were unable to complete the unlock for IMEI <strong>${opts.imei}</strong> on ${opts.carrier}.</p>
      ${opts.reason ? `<p>Reason: ${opts.reason}</p>` : ''}
      <p>A full refund has been issued to your account credits automatically. Please <a href="${process.env.FRONTEND_URL}" style="color:#60a5fa">contact support</a> if you need further assistance.</p>
    `),
  })
}

export async function sendWelcome(opts: { to: string; name: string }) {
  if (!process.env.SMTP_USER) return

  await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Welcome to Nexus Unlock!`,
    html: base(`
      <h2>Welcome${opts.name ? ', ' + opts.name : ''}!</h2>
      <p>Your account is ready. You can now submit unlock orders for any phone on any US carrier.</p>
      <p><a href="${process.env.FRONTEND_URL}/dashboard/new-unlock" style="color:#60a5fa;font-weight:600">→ Submit your first unlock</a></p>
      <p>Need help? Just reply to this email.</p>
    `),
  })
}
