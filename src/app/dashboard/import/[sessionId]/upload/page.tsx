import { UploadStepClient } from './UploadStepClient';

export default async function ImportUploadPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <UploadStepClient sessionId={sessionId} />;
}
