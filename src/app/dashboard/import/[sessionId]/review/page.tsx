import { ReviewStepClient } from './ReviewStepClient';

export default async function ImportReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ReviewStepClient sessionId={sessionId} />;
}
