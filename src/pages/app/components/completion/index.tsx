import { Input } from "./Input";
import { Screenshot } from "./Screenshot";
import { Files } from "./Files";

export const Completion = ({ isHidden }: { isHidden: boolean }) => {
  return (
    <>
      <Input isHidden={isHidden} />
      <Screenshot />
      <Files />
    </>
  );
};
