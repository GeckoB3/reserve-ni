import { MapStepClient } from './MapStepClient';

export default async function ImportMapPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <MapStepClient sessionId={sessionId} />;
}
