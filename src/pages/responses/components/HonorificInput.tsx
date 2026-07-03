import { Header } from "@/components";
import { updateHonorific } from "@/lib/storage/response-settings.storage";
import { useState, useEffect } from "react";
import { getResponseSettings } from "@/lib";

export const HonorificInput = () => {
  const [honorific, setHonorific] = useState<string>("sir");

  useEffect(() => {
    const settings = getResponseSettings();
    setHonorific(settings.honorific);
  }, []);

  const handleHonorificChange = (value: string) => {
    setHonorific(value);
    updateHonorific(value);
  };

  return (
    <div className="space-y-4">
      <Header
        title="Honorific"
        description="The title Krishna uses to address you (e.g. sir, ma'am, Sensei). Changes apply immediately."
        isMainTitle
      />

      <div className="max-w-md">
        <input
          type="text"
          value={honorific}
          onChange={(e) => handleHonorificChange(e.target.value)}
          placeholder="sir"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
};
