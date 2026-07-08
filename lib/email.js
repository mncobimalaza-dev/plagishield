// lib/email.js
// Thin wrapper around the Resend REST API (free tier: 3,000 emails/month,
// 100/day). No SDK needed - it's a single JSON POST.
//
// IMPORTANT: until you verify your own domain in Resend, the default
// "onboarding@resend.dev" sender can only deliver to the email address you
// signed up to Resend with (a sandbox restriction). Verify a domain at
// resend.com/domains before relying on this for real users.

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  const from = process.env.EMAIL_FROM || 'PlagiShield <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
  return res.json();
}

module.exports = { sendEmail };
