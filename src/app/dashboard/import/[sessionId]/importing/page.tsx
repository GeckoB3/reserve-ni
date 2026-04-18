import { ImportingStepClient } from './ImportingStepClient';

export default async function ImportingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ImportingStepClient sessionId={sessionId} />;
}
