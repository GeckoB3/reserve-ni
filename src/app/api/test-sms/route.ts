import { NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms';

// Set TEST_SMS_RECIPIENT in .env.local to a number verified in your Twilio console (required for trial accounts).
const TEST_RECIPIENT =
  process.env.TEST_SMS_RECIPIENT ?? '+447700900000';

export async function POST() {
  try {
    const result = await sendSMS(
      TEST_RECIPIENT,
      'Reserve NI test: SMS integration is working.'
    );
    return NextResponse.json({
      success: true,
      messageSid: result.sid,
      to: TEST_RECIPIENT,
    });
  } catch (error) {
    console.error('Test SMS failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      },
      { status: 500 }
    );
  }
}
