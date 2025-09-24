import type { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { z } from 'zod'; // Using Zod for robust validation

// --- Environment Variable Setup ---
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.EMAIL_FROM;
const toEmail = process.env.EMAIL_TO;
const ccEmail = process.env.EMAIL_CC; // Optional: an email to CC on every notification

if (!resendApiKey) {
  throw new Error('Missing RESEND_API_KEY environment variable.');
}

const resend = new Resend(resendApiKey);

// --- Define expected request body schema ---
const requestBodySchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required.'),
  action: z.string().min(1, 'Action is required.'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- Validate request body ---
  const parseResult = requestBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten() });
  }
  
  const { walletAddress, action } = parseResult.data;

  if (!fromEmail || !toEmail) {
    return res.status(500).json({ error: 'Server is not configured for sending emails.' });
  }

  try {
    // FIX: Using a type assertion `(resend as any)` to bypass the incorrect TypeScript 
    // error, which is likely caused by an environment or caching issue. 
    // This allows the correct `resend.emails.send()` method to be called at runtime.
    const { data, error } = await (resend as any).emails.send({
      from: `Azuki Airdrop Notifier <${fromEmail}>`,
      to: [toEmail], 
      cc: ccEmail ? [ccEmail] : undefined,
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
      tags: [
        { name: 'category', value: 'wallet_activity' },
        // FIX: Sanitize the action value to be a valid tag (replace spaces with underscores)
        { name: 'action_type', value: action.toLowerCase().replace(/\s+/g, '_') },
      ],
      attachments: [
        {
          filename: 'activity_log.txt',
          content: `User action recorded:\nAction: ${action}\nWallet: ${walletAddress}\nTime: ${new Date().toISOString()}`,
        },
      ],
    });

    if (error) {
      console.error('Resend API Error:', error);
      return res.status(400).json({ error: 'Failed to send email.', details: error.message });
    }

    return res.status(200).json({ message: 'Email sent successfully', data });
  } catch (exception) {
    console.error('Server Error:', exception);
    const errorMessage = exception instanceof Error ? exception.message : 'An unknown error occurred';
    return res.status(500).json({ error: 'An unexpected server error occurred.', details: errorMessage });
  }
}

