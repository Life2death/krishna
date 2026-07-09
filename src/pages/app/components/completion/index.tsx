import { Input } from "./Input";
import { Files } from "./Files";

export const Completion = ({ isHidden }: { isHidden: boolean }) => {
  return (
    <>
      <Input isHidden={isHidden} />
      <Files />
    </>
  );
};
