// src/pages/api/send-email.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';

// Initialize Resend with the API key from your environment variables
const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.EMAIL_FROM;
const toEmail = process.env.EMAIL_TO;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { walletAddress, action } = req.body;

  if (!walletAddress || !action || !fromEmail || !toEmail) {
    return res.status(400).json({ error: 'Missing required fields in request body or environment variables.' });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `Azuki Airdrop Notifier <${fromEmail}>`,
      to: [toEmail],
      subject: `Wallet Activity: ${action}`,
      html: `
        <h1>Wallet Activity Report</h1>
        <p>A user performed an action on the airdrop page.</p>
        <ul>
          <li><strong>Action:</strong> ${action}</li>
          <li><strong>Wallet Address:</strong> <code>${walletAddress}</code></li>
          <li><strong>Timestamp:</strong> ${new Date().toUTCString()}</li>
        </ul>
      `,
    });

    if (error) {
      console.error('Resend API Error:', error);
      return res.status(400).json({ error: 'Failed to send email.' });
    }

    res.status(200).json({ message: 'Email sent successfully', data });
  } catch (exception) {
    console.error('Server Error:', exception);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
}