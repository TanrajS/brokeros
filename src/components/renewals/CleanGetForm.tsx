"use client";

import type { ComponentProps } from "react";

/**
 * A GET form that leaves empty fields out of the URL, so a shared link carries
 * only the active filters. Without JavaScript the page redirects to the same
 * canonical URL, so behaviour is identical either way.
 */
export function CleanGetForm(props: Omit<ComponentProps<"form">, "method" | "onSubmit">) {
  return (
    <form
      {...props}
      method="get"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const emptied: (HTMLInputElement | HTMLSelectElement)[] = [];
        for (const el of Array.from(form.elements)) {
          if ((el instanceof HTMLSelectElement || el instanceof HTMLInputElement) && el.name && el.value === "") {
            el.disabled = true;
            emptied.push(el);
          }
        }
        // Re-enable after the browser has captured the form data.
        setTimeout(() => emptied.forEach((el) => (el.disabled = false)), 0);
      }}
    />
  );
}
