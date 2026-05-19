import { NaukriLeloApiSetup, RecentJobs } from "./components";
import { PageLayout } from "@/layouts";

const Dashboard = () => {
  return (
    <PageLayout
      title="Dashboard"
      description="Focus Assistant — configure your API keys to get started."
    >
      <NaukriLeloApiSetup />
      <RecentJobs />
    </PageLayout>
  );
};

export default Dashboard;
