import { ValidateStepClient } from './ValidateStepClient';

export default async function ImportValidatePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ValidateStepClient sessionId={sessionId} />;
}
