import { Suspense } from "react";
import { MemeView } from "@/components/MemeView";

export default function MemePage({ params }: { params: Promise<{ memeId: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <Meme params={params} />
    </Suspense>
  );
}

async function Meme({ params }: { params: Promise<{ memeId: string }> }) {
  const { memeId } = await params;
  return <MemeView memeId={memeId} />;
}
