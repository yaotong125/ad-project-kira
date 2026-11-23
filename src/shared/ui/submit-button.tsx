"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/**
 * lejar.ai's SubmitButton (chunk 635793): disabled and aria-busy while its form's
 * Server Action runs. Every submit button of the form shows the pending state.
 */
export function SubmitButton({ disabled, ...rest }: Omit<ButtonProps, "type">) {
  const { pending } = useFormStatus();
  return <Button {...rest} type="submit" disabled={pending || disabled} aria-busy={pending} />;
}
