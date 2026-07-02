import { AIProviders, STTProviders, LatencyPanel } from "./components";
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
    </PageLayout>
  );
};

export default DevSpace;
