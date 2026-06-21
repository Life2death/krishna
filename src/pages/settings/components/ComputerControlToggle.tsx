import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface ComputerControlToggleProps {
  className?: string;
}

export const ComputerControlToggle = ({ className }: ComputerControlToggleProps) => {
  const { customizable, toggleComputerControlEnabled } = useApp();

  const handleSwitchChange = async (checked: boolean) => {
    await toggleComputerControlEnabled(checked);
  };

  return (
    <div id="computer-control" className={`space-y-2 ${className}`}>
      <Header
        title="Computer Control"
        description="Lets Krishna control your keyboard and mouse — type text, press keys, and click. Only enable if you understand the risk."
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {customizable.computerControl.enabled
                ? "Computer Control Enabled"
                : "Computer Control Disabled"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {customizable.computerControl.enabled
                ? "Krishna can type, press keys, and click. Every action requires your voice confirmation."
                : "Krishna cannot type or click. Toggle on to allow keyboard and mouse control with per-action confirmation."}
            </p>
          </div>
        </div>
        <Switch
          checked={customizable.computerControl.enabled}
          onCheckedChange={handleSwitchChange}
          aria-label="Toggle computer control"
        />
      </div>
    </div>
  );
};
