import { ReferencesStepClient } from './ReferencesStepClient';

export default async function ImportReferencesPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ReferencesStepClient sessionId={sessionId} />;
}
