import * as Sw from "@radix-ui/react-switch";

export function Toggle({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Sw.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
      className="relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-line bg-s3 transition-colors duration-150 data-[state=checked]:bg-accent disabled:opacity-50"
    >
      <Sw.Thumb className="block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-[rgb(var(--text-2))] shadow transition-transform duration-150 ease-out data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </Sw.Root>
  );
}
