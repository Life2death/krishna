import { AIProviders, STTProviders, LatencyPanel, SpeechLogPanel, LiveVoiceControl } from "./components";
import Contribute from "@/components/Contribute";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const DevSpace = () => {
  const settings = useSettings();

  return (
    <PageLayout title="Dev Space" description="Manage your dev space">
      <Contribute />
      {/* Provider Selection */}
      <AIProviders {...settings} />

      {/* STT Providers */}
      <STTProviders {...settings} />

      {/* Latency Instrumentation (Phase 0) */}
      <div className="mt-6">
        <LatencyPanel />
      </div>

      {/* Speech log — every spoken utterance (T4-F7) */}
      <div className="mt-6">
        <SpeechLogPanel />
      </div>

      {/* Live Voice — Realtime audio session (Stage 1) */}
      <div className="mt-6">
        <LiveVoiceControl />
      </div>
    </PageLayout>
  );
};

export default DevSpace;
