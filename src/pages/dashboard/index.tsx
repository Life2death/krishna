import { PageLayout } from "@/layouts";

const Dashboard = () => {
  return (
    <PageLayout
      title="Dashboard"
      description="Krishna — your AI voice assistant"
    >
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">
          Welcome to Krishna. Use the sidebar to configure providers and settings.
        </p>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
