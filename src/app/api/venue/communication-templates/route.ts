import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Legacy template endpoint has been replaced by communication policies.' },
    { status: 410 },
  );
}
