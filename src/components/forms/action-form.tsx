"use client";

import { type ComponentProps, startTransition } from "react";

/**
 * Form bound to a `useActionState` action. Unlike `<form action>`, it does not
 * clear the fields after submitting, so people keep what they typed on errors.
 */
export function ActionForm({
  action,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { action: (data: FormData) => void }) {
  return (
    <form
      noValidate
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    />
  );
}
